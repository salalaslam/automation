import { NextResponse } from "next/server";
import { z } from "zod";

import { buildStubWorkflow, type WorkflowDraftInput, type WorkflowRecord } from "@/lib/workflow-model";
import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";

const workflowPromptSchema = z.object({
  prompt: z.string().min(12, "Describe the workflow in a bit more detail.").max(500),
});

export async function POST(request: Request) {
  try {
    const ownerId = await getRequestOwnerId();
    const { prompt } = workflowPromptSchema.parse(await request.json());
    const workflow = buildStubWorkflow(prompt);

    const createdWorkflow = await convexMutation<
      {
        ownerId: string;
        prompt: string;
        workflow: WorkflowDraftInput;
      },
      WorkflowRecord
    >("automation:createWorkflowFromPrompt", {
      ownerId,
      prompt,
      workflow,
    });

    return NextResponse.json({ workflow: createdWorkflow }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
