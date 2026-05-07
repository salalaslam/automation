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
  Power,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { buttonVariants, Button } from "@/components/ui/button";
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
      <div className="flex min-h-screen items-center justify-center bg-[#f8f6f1]">
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
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-xs space-y-1 text-center">
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
      <div className="flex min-h-screen items-center justify-center bg-[#f8f6f1] px-6">
        <div className="max-w-md rounded-[28px] border border-black/10 bg-white px-8 py-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-medium text-zinc-900">Workflow not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The selected workflow is no longer available. Return to the dashboard or create a new one.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
            >
              Back to dashboard
            </Link>
            <Link
              href="/workflows/new"
              className={cn(buttonVariants({ size: "sm" }), "rounded-full")}
            >
              Create workflow
            </Link>
          </div>
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

      <div className="min-h-screen bg-[#f8f6f1] text-xs text-foreground lg:flex">
        <aside className="flex w-full shrink-0 flex-col border-b border-black/10 bg-white/90 lg:min-h-screen lg:w-[24rem] lg:border-b-0 lg:border-r xl:w-[28rem]">
          <div className="flex-1 space-y-6 p-6">
            <div className="space-y-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-900"
              >
                <ChevronLeft className="size-3.5" />
                Back to dashboard
              </Link>

              {selectedWorkflow ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="inline-flex rounded-full border border-black/10 bg-zinc-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                      Active workspace
                    </span>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                      {selectedWorkflow.name}
                    </h1>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {selectedWorkflow.description}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-black/10 bg-[#f9f7f2] p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                      Connected apps
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedWorkflow.requirements.map((provider) => (
                        <div
                          key={provider}
                          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2"
                        >
                          <ProviderIcon provider={provider} />
                          <span className="text-[11px] font-medium text-zinc-700">
                            {PROVIDER_META[provider].label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-4 lg:pt-12">
                  <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
                    What would you like to automate?
                  </h1>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                    Describe the job in plain English. The builder will create a draft workflow you can test, connect, and refine on the right.
                  </p>
                </div>
              )}
            </div>

            {selectedWorkflow && (
              <div className="rounded-[24px] border border-black/10 bg-zinc-950 px-4 py-4 text-zinc-50 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                  Workflow status
                </p>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium capitalize">{selectedWorkflow.status}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Updated {formatTimestamp(selectedWorkflow.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {missingProvidersForSelected.length > 0 ? (
                      <CircleAlert className="size-4 text-amber-300" />
                    ) : (
                      <ShieldCheck className="size-4 text-emerald-300" />
                    )}
                    <span className="text-[11px] text-zinc-300">
                      {missingProvidersForSelected.length > 0
                        ? `${missingProvidersForSelected.length} connection${
                            missingProvidersForSelected.length === 1 ? "" : "s"
                          } missing`
                        : "Ready to run"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-black/10 bg-white p-4">
            <div className="rounded-[24px] border border-black/10 bg-[#fbfaf6] p-3 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
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
                className="min-h-24 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {!authEnabled && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                      Demo mode
                    </span>
                  )}
                  {authEnabled && <UserControls />}
                </div>
                <Button
                  size="sm"
                  className="rounded-full px-4"
                  disabled={generateWorkflowMutation.isPending || !prompt.trim()}
                  onClick={() => generateWorkflowMutation.mutate()}
                >
                  {generateWorkflowMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Generate
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/70 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-full lg:hidden")}
              >
                <ChevronLeft className="size-3.5" />
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                  Workflow builder
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  {selectedWorkflow ? (
                    <>
                      <span className="truncate text-sm font-medium text-zinc-900">
                        {selectedWorkflow.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          selectedWorkflow.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-zinc-100 text-zinc-500",
                        )}
                      >
                        {selectedWorkflow.status}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-zinc-900">Draft workflow</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
              >
                Dashboard
              </Link>
            </div>
          </header>

          {(banner ?? oauthBanner) && (
            <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-[11px] text-blue-700 sm:px-6">
              {banner ?? oauthBanner}
            </div>
          )}

          {selectedWorkflow ? (
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-xl rounded-[32px] border border-black/10 bg-white/85 px-5 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-8">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Starter
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStepId(selectedStepId === TRIGGER_ID ? null : TRIGGER_ID)
                      }
                      className={cn(
                        "flex flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
                        selectedStepId === TRIGGER_ID
                          ? "border-blue-300 bg-blue-50"
                          : "border-black/10 bg-white hover:bg-zinc-50",
                      )}
                    >
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">
                        Step 1: {selectedWorkflow.trigger.cadence}
                      </span>
                      <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" />
                    </button>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      Next run: {selectedWorkflow.trigger.cadence}
                    </span>
                  </div>
                </div>

                {selectedWorkflow.steps.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Actions
                    </p>
                    {selectedWorkflow.steps.map((step, index) => (
                      <div key={step.id} className="flex flex-col">
                        <div className="mx-auto h-4 w-px bg-border" />
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStepId(selectedStepId === step.id ? null : step.id)
                          }
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
                            selectedStepId === step.id
                              ? "border-blue-300 bg-blue-50"
                              : "border-black/10 bg-white hover:bg-zinc-50",
                          )}
                        >
                          <ProviderIcon provider={step.provider} />
                          <span className="font-medium">
                            Step {index + 2}: {step.title}
                          </span>
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              step.status === "ready"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {step.status}
                          </span>
                          <MoreHorizontal className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-px bg-border" />
                      <button
                        type="button"
                        className="rounded-full border border-dashed border-black/20 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-zinc-400 hover:text-foreground"
                      >
                        + Add step
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-16">
              <div className="max-w-md text-center">
                <p className="text-lg font-medium text-zinc-900">Generate your first workflow</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use the prompt composer on the left to create a draft. Once generated, this page becomes the dedicated workflow editor.
                </p>
              </div>
            </div>
          )}

          {selectedWorkflow && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={testRunMutation.isPending}
                  onClick={() => testRunMutation.mutate(selectedWorkflow._id)}
                >
                  {testRunMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Test run
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={toggleWorkflowMutation.isPending}
                  onClick={() => toggleWorkflowMutation.mutate(selectedWorkflow._id)}
                >
                  {toggleWorkflowMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Power className="size-3.5" />
                  )}
                  {selectedWorkflow.status === "active" ? "Turn off" : "Turn on"}
                </Button>
              </div>
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["dashboard"] })}
              >
                <Save className="size-3.5" />
                Save changes
              </Button>
            </div>
          )}
        </main>

        {showRightPanel && selectedWorkflow && (
          <aside className="w-full shrink-0 border-t border-black/10 bg-white lg:min-h-screen lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
            {showTriggerPanel && (
              <>
                <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                  <span className="font-medium text-zinc-900">Step 1</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">On a schedule</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Runs this workflow automatically at the configured cadence.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-black/10 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                      Cadence
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-900">
                      {selectedWorkflow.trigger.cadence}
                    </p>
                  </div>
                </div>
              </>
            )}

            {selectedStep && (
              <>
                <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                  <span className="font-medium text-zinc-900">
                    Step {(selectedWorkflow.steps.findIndex((step) => step.id === selectedStep.id) ?? -1) + 2}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={selectedStep.provider} />
                      <h2 className="text-sm font-semibold text-zinc-900">{selectedStep.title}</h2>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {selectedStep.detail}
                    </p>
                  </div>

                  {selectedStep.configSummary.length > 0 && (
                    <div className="space-y-2">
                      {selectedStep.configSummary.map((item) => (
                        <div
                          key={item}
                          className="flex items-start gap-2 rounded-2xl border border-black/10 px-4 py-3"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />
                          <span className="text-[11px] leading-5 text-zinc-700">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {connections
                    .filter((connection) => connection.provider === selectedStep.provider)
                    .map((connection) => (
                      <div
                        key={connection.provider}
                        className="rounded-2xl border border-black/10 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ProviderIcon provider={connection.provider} />
                            <div>
                              <p className="text-sm font-medium text-zinc-900">
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
                              className="h-7 rounded-full text-[11px]"
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
                          <div className="mt-3 space-y-1 text-[10px] leading-5 text-muted-foreground">
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

                  <div className="rounded-2xl border border-black/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                      {missingProvidersForSelected.length > 0 ? (
                        <CircleAlert className="size-3.5 shrink-0 text-amber-600" />
                      ) : (
                        <ShieldCheck className="size-3.5 shrink-0 text-green-600" />
                      )}
                      <span className="text-[11px] font-medium text-zinc-800">
                        {missingProvidersForSelected.length > 0
                          ? "Authorization required"
                          : "Ready to run"}
                      </span>
                    </div>
                    {selectedWorkflow.lastRunSummary && (
                      <p
                        className={cn(
                          "mt-2 text-[10px] leading-5",
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
