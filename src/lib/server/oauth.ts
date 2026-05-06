import { randomUUID } from "crypto";

import type { NextRequest } from "next/server";

import type { MailProvider } from "@/lib/workflow-model";

type OAuthProviderConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
};

type OAuthCookiePayload = {
  ownerId: string;
  state: string;
};

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

export function getOAuthCookieName(provider: MailProvider) {
  return `automation.oauth.${provider}`;
}

export function getOAuthConfig(
  provider: MailProvider,
  request: NextRequest,
): OAuthProviderConfig {
  const baseUrl = getBaseUrl(request);
  const redirectUri = `${baseUrl}/api/connections/${provider}/callback`;

  if (provider === "gmail") {
    return {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
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
    redirectUri,
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

export function hasOAuthCredentials(config: OAuthProviderConfig) {
  return Boolean(config.clientId && config.clientSecret);
}

export function createOAuthCookiePayload(ownerId: string): OAuthCookiePayload {
  return {
    ownerId,
    state: randomUUID(),
  };
}

export function parseOAuthCookiePayload(payload: string): OAuthCookiePayload {
  return JSON.parse(payload) as OAuthCookiePayload;
}

export async function fetchProviderEmail(
  provider: MailProvider,
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
