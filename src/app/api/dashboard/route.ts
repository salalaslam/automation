import { NextResponse } from "next/server";

import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation, convexQuery } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";
import type { DashboardData } from "@/lib/workflow-model";

export async function GET() {
  try {
    const ownerId = await getRequestOwnerId();

    await convexMutation<{ ownerId: string }, null>("automation:ensureWorkspace", {
      ownerId,
    });

    const dashboard = await convexQuery<{ ownerId: string }, DashboardData>(
      "automation:getDashboard",
      { ownerId },
    );

    return NextResponse.json(dashboard);
  } catch (error) {
    return handleRouteError(error);
  }
}
