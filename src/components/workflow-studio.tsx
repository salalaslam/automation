"use client";

import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  Power,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PROVIDER_META, type IntegrationProvider } from "@/lib/provider-catalog";
import {
  type WorkflowRecord,
  type WorkflowRunSummary,
  formatTimestamp,
  getConnectionReadiness,
} from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

import {
  ApiError,
  AuthorizationDialog,
  ConnectionBadge,
  ProviderIcon,
  SignInState,
  UserControls,
  buildConnectionHref,
  getMutationErrorMessage,
  requestJson,
  useDashboardQuery,
} from "./workflow-shared";

const TRIGGER_ID = "__trigger__";
const defaultPrompt =
  "Clean Gmail and Outlook inboxes every morning and send me a short recap.";

type WorkflowStudioProps = {
  authEnabled: boolean;
  workflowId?: string;
  initialPrompt?: string;
};

type ToggleWorkflowResponse =
  | {
      ok: true;
      status: "draft" | "active";
      workflowId: string;
    }
  | {
      ok: false;
      error: "authorization_required";
      workflowId: string;
      missingProviders: IntegrationProvider[];
    };

type TestRunResponse = {
  workflowId: string;
  run: WorkflowRunSummary;
};

type GeneratedWorkflowResponse = {
  workflow: WorkflowRecord;
};

export function WorkflowStudio({
  authEnabled,
  workflowId,
  initialPrompt,
}: WorkflowStudioProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const dashboardQuery = useDashboardQuery();

  const [prompt, setPrompt] = useState(initialPrompt ?? defaultPrompt);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [authorizationProviders, setAuthorizationProviders] = useState<
    IntegrationProvider[]
  >([]);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const cleanSearch = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("oauth");
    params.delete("provider");
    return params.toString();
  }, [searchParams]);

  const returnTo = cleanSearch ? `${pathname}?${cleanSearch}` : pathname;

  const generateWorkflowMutation = useMutation({
    mutationFn: () =>
      requestJson<GeneratedWorkflowResponse>("/api/workflows/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: ({ workflow }) => {
      setSelectedStepId(null);
      setBanner("Stub workflow created.");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.replace(`/workflows/${workflow._id}`);
    },
    onError: (error) => {
      setBanner(getMutationErrorMessage(error));
    },
  });

  const toggleWorkflowMutation = useMutation({
    mutationFn: (targetWorkflowId: string) =>
      requestJson<ToggleWorkflowResponse>(`/api/workflows/${targetWorkflowId}/toggle`, {
        method: "POST",
      }),
    onSuccess: (response) => {
      if (!response.ok) {
        setAuthorizationProviders(response.missingProviders);
        setAuthorizationOpen(true);
        return;
      }

      setBanner(
        response.status === "active" ? "Workflow turned on." : "Workflow moved to draft.",
      );
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      setBanner(getMutationErrorMessage(error));
    },
  });

  const testRunMutation = useMutation({
    mutationFn: (targetWorkflowId: string) =>
      requestJson<TestRunResponse>(`/api/workflows/${targetWorkflowId}/test-run`, {
        method: "POST",
      }),
    onSuccess: ({ run }) => {
      setBanner(run.message);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      setBanner(getMutationErrorMessage(error));
    },
  });

  const workflows = useMemo(
    () => dashboardQuery.data?.workflows ?? [],
    [dashboardQuery.data?.workflows],
  );
  const connections = useMemo(
    () => dashboardQuery.data?.connections ?? [],
    [dashboardQuery.data?.connections],
  );

  const selectedWorkflow = useMemo(
    () => (workflowId ? workflows.find((workflow) => workflow._id === workflowId) ?? null : null),
    [workflowId, workflows],
  );

  const selectedStep = useMemo(
    () =>
      selectedStepId && selectedStepId !== TRIGGER_ID
        ? (selectedWorkflow?.steps.find((step) => step.id === selectedStepId) ?? null)
        : null,
    [selectedStepId, selectedWorkflow],
  );

  const showTriggerPanel = selectedStepId === TRIGGER_ID;
  const showRightPanel = Boolean(selectedStep) || showTriggerPanel;
  const oauthState = searchParams.get("oauth");
  const oauthProvider = searchParams.get("provider");

  const oauthBanner = useMemo(() => {
    if (!oauthState || !oauthProvider) {
      return null;
    }

    const label = oauthProvider === "gmail" ? "Gmail" : "Outlook Email";

    if (oauthState === "connected") {
      return `${label} connected.`;
    }

    if (oauthState === "insufficient_scope") {
      return `${label} is missing mailbox permissions. Reconnect and approve the requested access.`;
    }

    if (oauthState === "missing_config") {
      return `${label} OAuth credentials are missing.`;
    }

    if (oauthState === "failed") {
      return `${label} authorization failed.`;
    }

    return null;
  }, [oauthProvider, oauthState]);

  useEffect(() => {
    if (oauthState === "connected") {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [oauthState, queryClient]);

  const connectedProviders = new Set(
    connections.filter(getConnectionReadiness).map((connection) => connection.provider),
  );

  const missingProvidersForSelected =
    selectedWorkflow?.requirements.filter((provider) => !connectedProviders.has(provider)) ?? [];

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dashboardQuery.error) {
    if (
      authEnabled &&
      dashboardQuery.error instanceof ApiError &&
      dashboardQuery.error.status === 401
    ) {
      return <SignInState />;
    }

    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-xs space-y-1">
          <p className="text-sm font-medium">Convex is not connected</p>
          <p className="text-xs text-muted-foreground">
            {dashboardQuery.error instanceof ApiError
              ? dashboardQuery.error.message
              : "Set NEXT_PUBLIC_CONVEX_URL and run npx convex dev."}
          </p>
        </div>
      </div>
    );
  }

  if (workflowId && !selectedWorkflow) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-xs space-y-3 text-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">Workflow not found</p>
            <p className="text-xs text-muted-foreground">
              The selected workflow is no longer available.
            </p>
          </div>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <AuthorizationDialog
        open={authorizationOpen}
        providers={authorizationProviders}
        onOpenChange={setAuthorizationOpen}
        returnTo={returnTo}
      />

      <div className="flex min-h-screen flex-col bg-white text-xs md:flex-row">
        <aside className="flex w-full flex-col border-b bg-white md:min-h-screen md:w-[42%] md:border-b-0 md:border-r lg:w-[40%] xl:w-[38%]">
          <div className="flex flex-1 items-center justify-center px-8 py-10 text-center">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                What would you like to automate?
              </h1>
              <p className="mt-3 text-base text-muted-foreground">
                Describe your task and let AI build it for you
              </p>
            </div>
          </div>

          <div className="border-t p-3">
            <div className="rounded-2xl border bg-white px-3 py-2 shadow-sm">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && prompt.trim()) {
                    event.preventDefault();
                    generateWorkflowMutation.mutate();
                  }
                }}
                placeholder="Describe what you want to automate..."
                className="min-h-[60px] resize-none border-0 bg-transparent px-0 py-1 text-[15px] shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" className="rounded-full">
                    <Plus className="size-3" />
                  </Button>
                  {!authEnabled && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Demo
                    </span>
                  )}
                  {authEnabled && <UserControls />}
                </div>
                <Button
                  size="sm"
                  className="h-9 rounded-full px-4 text-sm"
                  disabled={generateWorkflowMutation.isPending || !prompt.trim()}
                  onClick={() => generateWorkflowMutation.mutate()}
                >
                  {generateWorkflowMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                  Generate
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 items-center justify-between border-b px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "size-6")}
              >
                <ChevronLeft className="size-3.5" />
              </Link>
              {selectedWorkflow ? (
                <>
                  <div className="flex items-center gap-1">
                    {selectedWorkflow.requirements.slice(0, 2).map((provider) => (
                      <ProviderIcon key={provider} provider={provider} />
                    ))}
                  </div>
                  <span className="truncate font-medium">{selectedWorkflow.name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      selectedWorkflow.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-muted-foreground",
                    )}
                  >
                    {selectedWorkflow.status}
                  </span>
                </>
              ) : (
                <span className="font-medium">New workflow</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 text-[11px]")}
              >
                My Workflows
              </Link>
            </div>
          </header>

          {(banner ?? oauthBanner) && (
            <div className="border-b bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
              {banner ?? oauthBanner}
            </div>
          )}

          {selectedWorkflow ? (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mx-auto max-w-md">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Starter
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStepId(selectedStepId === TRIGGER_ID ? null : TRIGGER_ID)
                      }
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                        selectedStepId === TRIGGER_ID
                          ? "border-blue-300 bg-blue-50"
                          : "border-border bg-white hover:bg-gray-50",
                      )}
                    >
                      <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium">Step 1: {selectedWorkflow.trigger.cadence}</span>
                      <MoreHorizontal className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      Next run: {selectedWorkflow.trigger.cadence}
                    </span>
                  </div>
                </div>

                {selectedWorkflow.steps.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Actions
                    </p>
                    {selectedWorkflow.steps.map((step, index) => (
                      <div key={step.id} className="flex flex-col">
                        <div className="mx-auto h-3 w-px bg-border" />
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStepId(selectedStepId === step.id ? null : step.id)
                          }
                          className={cn(
                            "flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                            selectedStepId === step.id
                              ? "border-blue-300 bg-blue-50"
                              : "border-border bg-white hover:bg-gray-50",
                          )}
                        >
                          {index + 2 === 4 ? (
                            <Sparkles className="size-3.5 shrink-0 text-violet-600" />
                          ) : (
                            <ProviderIcon provider={step.provider} />
                          )}
                          <span className="font-medium">Step {index + 2}: {step.title}</span>
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              step.status === "ready"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {step.status}
                          </span>
                          <MoreHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-px bg-border" />
                      <button
                        type="button"
                        className="rounded border border-dashed px-3 py-1 text-[11px] text-muted-foreground hover:border-gray-400 hover:text-foreground"
                      >
                        + Add step
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center md:hidden">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  What would you like to automate?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Describe your task and let AI build it for you
                </p>
              </div>
            </div>
          )}

          {selectedWorkflow && (
            <div className="flex h-10 items-center justify-between border-t px-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={testRunMutation.isPending}
                  onClick={() => testRunMutation.mutate(selectedWorkflow._id)}
                >
                  {testRunMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3" />
                  )}
                  Test run
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={toggleWorkflowMutation.isPending}
                  onClick={() => toggleWorkflowMutation.mutate(selectedWorkflow._id)}
                >
                  {toggleWorkflowMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Power className="size-3" />
                  )}
                  {selectedWorkflow.status === "active" ? "Turn off" : "Turn on"}
                </Button>
              </div>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["dashboard"] })}
              >
                <Save className="size-3" />
                Save Changes
              </Button>
            </div>
          )}
        </main>

        {showRightPanel && selectedWorkflow && (
          <aside className="flex w-full shrink-0 flex-col border-t bg-white md:w-72 md:border-l md:border-t-0">
            {showTriggerPanel && (
              <>
                <div className="flex h-10 items-center justify-between border-b px-3">
                  <span className="font-medium">Step 1</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="space-y-3 overflow-y-auto p-3">
                  <div>
                    <h2 className="font-semibold">On a schedule</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Runs this workflow automatically at the configured cadence.
                    </p>
                  </div>
                  <div className="rounded border px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Cadence
                    </p>
                    <p className="mt-0.5 font-medium">{selectedWorkflow.trigger.cadence}</p>
                  </div>
                </div>
              </>
            )}

            {selectedStep && (
              <>
                <div className="flex h-10 items-center justify-between border-b px-3">
                  <span className="font-medium">
                    Step {(selectedWorkflow.steps.findIndex((step) => step.id === selectedStep.id) ?? -1) + 2}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ProviderIcon provider={selectedStep.provider} />
                      <h2 className="font-semibold">{selectedStep.title}</h2>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{selectedStep.detail}</p>
                  </div>

                  {selectedStep.configSummary.length > 0 && (
                    <div className="space-y-1">
                      {selectedStep.configSummary.map((item) => (
                        <div key={item} className="flex items-start gap-1.5 rounded border px-2.5 py-2">
                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-green-600" />
                          <span className="text-[11px]">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {connections
                    .filter((connection) => connection.provider === selectedStep.provider)
                    .map((connection) => (
                      <div key={connection.provider} className="rounded border px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <ProviderIcon provider={connection.provider} />
                            <div>
                              <p className="font-medium">
                                {PROVIDER_META[connection.provider].label}
                              </p>
                              {connection.email && (
                                <p className="text-[10px] text-muted-foreground">
                                  {connection.email}
                                </p>
                              )}
                            </div>
                          </div>
                          {getConnectionReadiness(connection) ? (
                            <ConnectionBadge status={connection.status} />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px]"
                              onClick={() =>
                                window.location.assign(
                                  buildConnectionHref(connection.provider, returnTo),
                                )
                              }
                            >
                              {connection.status === "needs_reconnect"
                                ? "Reconnect"
                                : PROVIDER_META[connection.provider].buttonLabel}
                            </Button>
                          )}
                        </div>
                        {(connection.connectedAt ||
                          connection.lastSyncedAt ||
                          connection.lastError ||
                          connection.expiresAt) && (
                          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                            {connection.connectedAt && (
                              <p>Connected: {formatTimestamp(connection.connectedAt)}</p>
                            )}
                            {connection.lastSyncedAt && (
                              <p>Last live check: {formatTimestamp(connection.lastSyncedAt)}</p>
                            )}
                            {connection.expiresAt && (
                              <p>Access expires: {formatTimestamp(connection.expiresAt)}</p>
                            )}
                            <p>
                              {connection.canRefresh
                                ? "Refresh token available for automatic renewal."
                                : "No refresh token is stored for automatic renewal."}
                            </p>
                            {connection.lastError && (
                              <p className="text-amber-700">{connection.lastError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                  <div className="rounded border px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      {missingProvidersForSelected.length > 0 ? (
                        <CircleAlert className="size-3 shrink-0 text-amber-600" />
                      ) : (
                        <ShieldCheck className="size-3 shrink-0 text-green-600" />
                      )}
                      <span className="text-[11px] font-medium">
                        {missingProvidersForSelected.length > 0
                          ? "Authorization required"
                          : "Ready to run"}
                      </span>
                    </div>
                    {selectedWorkflow.lastRunSummary && (
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          selectedWorkflow.lastRunSummary.status === "error"
                            ? "text-red-700"
                            : selectedWorkflow.lastRunSummary.status === "needs_auth"
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        Last run: {formatTimestamp(selectedWorkflow.lastRunSummary.timestamp)}
                        {" - "}
                        {selectedWorkflow.lastRunSummary.message}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
