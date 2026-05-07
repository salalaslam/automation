import { NextRequest, NextResponse } from "next/server";

import {
  isIntegrationProvider,
  type IntegrationProvider,
} from "@/lib/provider-catalog";
import { UnauthorizedError, getRequestOwnerId } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/http";
import {
  createOAuthCookiePayload,
  getOAuthConfig,
  getOAuthCookieName,
  hasOAuthCredentials,
  sanitizeReturnToPath,
} from "@/lib/server/oauth";

function buildReturnUrl(
  request: NextRequest,
  provider: IntegrationProvider,
  oauthState: "missing_config" | "failed" | "connected",
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
  try {
    const { provider: providerParam } = await context.params;
    const provider = assertProvider(providerParam);
    const config = getOAuthConfig(provider, request);
    const returnTo = sanitizeReturnToPath(
      request.nextUrl.searchParams.get("returnTo"),
    );

    if (!hasOAuthCredentials(config)) {
      return NextResponse.redirect(
        buildReturnUrl(request, provider, "missing_config", returnTo),
      );
    }

    const ownerId = await getRequestOwnerId();
    const cookiePayload = createOAuthCookiePayload(ownerId, returnTo);
    const params = new URLSearchParams({
      client_id: config.clientId!,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: config.scopes.join(" "),
      state: cookiePayload.state,
      access_type: "offline",
      prompt: "consent",
    });

    if (provider === "outlook") {
      params.set("response_mode", "query");
    }

    const response = NextResponse.redirect(
      `${config.authorizeUrl}?${params.toString()}`,
    );

    response.cookies.set({
      name: getOAuthCookieName(provider),
      value: JSON.stringify(cookiePayload),
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      sameSite: "lax",
      secure: !request.url.includes("localhost"),
    });

    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return handleRouteError(error);
  }
}
