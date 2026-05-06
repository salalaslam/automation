import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

function getConvexUrl() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not configured. Run `pnpm convex dev --configure new --dev-deployment local --once` first.",
    );
  }

  return convexUrl;
}

function getClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export async function convexQuery<Args extends Record<string, unknown>, Output>(
  name: string,
  args: Args,
) {
  const client = getClient();

  return client.query(
    makeFunctionReference<"query", Args, Output>(name) as never,
    args as never,
  );
}

export async function convexMutation<Args extends Record<string, unknown>, Output>(
  name: string,
  args: Args,
) {
  const client = getClient();

  return client.mutation(
    makeFunctionReference<"mutation", Args, Output>(name) as never,
    args as never,
  );
}
