import { NextResponse } from "next/server";

import type { IntegrationProvider } from "@/lib/provider-catalog";
import { getRequestOwnerId } from "@/lib/server/auth";
import { convexMutation } from "@/lib/server/convex-client";
import { handleRouteError } from "@/lib/server/http";

type ToggleWorkflowResponse =
  | {
      ok: true;
      workflowId: string;
      status: "draft" | "active";
    }
  | {
      ok: false;
      error: "authorization_required";
      workflowId: string;
      missingProviders: IntegrationProvider[];
    };

export async function POST(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const ownerId = await getRequestOwnerId();
    const { workflowId } = await context.params;

    const result = await convexMutation<
      { ownerId: string; workflowId: string },
      ToggleWorkflowResponse
    >("automation:toggleWorkflow", {
      ownerId,
      workflowId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
