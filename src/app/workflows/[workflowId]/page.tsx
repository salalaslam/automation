import { Suspense } from "react";

import { WorkflowStudio } from "@/components/workflow-studio";
import { isClerkEnabled } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <WorkflowStudio authEnabled={isClerkEnabled()} workflowId={workflowId} />
    </Suspense>
  );
}