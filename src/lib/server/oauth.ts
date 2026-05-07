import { randomUUID } from "crypto";

import type { NextRequest } from "next/server";

import {
  PROVIDER_META,
  type IntegrationProvider,
} from "@/lib/provider-catalog";

type OAuthProviderBaseConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
};

type OAuthProviderConfig = OAuthProviderBaseConfig & {
  redirectUri: string;
};

type OAuthCookiePayload = {
  ownerId: string;
  state: string;
  returnTo?: string;
};

export type RefreshedAccessToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes: string[];
};

export type ProviderMailboxSnapshot = {
  provider: IntegrationProvider;
  summary: string;
  stats: string[];
};

export type MailboxMessage = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  receivedAt?: string;
  isUnread: boolean;
};

export type ProviderTodayMessageDigest = {
  provider: IntegrationProvider;
  summary: string;
  stats: string[];
  reviewedCount: number;
  totalCount?: number;
  messages: MailboxMessage[];
};

const TODAY_MESSAGE_LIMIT = 12;

export class ProviderAuthError extends Error {
  constructor(
    readonly provider: IntegrationProvider,
    message: string,
  ) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

function cleanMailboxValue(value?: string) {
  if (!value) {
    return "Unknown";
  }

  const compact = value.replace(/\s+/g, " ").trim();
  const namedMatch = compact.match(/^\"?([^\"<]+)\"?\s*<[^>]+>$/);

  if (namedMatch?.[1]) {
    return namedMatch[1].trim();
  }

  const emailMatch = compact.match(/<([^>]+)>/);

  return emailMatch?.[1]?.trim() || compact;
}

function cleanSubject(value?: string) {
  const compact = value?.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "No subject";
  }

  return compact.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim() || "No subject";
}

function truncatePreview(value?: string, maxLength = 120) {
  const compact = value?.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "";
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
}

function getTopValues(values: string[], limit: number) {
  const counts = new Map<string, { value: string; count: number }>();

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, { value: normalized, count: 1 });
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((entry) => entry.value);
}

function buildTodayDigestSummary(
  provider: IntegrationProvider,
  messages: MailboxMessage[],
  unreadCount: number,
  totalCount?: number,
) {
  if (messages.length === 0) {
    return `${PROVIDER_META[provider].label}: no inbox messages received today.`;
  }

  const reviewedLabel =
    typeof totalCount === "number" && totalCount > messages.length
      ? `Reviewed the latest ${messages.length} of ${totalCount} messages received today`
      : `Reviewed ${messages.length} messages received today`;
  const topSenders = getTopValues(messages.map((message) => cleanMailboxValue(message.from)), 2);
  const topSubjects = getTopValues(messages.map((message) => cleanSubject(message.subject)), 3);
  const urgentCount = messages.filter((message) =>
    /urgent|asap|follow up|follow-up|action required|deadline/i.test(
      `${message.subject} ${message.preview}`,
    ),
  ).length;
  const parts = [
    `${PROVIDER_META[provider].label}: ${reviewedLabel}.`,
    unreadCount > 0
      ? `${unreadCount} unread in the reviewed set.`
      : "No unread mail in the reviewed set.",
    topSenders.length > 0 ? `Top senders: ${topSenders.join(", ")}.` : "",
    topSubjects.length > 0 ? `Main topics: ${topSubjects.join("; ")}.` : "",
    urgentCount > 0
      ? `${urgentCount} thread${urgentCount === 1 ? " looks" : "s look"} time-sensitive.`
      : "",
  ].filter(Boolean);

  return parts.join(" ");
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  headerName: string,
) {
  return headers?.find((header) => header.name?.toLowerCase() === headerName.toLowerCase())
    ?.value;
}

function getBaseUrl(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "");
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");

  if (!host) {
    throw new Error("Unable to determine the current application URL.");
  }

  return `${protocol}://${host}`;
}

function getOAuthProviderConfig(
  provider: IntegrationProvider,
): OAuthProviderBaseConfig {
  if (provider === "gmail") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
    };
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID ?? "common";

  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    scopes: [
      "openid",
      "email",
      "offline_access",
      "profile",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/User.Read",
    ],
  };
}

async function readProviderError(response: Response) {
  const payload = await response.text().catch(() => "");
  return payload ? ` ${payload.slice(0, 250)}` : "";
}

async function assertProviderResponse(
  provider: IntegrationProvider,
  response: Response,
  message: string,
  authStatuses: number[] = [401, 403],
) {
  if (response.ok) {
    return;
  }

  const details = await readProviderError(response);

  if (authStatuses.includes(response.status)) {
    throw new ProviderAuthError(provider, `${message}${details}`);
  }

  throw new Error(`${message}${details}`);
}

export function getOAuthCookieName(provider: IntegrationProvider) {
  return `automation.oauth.${provider}`;
}

export function getOAuthConfig(
  provider: IntegrationProvider,
  request: NextRequest,
): OAuthProviderConfig {
  return {
    ...getOAuthProviderConfig(provider),
    redirectUri: `${getBaseUrl(request)}/api/connections/${provider}/callback`,
  };
}

export function hasOAuthCredentials(config: OAuthProviderConfig) {
  return Boolean(config.clientId && config.clientSecret);
}

export function sanitizeReturnToPath(returnTo?: string | null) {
  if (!returnTo) {
    return undefined;
  }

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return undefined;
  }

  return returnTo;
}

export function createOAuthCookiePayload(
  ownerId: string,
  returnTo?: string,
): OAuthCookiePayload {
  return {
    ownerId,
    state: randomUUID(),
    returnTo: sanitizeReturnToPath(returnTo),
  };
}

export function parseOAuthCookiePayload(payload: string): OAuthCookiePayload {
  return JSON.parse(payload) as OAuthCookiePayload;
}

export async function refreshProviderAccessToken(
  provider: IntegrationProvider,
  refreshToken: string,
): Promise<RefreshedAccessToken> {
  const config = getOAuthProviderConfig(provider);

  if (!hasOAuthCredentials({ ...config, redirectUri: "unused" })) {
    throw new Error(`${PROVIDER_META[provider].label} OAuth credentials are missing.`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (provider === "outlook") {
    body.set("scope", config.scopes.join(" "));
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  await assertProviderResponse(
    provider,
    response,
    `Unable to refresh ${PROVIDER_META[provider].label} access.`,
    [400, 401, 403],
  );

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_in
      ? Date.now() + payload.expires_in * 1000
      : undefined,
    scopes: payload.scope?.split(" ").filter(Boolean) ?? config.scopes,
  };
}

export async function fetchProviderEmail(
  provider: IntegrationProvider,
  accessToken: string,
) {
  if (provider === "gmail") {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { email?: string };
    return payload.email;
  }

  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as {
    mail?: string;
    userPrincipalName?: string;
  };

  return payload.mail ?? payload.userPrincipalName;
}

export async function fetchProviderMailboxSnapshot(
  provider: IntegrationProvider,
  accessToken: string,
): Promise<ProviderMailboxSnapshot> {
  if (provider === "gmail") {
    const [profileResponse, unreadResponse] = await Promise.all([
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }),
      fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=UNREAD&maxResults=1",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      ),
    ]);

    await assertProviderResponse(
      provider,
      profileResponse,
      "Unable to load Gmail mailbox details.",
    );
    await assertProviderResponse(
      provider,
      unreadResponse,
      "Unable to load Gmail unread counts.",
    );

    const profile = (await profileResponse.json()) as {
      emailAddress?: string;
      messagesTotal?: number;
      threadsTotal?: number;
    };
    const unreadPayload = (await unreadResponse.json()) as {
      resultSizeEstimate?: number;
    };
    const unreadCount = unreadPayload.resultSizeEstimate ?? 0;

    return {
      provider,
      summary: `Gmail inbox reachable for ${profile.emailAddress ?? "your account"} with ${unreadCount} unread messages.`,
      stats: [
        `${unreadCount} unread`,
        `${profile.messagesTotal ?? 0} total messages`,
        `${profile.threadsTotal ?? 0} total threads`,
      ],
    };
  }

  const inboxResponse = await fetch(
    "https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  await assertProviderResponse(
    provider,
    inboxResponse,
    "Unable to load Outlook inbox details.",
  );

  const inbox = (await inboxResponse.json()) as {
    displayName?: string;
    totalItemCount?: number;
    unreadItemCount?: number;
  };

  return {
    provider,
    summary: `${PROVIDER_META[provider].label} reachable for ${
      inbox.displayName ?? "Inbox"
    } with ${inbox.unreadItemCount ?? 0} unread messages.`,
    stats: [
      `${inbox.unreadItemCount ?? 0} unread`,
      `${inbox.totalItemCount ?? 0} total inbox items`,
    ],
  };
}

export async function fetchProviderTodayMessageDigest(
  provider: IntegrationProvider,
  accessToken: string,
): Promise<ProviderTodayMessageDigest> {
  if (provider === "gmail") {
    const { start } = getTodayRange();
    const query = new URLSearchParams({
      q: `after:${Math.floor(start.getTime() / 1000) - 1}`,
      maxResults: String(TODAY_MESSAGE_LIMIT),
    });
    query.append("labelIds", "INBOX");

    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    await assertProviderResponse(
      provider,
      listResponse,
      "Unable to list today's Gmail messages.",
    );

    const listPayload = (await listResponse.json()) as {
      messages?: Array<{ id: string }>;
      resultSizeEstimate?: number;
    };
    const listedMessages = listPayload.messages ?? [];
    const messages = await Promise.all(
      listedMessages.map(async ({ id }) => {
        const metadataQuery = new URLSearchParams({ format: "metadata" });
        metadataQuery.append("metadataHeaders", "Subject");
        metadataQuery.append("metadataHeaders", "From");
        metadataQuery.append("metadataHeaders", "Date");

        const messageResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${metadataQuery.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          },
        );

        await assertProviderResponse(
          provider,
          messageResponse,
          "Unable to load Gmail message metadata.",
        );

        const payload = (await messageResponse.json()) as {
          id?: string;
          snippet?: string;
          labelIds?: string[];
          payload?: {
            headers?: Array<{ name?: string; value?: string }>;
          };
        };

        return {
          id: payload.id ?? id,
          subject: cleanSubject(getHeaderValue(payload.payload?.headers, "Subject")),
          from: cleanMailboxValue(getHeaderValue(payload.payload?.headers, "From")),
          preview: truncatePreview(payload.snippet),
          receivedAt: getHeaderValue(payload.payload?.headers, "Date"),
          isUnread: payload.labelIds?.includes("UNREAD") ?? false,
        } satisfies MailboxMessage;
      }),
    );
    const unreadCount = messages.filter((message) => message.isUnread).length;

    return {
      provider,
      summary: buildTodayDigestSummary(
        provider,
        messages,
        unreadCount,
        listPayload.resultSizeEstimate,
      ),
      stats: [
        `${messages.length} reviewed`,
        `${unreadCount} unread in sample`,
        typeof listPayload.resultSizeEstimate === "number"
          ? `${listPayload.resultSizeEstimate} total matched today`
          : `${messages.length} sampled for digest`,
      ],
      reviewedCount: messages.length,
      totalCount: listPayload.resultSizeEstimate,
      messages,
    };
  }

  const { start, end } = getTodayRange();
  const query = new URLSearchParams({
    $select: "subject,from,receivedDateTime,bodyPreview,isRead",
    $filter: `receivedDateTime ge ${start.toISOString()} and receivedDateTime lt ${end.toISOString()}`,
    $orderby: "receivedDateTime desc",
    $top: String(TODAY_MESSAGE_LIMIT),
  });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
      cache: "no-store",
    },
  );

  await assertProviderResponse(
    provider,
    response,
    "Unable to list today's Outlook messages.",
  );

  const payload = (await response.json()) as {
    value?: Array<{
      id?: string;
      subject?: string;
      from?: {
        emailAddress?: {
          name?: string;
          address?: string;
        };
      };
      receivedDateTime?: string;
      bodyPreview?: string;
      isRead?: boolean;
    }>;
  };
  const messages = (payload.value ?? []).map((message) => ({
    id: message.id ?? randomUUID(),
    subject: cleanSubject(message.subject),
    from: cleanMailboxValue(
      message.from?.emailAddress?.name ?? message.from?.emailAddress?.address,
    ),
    preview: truncatePreview(message.bodyPreview),
    receivedAt: message.receivedDateTime,
    isUnread: !message.isRead,
  } satisfies MailboxMessage));
  const unreadCount = messages.filter((message) => message.isUnread).length;

  return {
    provider,
    summary: buildTodayDigestSummary(provider, messages, unreadCount),
    stats: [
      `${messages.length} reviewed`,
      `${unreadCount} unread in sample`,
      `${messages.length} sampled for digest`,
    ],
    reviewedCount: messages.length,
    messages,
  };
}
