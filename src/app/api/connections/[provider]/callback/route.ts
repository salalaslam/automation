import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  PROVIDER_META,
  hasRequiredProviderScopes,
  isIntegrationProvider,
  type IntegrationProvider,
} from "@/lib/provider-catalog";
import { convexMutation } from "@/lib/server/convex-client";
import {
  fetchProviderEmail,
  getOAuthConfig,
  getOAuthCookieName,
  hasOAuthCredentials,
  parseOAuthCookiePayload,
  sanitizeReturnToPath,
} from "@/lib/server/oauth";

function buildReturnUrl(
  request: NextRequest,
  provider: IntegrationProvider,
  oauthState: "missing_config" | "failed" | "connected" | "insufficient_scope",
  returnTo?: string,
) {
  const url = new URL(returnTo ?? "/", request.url);
  url.searchParams.set("oauth", oauthState);
  url.searchParams.set("provider", provider);
  return url;
}

function assertProvider(provider: string): IntegrationProvider {
  if (isIntegrationProvider(provider)) {
    return provider;
  }

  throw new Error("Unsupported provider.");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await context.params;
  const provider = assertProvider(providerParam);
  const config = getOAuthConfig(provider, request);

  if (!hasOAuthCredentials(config)) {
    return NextResponse.redirect(
      buildReturnUrl(request, provider, "missing_config"),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      buildReturnUrl(request, provider, "failed"),
    );
  }

  const cookieStore = await cookies();
  const oauthCookie = cookieStore.get(getOAuthCookieName(provider));

  if (!oauthCookie) {
    return NextResponse.redirect(
      buildReturnUrl(request, provider, "failed"),
    );
  }

  const cookiePayload = parseOAuthCookiePayload(oauthCookie.value);
  const returnTo = sanitizeReturnToPath(cookiePayload.returnTo);

  if (cookiePayload.state !== state) {
    return NextResponse.redirect(
      buildReturnUrl(request, provider, "failed", returnTo),
    );
  }

  const tokenBody = new URLSearchParams({
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  if (provider === "outlook") {
    tokenBody.set("scope", config.scopes.join(" "));
  }

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(
      buildReturnUrl(request, provider, "failed", returnTo),
    );
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const email = await fetchProviderEmail(provider, tokenPayload.access_token);
  const scopes = tokenPayload.scope?.split(" ").filter(Boolean) ?? config.scopes;

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
    ownerId: cookiePayload.ownerId,
    provider,
    email,
    scopes,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: tokenPayload.expires_in
      ? Date.now() + tokenPayload.expires_in * 1000
      : undefined,
  });

  if (!hasRequiredProviderScopes(provider, scopes)) {
    await convexMutation<
      { ownerId: string; provider: IntegrationProvider; reason: string },
      null
    >("automation:markConnectionNeedsReconnect", {
      ownerId: cookiePayload.ownerId,
      provider,
      reason: `${PROVIDER_META[provider].label} needs mailbox access and must be reconnected.`,
    });
  }

  const response = NextResponse.redirect(
    buildReturnUrl(
      request,
      provider,
      hasRequiredProviderScopes(provider, scopes) ? "connected" : "insufficient_scope",
      returnTo,
    ),
  );

  response.cookies.delete(getOAuthCookieName(provider));

  return response;
}
