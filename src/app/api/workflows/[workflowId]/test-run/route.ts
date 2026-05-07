import { NextResponse } from "next/server";

import {
  hasRequiredProviderScopes,
  PROVIDER_META,
  type ConnectionState,
  type IntegrationProvider,
} from "@/lib/provider-catalog";
import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { convexQuery } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";
import type { WorkflowRunSummary } from "@/lib/workflow-model";
import {
  ProviderAuthError,
  fetchProviderMailboxSnapshot,
  fetchProviderTodayMessageDigest,
  type ProviderTodayMessageDigest,
  refreshProviderAccessToken,
} from "@/lib/server/oauth";

type ExecutionConnection = {
  provider: IntegrationProvider;
  status: ConnectionState;
  email?: string;
  scopes: string[];
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

type ExecutionContext = {
  workflow: {
    _id: string;
    name: string;
    prompt: string;
    description: string;
    requirements: IntegrationProvider[];
  };
  connections: ExecutionConnection[];
};

function wantsTodayMessageDigest(workflow: ExecutionContext["workflow"]) {
  const text = [workflow.name, workflow.prompt, workflow.description].join(" ");

  return /\btoday'?s?\b/i.test(text)
    && /\b(messages?|emails?|mail)\b/i.test(text)
    && /\b(summary|summarize|digest|recap|brief)\b/i.test(text);
}

function getTopValues(values: string[], limit: number) {
  const counts = new Map<string, { value: string; count: number }>();

  for (const value of values) {
    const compact = value.trim();

    if (!compact) {
      continue;
    }

    const key = compact.toLowerCase();
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, { value: compact, count: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((entry) => entry.value);
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function cleanSubject(subject: string) {
  return subject.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim() || "No subject";
}

function buildCombinedTodayDigestMessage(
  digests: ProviderTodayMessageDigest[],
  reconnectLabels: string[],
) {
  const reviewedCount = digests.reduce((sum, digest) => sum + digest.reviewedCount, 0);
  const messages = digests.flatMap((digest) => digest.messages);
  const unreadCount = messages.filter((message) => message.isUnread).length;
  const urgentCount = messages.filter((message) =>
    /urgent|asap|follow up|follow-up|action required|deadline/i.test(
      `${message.subject} ${message.preview}`,
    ),
  ).length;
  const topSenders = getTopValues(messages.map((message) => message.from), 3);
  const topSubjects = getTopValues(messages.map((message) => cleanSubject(message.subject)), 4);
  const providerLabels = digests.map((digest) => PROVIDER_META[digest.provider].label);
  const parts = [
    reviewedCount > 0
      ? `Today's inbox digest reviewed ${reviewedCount} messages across ${joinLabels(providerLabels)}.`
      : "No Gmail or Outlook inbox messages were found for today.",
    reviewedCount > 0
      ? unreadCount > 0
        ? `${unreadCount} reviewed messages are still unread.`
        : "All reviewed messages are already marked read."
      : "",
    topSenders.length > 0 ? `Most active senders: ${joinLabels(topSenders)}.` : "",
    topSubjects.length > 0 ? `Main topics: ${topSubjects.join("; ")}.` : "",
    urgentCount > 0
      ? `${urgentCount} thread${urgentCount === 1 ? " may" : "s may"} need prompt follow-up.`
      : "",
    ...digests.map((digest) => digest.summary),
    reconnectLabels.length > 0
      ? `${joinLabels(reconnectLabels)} ${reconnectLabels.length === 1 ? "needs" : "need"} to be reconnected before this workflow can run completely.`
      : "",
  ].filter(Boolean);

  return parts.join(" ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error.";
}

function isTokenStale(expiresAt?: number) {
  return typeof expiresAt === "number" && expiresAt <= Date.now() + 60_000;
}

async function storeRefreshedConnection(
  ownerId: string,
  connection: ExecutionConnection,
) {
  if (!connection.refreshToken) {
    return null;
  }

  const refreshed = await refreshProviderAccessToken(
    connection.provider,
    connection.refreshToken,
  );

  await convexMutation<
    {
      ownerId: string;
      provider: IntegrationProvider;
      email?: string;
      scopes: string[];
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
    },
    null
  >("automation:upsertConnection", {
    ownerId,
    provider: connection.provider,
    email: connection.email,
    scopes: refreshed.scopes,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });

  return {
    ...connection,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    scopes: refreshed.scopes,
    expiresAt: refreshed.expiresAt,
    status: "connected" as const,
  };
}

async function markNeedsReconnect(
  ownerId: string,
  provider: IntegrationProvider,
  reason: string,
) {
  await convexMutation<
    { ownerId: string; provider: IntegrationProvider; reason: string },
    null
  >("automation:markConnectionNeedsReconnect", {
    ownerId,
    provider,
    reason,
  });
}

async function fetchSnapshotForConnection(
  ownerId: string,
  connection: ExecutionConnection,
) {
  let liveConnection = connection;
  let hasRefreshed = false;

  if (!liveConnection.accessToken || isTokenStale(liveConnection.expiresAt)) {
    const refreshedConnection = await storeRefreshedConnection(ownerId, liveConnection);

    if (!refreshedConnection) {
      await markNeedsReconnect(
        ownerId,
        liveConnection.provider,
        `${PROVIDER_META[liveConnection.provider].label} needs a new authorization.`,
      );
      return null;
    }

    liveConnection = refreshedConnection;
    hasRefreshed = true;
  }

  try {
    return await fetchProviderMailboxSnapshot(
      liveConnection.provider,
      liveConnection.accessToken!,
    );
  } catch (error) {
    if (!(error instanceof ProviderAuthError)) {
      throw error;
    }

    if (hasRefreshed) {
      await markNeedsReconnect(ownerId, liveConnection.provider, error.message);
      return null;
    }

    const refreshedConnection = await storeRefreshedConnection(ownerId, liveConnection);

    if (!refreshedConnection) {
      await markNeedsReconnect(ownerId, liveConnection.provider, error.message);
      return null;
    }

    try {
      return await fetchProviderMailboxSnapshot(
        refreshedConnection.provider,
        refreshedConnection.accessToken!,
      );
    } catch (retryError) {
      if (retryError instanceof ProviderAuthError) {
        await markNeedsReconnect(
          ownerId,
          refreshedConnection.provider,
          retryError.message,
        );
        return null;
      }

      throw retryError;
    }
  }
}

async function fetchTodayDigestForConnection(
  ownerId: string,
  connection: ExecutionConnection,
) {
  let liveConnection = connection;
  let hasRefreshed = false;

  if (!liveConnection.accessToken || isTokenStale(liveConnection.expiresAt)) {
    const refreshedConnection = await storeRefreshedConnection(ownerId, liveConnection);

    if (!refreshedConnection) {
      await markNeedsReconnect(
        ownerId,
        liveConnection.provider,
        `${PROVIDER_META[liveConnection.provider].label} needs a new authorization.`,
      );
      return null;
    }

    liveConnection = refreshedConnection;
    hasRefreshed = true;
  }

  try {
    return await fetchProviderTodayMessageDigest(
      liveConnection.provider,
      liveConnection.accessToken!,
    );
  } catch (error) {
    if (!(error instanceof ProviderAuthError)) {
      throw error;
    }

    if (hasRefreshed) {
      await markNeedsReconnect(ownerId, liveConnection.provider, error.message);
      return null;
    }

    const refreshedConnection = await storeRefreshedConnection(ownerId, liveConnection);

    if (!refreshedConnection) {
      await markNeedsReconnect(ownerId, liveConnection.provider, error.message);
      return null;
    }

    try {
      return await fetchProviderTodayMessageDigest(
        refreshedConnection.provider,
        refreshedConnection.accessToken!,
      );
    } catch (retryError) {
      if (retryError instanceof ProviderAuthError) {
        await markNeedsReconnect(
          ownerId,
          refreshedConnection.provider,
          retryError.message,
        );
        return null;
      }

      throw retryError;
    }
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;

    try {
      const executionContext: ExecutionContext = await convexQuery<
        { ownerId: string; workflowId: string },
        ExecutionContext
      >("automation:getWorkflowExecutionContext", {
        ownerId,
        workflowId,
      });
      const runTodayDigest = wantsTodayMessageDigest(executionContext.workflow);
      const syncedProviders: IntegrationProvider[] = [];
      const summaryParts: string[] = [];
      const reconnectProviders: IntegrationProvider[] = [];
      const digestSnapshots: ProviderTodayMessageDigest[] = [];

      for (const provider of executionContext.workflow.requirements) {
        const connection = executionContext.connections.find(
          (candidate) => candidate.provider === provider,
        );

        if (!connection || connection.status === "disconnected") {
          reconnectProviders.push(provider);
          continue;
        }

        if (connection.status === "needs_reconnect") {
          reconnectProviders.push(provider);
          continue;
        }

        if (!hasRequiredProviderScopes(provider, connection.scopes)) {
          await markNeedsReconnect(
            ownerId,
            provider,
            `${PROVIDER_META[provider].label} needs mailbox access and must be reconnected.`,
          );
          reconnectProviders.push(provider);
          continue;
        }

        if (runTodayDigest) {
          const digestSnapshot = await fetchTodayDigestForConnection(ownerId, connection);

          if (!digestSnapshot) {
            reconnectProviders.push(provider);
            continue;
          }

          syncedProviders.push(provider);
          digestSnapshots.push(digestSnapshot);
          continue;
        }

        const snapshot = await fetchSnapshotForConnection(ownerId, connection);

        if (!snapshot) {
          reconnectProviders.push(provider);
          continue;
        }

        syncedProviders.push(provider);
        summaryParts.push(snapshot.summary);
      }

      const reconnectLabels = reconnectProviders.map(
        (provider) => PROVIDER_META[provider].label,
      );
      const runMessage =
        runTodayDigest
          ? buildCombinedTodayDigestMessage(digestSnapshots, reconnectLabels)
          : reconnectLabels.length > 0
          ? [
              summaryParts.join(" "),
              `${reconnectLabels.join(" and ")} ${
                reconnectLabels.length === 1 ? "needs" : "need"
              } to be reconnected before this workflow can run.`,
            ]
              .filter(Boolean)
              .join(" ")
          : `Live mailbox test run succeeded. ${summaryParts.join(" ")}`;

      const run = await convexMutation<
        {
          ownerId: string;
          workflowId: string;
          status: "success" | "needs_auth" | "error";
          message: string;
          syncedProviders: IntegrationProvider[];
        },
        WorkflowRunSummary
      >("automation:recordTestRun", {
        ownerId,
        workflowId,
        status: reconnectProviders.length > 0 ? "needs_auth" : "success",
        message: runMessage,
        syncedProviders,
      });

      return NextResponse.json({ workflowId, run });
    } catch (error) {
      try {
        const run = await convexMutation<
          {
            ownerId: string;
            workflowId: string;
            status: "success" | "needs_auth" | "error";
            message: string;
            syncedProviders: IntegrationProvider[];
          },
          WorkflowRunSummary
        >("automation:recordTestRun", {
          ownerId,
          workflowId,
          status: "error",
          message: `Live mailbox test run failed. ${getErrorMessage(error)}`,
          syncedProviders: [],
        });

        return NextResponse.json({ workflowId, run });
      } catch {
        return handleRouteError(error);
      }
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
