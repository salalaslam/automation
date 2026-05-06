import { Suspense } from "react";

import { WorkflowStudio } from "@/components/workflow-studio";
import { isClerkEnabled } from "@/lib/server/auth";

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <WorkflowStudio authEnabled={isClerkEnabled()} />
    </Suspense>
  );
}
