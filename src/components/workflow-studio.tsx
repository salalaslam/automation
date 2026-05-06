"use client";

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
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DashboardData,
  MailProvider,
  PROVIDER_META,
  WorkflowRecord,
  WorkflowRunSummary,
  formatTimestamp,
} from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

const TRIGGER_ID = "__trigger__";

type WorkflowStudioProps = {
  authEnabled: boolean;
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
      missingProviders: MailProvider[];
    };

type TestRunResponse = {
  workflowId: string;
  run: WorkflowRunSummary;
};

type GeneratedWorkflowResponse = {
  workflow: WorkflowRecord;
};

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await response
    .json()
    .catch(() => ({ error: "The server returned an invalid response." }));

  if (!response.ok) {
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : "Request failed.",
      response.status,
    );
  }

  return payload as T;
}

function ProviderIcon({ provider }: { provider: MailProvider }) {
  const meta = PROVIDER_META[provider];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={meta.iconUrl}
      alt={meta.label}
      width={14}
      height={14}
      className="shrink-0 object-contain"
      loading="eager"
    />
  );
}

function UserControls() {
  const { isSignedIn } = useUser();
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button size="sm" className="h-6 text-[11px]">
          Sign in
        </Button>
      </SignInButton>
    );
  }
  return <UserButton />;
}

function SignInState() {
  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="max-w-sm space-y-3 text-center">
        <div className="space-y-1">
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground">
            Sign in with Clerk to load your workflow workspace and connect accounts.
          </p>
        </div>
        <SignInButton mode="modal">
          <Button size="sm" className="h-8 text-xs">
            Sign in to continue
          </Button>
        </SignInButton>
      </div>
    </div>
  );
}

function AuthorizationDialog({
  open,
  providers,
  onOpenChange,
}: {
  open: boolean;
  providers: MailProvider[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Authorization required</DialogTitle>
          <DialogDescription className="text-xs">
            Connect the following accounts to enable this workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <ProviderIcon provider={provider} />
                <span className="text-xs font-medium">{PROVIDER_META[provider].label}</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => window.location.assign(`/api/connections/${provider}/connect`)}
              >
                {PROVIDER_META[provider].buttonLabel}
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowStudio({ authEnabled }: WorkflowStudioProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState(
    "Clean Gmail and Outlook inboxes every morning and send me a short recap.",
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [authorizationProviders, setAuthorizationProviders] = useState<MailProvider[]>([]);
  const [authorizationOpen, setAuthorizationOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => requestJson<DashboardData>("/api/dashboard"),
  });

  const generateWorkflowMutation = useMutation({
    mutationFn: () =>
      requestJson<GeneratedWorkflowResponse>("/api/workflows/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: ({ workflow }) => {
      setSelectedWorkflowId(workflow._id);
      setSelectedStepId(null);
      setBanner("Stub workflow created.");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const toggleWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) =>
      requestJson<ToggleWorkflowResponse>(`/api/workflows/${workflowId}/toggle`, {
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
  });

  const testRunMutation = useMutation({
    mutationFn: (workflowId: string) =>
      requestJson<TestRunResponse>(`/api/workflows/${workflowId}/test-run`, {
        method: "POST",
      }),
    onSuccess: ({ run }) => {
      setBanner(run.message);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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

  const effectiveWorkflowId = selectedWorkflowId ?? workflows[0]?._id ?? null;
  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w._id === effectiveWorkflowId) ?? workflows[0],
    [effectiveWorkflowId, workflows],
  );

  const selectedStep = useMemo(
    () =>
      selectedStepId && selectedStepId !== TRIGGER_ID
        ? (selectedWorkflow?.steps.find((s) => s.id === selectedStepId) ?? null)
        : null,
    [selectedStepId, selectedWorkflow],
  );

  const showTriggerPanel = selectedStepId === TRIGGER_ID;
  const showRightPanel = Boolean(selectedStep) || showTriggerPanel;

  const oauthState = searchParams.get("oauth");
  const oauthProvider = searchParams.get("provider");

  const oauthBanner = useMemo(() => {
    if (!oauthState || !oauthProvider) return null;
    const label = oauthProvider === "gmail" ? "Gmail" : "Outlook Email";
    if (oauthState === "connected") return `${label} connected.`;
    if (oauthState === "missing_config") return `${label} OAuth credentials are missing.`;
    if (oauthState === "failed") return `${label} authorization failed.`;
    return null;
  }, [oauthProvider, oauthState]);

  useEffect(() => {
    if (oauthState === "connected") {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [oauthState, queryClient]);

  const connectedProviders = new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.provider),
  );

  const missingProvidersForSelected =
    selectedWorkflow?.requirements.filter((p) => !connectedProviders.has(p)) ?? [];

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dashboardQuery.error) {
    if (authEnabled && dashboardQuery.error instanceof ApiError && dashboardQuery.error.status === 401) {
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

  return (
    <>
      <AuthorizationDialog
        open={authorizationOpen}
        providers={authorizationProviders}
        onOpenChange={setAuthorizationOpen}
      />

      <div className="flex h-screen overflow-hidden bg-white text-xs">
        {/* ── Left sidebar ── */}
        <aside className="flex w-64 shrink-0 flex-col border-r bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            <h1 className="text-base font-bold leading-snug">
              What would you like to automate?
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Describe your task and let AI build it for you
            </p>

            {workflows.length > 0 && (
              <div className="mt-4 space-y-0.5">
                {workflows.map((workflow) => (
                  <button
                    key={workflow._id}
                    type="button"
                    onClick={() => {
                      setSelectedWorkflowId(workflow._id);
                      setSelectedStepId(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors",
                      effectiveWorkflowId === workflow._id
                        ? "bg-gray-100 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-gray-50 hover:text-foreground",
                    )}
                  >
                    {workflow.requirements.slice(0, 1).map((p) => (
                      <ProviderIcon key={p} provider={p} />
                    ))}
                    <span className="min-w-0 truncate">{workflow.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom prompt */}
          <div className="border-t">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
                  e.preventDefault();
                  generateWorkflowMutation.mutate();
                }
              }}
              placeholder="Describe what you want to automate..."
              className="min-h-[60px] resize-none border-0 bg-transparent px-3 py-2 text-[11px] shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-1 px-2 pb-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-6">
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
                className="h-6 gap-1 px-2 text-[11px]"
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
        </aside>

        {/* ── Center canvas ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-10 items-center justify-between border-b px-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="size-6">
                <ChevronLeft className="size-3.5" />
              </Button>
              {selectedWorkflow && (
                <>
                  <div className="flex items-center gap-1">
                    {selectedWorkflow.requirements.slice(0, 2).map((p) => (
                      <ProviderIcon key={p} provider={p} />
                    ))}
                  </div>
                  <span className="font-medium">{selectedWorkflow.name}</span>
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
              )}
            </div>
            <div className="flex items-center gap-2">
              {authEnabled && <UserControls />}
              <Button variant="outline" size="sm" className="h-6 text-[11px]">
                My Workflow
              </Button>
            </div>
          </header>

          {/* Banner */}
          {(banner ?? oauthBanner) && (
            <div className="border-b bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
              {banner ?? oauthBanner}
            </div>
          )}

          {/* Workflow canvas */}
          {selectedWorkflow ? (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mx-auto max-w-md">
                {/* STARTER */}
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

                {/* ACTIONS */}
                {selectedWorkflow.steps.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Actions
                    </p>
                    {selectedWorkflow.steps.map((step, i) => (
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
                          <ProviderIcon provider={step.provider} />
                          <span className="font-medium">
                            Step {i + 2}: {step.title}
                          </span>
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
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[11px] text-muted-foreground">
                Generate your first workflow using the prompt on the left.
              </p>
            </div>
          )}

          {/* Bottom action bar */}
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

        {/* ── Right panel ── */}
        {showRightPanel && (
          <aside className="flex w-72 shrink-0 flex-col border-l bg-white">
            {showTriggerPanel && selectedWorkflow && (
              <>
                <div className="flex h-10 items-center justify-between border-b px-3">
                  <span className="font-medium">Step 1</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="overflow-y-auto p-3 space-y-3">
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
                    Step{" "}
                    {(selectedWorkflow?.steps.findIndex((s) => s.id === selectedStep.id) ?? -1) +
                      2}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setSelectedStepId(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                    .filter((c) => c.provider === selectedStep.provider)
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
                          {connection.status === "connected" ? (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                              Connected
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px]"
                              onClick={() =>
                                window.location.assign(
                                  `/api/connections/${connection.provider}/connect`,
                                )
                              }
                            >
                              {PROVIDER_META[connection.provider].buttonLabel}
                            </Button>
                          )}
                        </div>
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
                    {selectedWorkflow?.lastRunSummary && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Last run: {formatTimestamp(selectedWorkflow.lastRunSummary.timestamp)}
                        {" — "}
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

