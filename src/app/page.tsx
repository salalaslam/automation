import { Suspense } from "react";

import { WorkflowStudio } from "@/components/workflow-studio";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--page)]" />}>
      <WorkflowStudio authEnabled={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)} />
    </Suspense>
  );
}
