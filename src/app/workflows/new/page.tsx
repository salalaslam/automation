import { Suspense } from "react";

import { WorkflowStudio } from "@/components/workflow-studio";
import { isClerkEnabled } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const params = await searchParams;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <WorkflowStudio
        authEnabled={isClerkEnabled()}
        initialPrompt={typeof params.prompt === "string" ? params.prompt : undefined}
      />
    </Suspense>
  );
}