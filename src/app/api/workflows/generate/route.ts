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

type SaveWorkflowArgs = {
  ownerId: string;
  prompt: string;
  assistantMessage: string;
  workflow: WorkflowDraftInput;
};

function isLegacyAssistantMessageValidationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("ArgumentValidationError") &&
    error.message.includes("assistantMessage") &&
    error.message.includes("extra field")
  );
}

async function createWorkflowFromPrompt(args: SaveWorkflowArgs) {
  try {
    return await convexMutation<SaveWorkflowArgs, WorkflowRecord>(
      "automation:createWorkflowFromPrompt",
      args,
    );
  } catch (error) {
    if (!isLegacyAssistantMessageValidationError(error)) {
      throw error;
    }

    const legacyArgs = {
      ownerId: args.ownerId,
      prompt: args.prompt,
      workflow: args.workflow,
    };

    return convexMutation<
      Omit<SaveWorkflowArgs, "assistantMessage">,
      WorkflowRecord
    >("automation:createWorkflowFromPrompt", legacyArgs);
  }
}

async function replaceWorkflowFromPrompt(
  args: SaveWorkflowArgs & { workflowId: string },
) {
  try {
    return await convexMutation<
      SaveWorkflowArgs & { workflowId: string },
      WorkflowRecord
    >("automation:replaceWorkflowFromPrompt", args);
  } catch (error) {
    if (!isLegacyAssistantMessageValidationError(error)) {
      throw error;
    }

    const legacyArgs = {
      ownerId: args.ownerId,
      workflowId: args.workflowId,
      prompt: args.prompt,
      workflow: args.workflow,
    };

    return convexMutation<
      Omit<SaveWorkflowArgs, "assistantMessage"> & { workflowId: string },
      WorkflowRecord
    >("automation:replaceWorkflowFromPrompt", legacyArgs);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await getRequestOwnerId();
    const { prompt, workflowId } = workflowPromptSchema.parse(await request.json());
    const workflow = buildStubWorkflow(prompt);
    const assistantMessage = buildWorkflowAssistantReply(workflow);

    const savedWorkflow = workflowId
      ? await replaceWorkflowFromPrompt({
          ownerId,
          workflowId,
          prompt,
          assistantMessage,
          workflow,
        })
      : await createWorkflowFromPrompt({
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
