import { NextResponse } from "next/server";
import { z } from "zod";

import { convexMutation } from "@/lib/server/convex-client";
import { getRequestOwnerId } from "@/lib/server/auth";
import { handleRouteError } from "@/lib/server/http";
import {
  buildWorkflowStepFromOption,
  type WorkflowRecord,
} from "@/lib/workflow-model";

const addStepSchema = z.object({
  optionId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;
    const { optionId } = addStepSchema.parse(await request.json());
    const step = buildWorkflowStepFromOption(optionId);

    const workflow = await convexMutation<
      {
        ownerId: string;
        workflowId: string;
        step: WorkflowRecord["steps"][number];
      },
      WorkflowRecord
    >("automation:appendWorkflowStep", {
      ownerId,
      workflowId,
      step,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}