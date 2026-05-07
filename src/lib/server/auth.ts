import { auth } from "@clerk/nextjs/server";

function hasClerkCredentials() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

function isDemoModeEnabled() {
  return !hasClerkCredentials() && process.env.VERCEL !== "1";
}

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Not authenticated.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function isClerkEnabled() {
  return hasClerkCredentials();
}

export async function getRequestOwnerId() {
  if (isDemoModeEnabled()) {
    return "demo-user";
  }

  if (!hasClerkCredentials()) {
    throw new UnauthorizedError("Authentication is not configured.");
  }

  const session = await auth();

  if (!session.userId) {
    throw new UnauthorizedError();
  }

  return session.userId;
}
