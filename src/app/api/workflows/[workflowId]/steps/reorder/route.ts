import { NextResponse } from "next/server";
import { z } from "zod";

import type { WorkflowStep } from "@/lib/workflow-model";
import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";

const reorderWorkflowStepsSchema = z.object({
  orderedStepIds: z.array(z.string()).min(1, "At least one step is required."),
});

type ReorderWorkflowStepsResponse = {
  workflowId: string;
  steps: WorkflowStep[];
  updatedAt: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;
    const { orderedStepIds } = reorderWorkflowStepsSchema.parse(await request.json());

    const result = await convexMutation<
      { ownerId: string; workflowId: string; orderedStepIds: string[] },
      ReorderWorkflowStepsResponse
    >("automation:reorderWorkflowSteps", {
      ownerId,
      workflowId,
      orderedStepIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}