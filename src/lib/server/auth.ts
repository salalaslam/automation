import { auth } from "@clerk/nextjs/server";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Not authenticated.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function isClerkEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export async function getRequestOwnerId() {
  if (!isClerkEnabled()) {
    return "demo-user";
  }

  const session = await auth();

  if (!session.userId) {
    throw new UnauthorizedError();
  }

  return session.userId;
}
