import { NextResponse } from "next/server";

import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";
import type { WorkflowRunSummary } from "@/lib/workflow-model";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;

    const run = await convexMutation<
      { ownerId: string; workflowId: string },
      WorkflowRunSummary
    >("automation:recordTestRun", {
      ownerId,
      workflowId,
    });

    return NextResponse.json({ workflowId, run });
  } catch (error) {
    return handleRouteError(error);
  }
}
