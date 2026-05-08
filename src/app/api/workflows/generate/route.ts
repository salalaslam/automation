import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildStubWorkflow,
  buildWorkflowAssistantReply,
  type WorkflowDraftInput,
  type WorkflowRecord,
} from "@/lib/workflow-model";
import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";

const workflowPromptSchema = z.object({
  prompt: z.string().min(12, "Describe the workflow in a bit more detail.").max(500),
  workflowId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const ownerId = await getRequestOwnerId();
    const { prompt, workflowId } = workflowPromptSchema.parse(await request.json());
    const workflow = buildStubWorkflow(prompt);
    const assistantMessage = buildWorkflowAssistantReply(workflow);

    const savedWorkflow = workflowId
      ? await convexMutation<
          {
            ownerId: string;
            workflowId: string;
            prompt: string;
            assistantMessage: string;
            workflow: WorkflowDraftInput;
          },
          WorkflowRecord
        >("automation:replaceWorkflowFromPrompt", {
          ownerId,
          workflowId,
          prompt,
          assistantMessage,
          workflow,
        })
      : await convexMutation<
          {
            ownerId: string;
            prompt: string;
            assistantMessage: string;
            workflow: WorkflowDraftInput;
          },
          WorkflowRecord
        >("automation:createWorkflowFromPrompt", {
          ownerId,
          prompt,
          assistantMessage,
          workflow,
        });

    return NextResponse.json(
      { workflow: savedWorkflow, assistantMessage },
      { status: workflowId ? 200 : 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
