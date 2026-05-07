import { Suspense } from "react";

import { WorkflowDashboard } from "@/components/workflow-dashboard";
import { isClerkEnabled } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <WorkflowDashboard authEnabled={isClerkEnabled()} />
    </Suspense>
  );
}
