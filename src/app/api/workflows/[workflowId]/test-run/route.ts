import { NextResponse } from "next/server";

import {
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
    requirements: IntegrationProvider[];
  };
  connections: ExecutionConnection[];
};

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
    if (!(error instanceof ProviderAuthError) || hasRefreshed) {
      throw error;
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

export async function POST(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;
    const executionContext: ExecutionContext = await convexQuery<
      { ownerId: string; workflowId: string },
      ExecutionContext
    >("automation:getWorkflowExecutionContext", {
      ownerId,
      workflowId,
    });
    const syncedProviders: IntegrationProvider[] = [];
    const summaryParts: string[] = [];
    const reconnectProviders: IntegrationProvider[] = [];

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
      reconnectLabels.length > 0
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
        status: "success" | "needs_auth";
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
    return handleRouteError(error);
  }
}
