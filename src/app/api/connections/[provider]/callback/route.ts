import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { convexMutation } from "@/lib/server/convex-client";
import {
  fetchProviderEmail,
  getOAuthConfig,
  getOAuthCookieName,
  hasOAuthCredentials,
  parseOAuthCookiePayload,
} from "@/lib/server/oauth";
import type { MailProvider } from "@/lib/workflow-model";

function assertProvider(provider: string): MailProvider {
  if (provider === "gmail" || provider === "outlook") {
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
      new URL(`/?oauth=missing_config&provider=${provider}`, request.url),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/?oauth=failed&provider=${provider}`, request.url),
    );
  }

  const cookieStore = await cookies();
  const oauthCookie = cookieStore.get(getOAuthCookieName(provider));

  if (!oauthCookie) {
    return NextResponse.redirect(
      new URL(`/?oauth=failed&provider=${provider}`, request.url),
    );
  }

  const cookiePayload = parseOAuthCookiePayload(oauthCookie.value);

  if (cookiePayload.state !== state) {
    return NextResponse.redirect(
      new URL(`/?oauth=failed&provider=${provider}`, request.url),
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
      new URL(`/?oauth=failed&provider=${provider}`, request.url),
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
      provider: MailProvider;
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

  const response = NextResponse.redirect(
    new URL(`/?oauth=connected&provider=${provider}`, request.url),
  );

  response.cookies.delete(getOAuthCookieName(provider));

  return response;
}
