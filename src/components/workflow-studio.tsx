"use client";

import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Loader2,
  Mail,
  Play,
  ShieldCheck,
  Sparkles,
  Workflow,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  WorkflowStep,
  formatTimestamp,
} from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

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

function ProviderGlyph({ provider }: { provider: MailProvider }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-semibold text-white shadow-sm",
        PROVIDER_META[provider].accentClassName,
      )}
    >
      {PROVIDER_META[provider].iconLetter}
    </div>
  );
}

function UserControls() {
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button className="rounded-full px-4">Sign in</Button>
      </SignInButton>
    );
  }

  return (
    <div className="rounded-full border border-black/8 bg-white/80 p-1 shadow-sm">
      <UserButton />
    </div>
  );
}

function StepTile({
  step,
  selected,
  onSelect,
}: {
  step: WorkflowStep;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-start gap-4 rounded-[1.6rem] border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(17,17,17,0.08)]",
        selected
          ? "border-black/10 bg-white shadow-[0_16px_50px_rgba(17,17,17,0.10)]"
          : "border-black/5 bg-white/70",
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <ProviderGlyph provider={step.provider} />
        <div className="h-full w-px flex-1 bg-black/8" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {PROVIDER_META[step.provider].label}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              {step.title}
            </h3>
          </div>
          <div
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
              step.status === "ready"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800",
            )}
          >
            {step.status}
          </div>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {step.configSummary.map((item) => (
            <span
              key={item}
              className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </button>
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
      <DialogContent
        className="max-w-[56rem] rounded-[2rem] border border-black/8 bg-white px-8 py-8 shadow-[0_30px_120px_rgba(0,0,0,0.18)] sm:max-w-[58rem]"
      >
        <DialogHeader className="items-center gap-3 pt-4 text-center">
          <DialogTitle className="text-4xl font-semibold text-foreground">
            Authorization Required
          </DialogTitle>
          <DialogDescription className="text-lg text-muted-foreground">
            To proceed, please connect the following accounts
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5 px-4 pb-2">
          {providers.map((provider) => (
            <div
              key={provider}
              className="flex items-center justify-between rounded-[1.5rem] bg-[#f5f5f6] px-7 py-7"
            >
              <div className="flex items-center gap-5">
                <ProviderGlyph provider={provider} />
                <span className="text-2xl font-medium text-foreground">
                  {PROVIDER_META[provider].label}
                </span>
              </div>
              <Button
                className="h-14 rounded-2xl px-6 text-xl font-semibold"
                onClick={() => window.location.assign(`/api/connections/${provider}/connect`)}
              >
                {PROVIDER_META[provider].buttonLabel}
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="border-t-0 bg-transparent px-4 pt-3">
          <Button
            variant="outline"
            className="h-16 w-full rounded-2xl border-black/10 text-2xl text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
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
      setSelectedStepId(workflow.steps[0]?.id ?? null);
      setBanner("New stub workflow created. OpenRouter can replace this planner later.");
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
        response.status === "active"
          ? "Workflow turned on. Deterministic execution is enabled."
          : "Workflow moved back to draft.",
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
    () => workflows.find((workflow) => workflow._id === effectiveWorkflowId) ?? workflows[0],
    [effectiveWorkflowId, workflows],
  );

  const effectiveStepId =
    selectedStepId && selectedWorkflow?.steps.some((step) => step.id === selectedStepId)
      ? selectedStepId
      : selectedWorkflow?.steps[0]?.id ?? null;

  const selectedStep = selectedWorkflow?.steps.find((step) => step.id === effectiveStepId) ?? selectedWorkflow?.steps[0];

  const oauthState = searchParams.get("oauth");
  const oauthProvider = searchParams.get("provider");

  const oauthBanner = useMemo(() => {
    if (!oauthState || !oauthProvider) {
      return null;
    }

    const providerLabel = oauthProvider === "gmail" ? "Gmail" : "Outlook Email";

    if (oauthState === "connected") {
      return `${providerLabel} connected. You can turn workflows on now.`;
    }

    if (oauthState === "missing_config") {
      return `${providerLabel} OAuth is scaffolded, but provider credentials are still missing.`;
    }

    if (oauthState === "failed") {
      return `${providerLabel} authorization failed. Check provider credentials and redirect URIs.`;
    }

    return null;
  }, [oauthProvider, oauthState]);

  useEffect(() => {
    if (oauthState === "connected") {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [oauthState, queryClient]);

  const connectedProviders = new Set(
    connections
      .filter((connection) => connection.status === "connected")
      .map((connection) => connection.provider),
  );

  const missingProvidersForSelected = selectedWorkflow?.requirements.filter(
    (provider) => !connectedProviders.has(provider),
  ) ?? [];

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-full border border-black/8 bg-white/80 px-5 py-3 text-sm text-muted-foreground shadow-[0_18px_60px_rgba(15,15,15,0.08)] backdrop-blur">
          <Loader2 className="size-4 animate-spin" />
          Loading workflow studio
        </div>
      </div>
    );
  }

  if (dashboardQuery.error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <Card className="surface-shadow w-full max-w-2xl rounded-[2rem] border border-black/8 bg-white/90 py-8">
          <CardHeader>
            <CardTitle className="text-3xl">Convex is not wired yet</CardTitle>
            <CardDescription className="max-w-xl text-base leading-7">
              {dashboardQuery.error instanceof ApiError
                ? dashboardQuery.error.message
                : "The dashboard API failed before the editor could load."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              Start a local Convex deployment, then refresh this page. The repository already contains the schema, route handlers, and seeded Gmail/Outlook workflow model.
            </p>
            <div className="rounded-2xl border border-black/8 bg-secondary px-4 py-4 text-secondary-foreground">
              <p className="font-medium text-foreground">Required before the UI can hydrate:</p>
              <p>Set NEXT_PUBLIC_CONVEX_URL in your environment and run Convex once.</p>
            </div>
          </CardContent>
        </Card>
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

      <main className="relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
        <div className="panel-grid surface-shadow relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1680px] flex-col overflow-hidden rounded-[2rem] border border-black/8 bg-white/58 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-[#dce8f6] via-transparent to-[#ead9bf]/70" />
          <header className="relative flex flex-wrap items-center justify-between gap-4 border-b border-black/6 px-6 py-5 lg:px-8">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full border border-black/8 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Automation
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-900">
                  <Bot className="size-3.5" />
                  Stub planner
                </span>
              </div>
              <h1 className="mt-4 font-heading text-4xl leading-tight text-foreground md:text-5xl">
                Deterministic inbox workflows for Gmail and Outlook.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                Generate a workflow from a plain-English prompt, tune each step, then gate activation on provider authorization before anything can run.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {authEnabled ? (
                <UserControls />
              ) : (
                <div className="rounded-full border border-black/8 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Demo mode
                </div>
              )}
            </div>
          </header>

          {banner ?? oauthBanner ? (
            <div className="relative border-b border-black/6 bg-white/75 px-6 py-3 text-sm text-muted-foreground lg:px-8">
              {banner ?? oauthBanner}
            </div>
          ) : null}

          <div className="relative grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(290px,0.88fr)_minmax(500px,1.3fr)_minmax(320px,0.92fr)] lg:p-6">
            <section className="flex min-h-[320px] flex-col gap-4 rounded-[1.8rem] border border-black/6 bg-[#fbf8f2]/90 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Workflow brief
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    Compose the operating plan
                  </h2>
                </div>
                <Sparkles className="size-5 text-muted-foreground" />
              </div>

              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-[210px] rounded-[1.5rem] border-black/8 bg-white px-4 py-4 text-base leading-7 shadow-sm"
                placeholder="Describe the mail automation you want to run."
              />

              <div className="flex flex-wrap gap-2">
                {[
                  "Clean Gmail and Outlook inboxes every morning and send me a short recap.",
                  "Move Outlook newsletters into a digest folder and archive old Gmail receipts.",
                  "Triage only Gmail promotions every weekday before 9 AM.",
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-black/8 bg-white px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-black/15 hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-3">
                <Button
                  className="h-11 rounded-full px-5"
                  disabled={generateWorkflowMutation.isPending || !prompt.trim()}
                  onClick={() => generateWorkflowMutation.mutate()}
                >
                  {generateWorkflowMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate stub workflow
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  OpenRouter is intentionally deferred. This version uses deterministic workflow stubs so the execution model stays predictable.
                </p>
              </div>
            </section>

            <section className="flex min-h-[320px] flex-col gap-4 rounded-[1.8rem] border border-black/6 bg-white/75 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/6 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Workflow lane
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-foreground">
                    {selectedWorkflow?.name ?? "Seeded automation"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {selectedWorkflow?.description ?? "Create a workflow to preview deterministic execution."}
                  </p>
                </div>

                {selectedWorkflow ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-full border-black/10 bg-white px-4"
                      disabled={testRunMutation.isPending}
                      onClick={() => testRunMutation.mutate(selectedWorkflow._id)}
                    >
                      {testRunMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      Test run
                    </Button>
                    <Button
                      className="rounded-full px-4"
                      disabled={toggleWorkflowMutation.isPending}
                      onClick={() => toggleWorkflowMutation.mutate(selectedWorkflow._id)}
                    >
                      {toggleWorkflowMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                      {selectedWorkflow.status === "active" ? "Turn off" : "Turn on"}
                    </Button>
                  </div>
                ) : null}
              </div>

              {selectedWorkflow ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Card className="rounded-[1.4rem] border border-black/6 bg-[#fbf8f2] py-0">
                      <CardContent className="flex items-center gap-3 px-4 py-4">
                        <CalendarClock className="size-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            Trigger
                          </p>
                          <p className="font-semibold text-foreground">{selectedWorkflow.trigger.cadence}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-[1.4rem] border border-black/6 bg-[#fbf8f2] py-0">
                      <CardContent className="flex items-center gap-3 px-4 py-4">
                        <Workflow className="size-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            Steps
                          </p>
                          <p className="font-semibold text-foreground">{selectedWorkflow.steps.length} deterministic blocks</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-[1.4rem] border border-black/6 bg-[#fbf8f2] py-0">
                      <CardContent className="flex items-center gap-3 px-4 py-4">
                        <Mail className="size-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                            Accounts required
                          </p>
                          <p className="font-semibold text-foreground">
                            {selectedWorkflow.requirements.map((provider) => PROVIDER_META[provider].label.replace(" Email", "")).join(" + ")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1">
                    <div className="space-y-4">
                      {selectedWorkflow.steps.map((step) => (
                        <StepTile
                          key={step.id}
                          step={step}
                          selected={selectedStep?.id === step.id}
                          onSelect={() => setSelectedStepId(step.id)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-[1.6rem] border border-dashed border-black/10 bg-[#fbf8f2] px-6 text-center text-sm leading-7 text-muted-foreground">
                  Generate your first workflow stub from the brief on the left.
                </div>
              )}
            </section>

            <aside className="flex min-h-[320px] flex-col gap-4 rounded-[1.8rem] border border-black/6 bg-[#f7f2ea]/90 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Step inspector
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">
                  {selectedStep?.title ?? "Select a step"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedStep?.detail ?? "Choose a generated block to inspect execution details and authorization requirements."}
                </p>
              </div>

              {selectedStep ? (
                <Card className="rounded-[1.5rem] border border-black/6 bg-white py-0">
                  <CardContent className="space-y-5 px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ProviderGlyph provider={selectedStep.provider} />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            Connector
                          </p>
                          <p className="text-base font-semibold text-foreground">
                            {PROVIDER_META[selectedStep.provider].label}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
                          selectedStep.status === "ready"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {selectedStep.status}
                      </span>
                    </div>

                    <div className="rounded-[1.3rem] bg-secondary px-4 py-4 text-sm leading-6 text-secondary-foreground">
                      This version executes only pre-defined connector operations. LLM-generated planning is stubbed, but runtime actions stay deterministic.
                    </div>

                    <div className="space-y-3">
                      {selectedStep.configSummary.map((item) => (
                        <div
                          key={item}
                          className="flex items-start gap-3 rounded-2xl border border-black/6 bg-[#fbf8f2] px-4 py-3"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
                          <span className="text-sm leading-6 text-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="rounded-[1.5rem] border border-black/6 bg-white py-0">
                <CardHeader className="pb-0">
                  <CardTitle>Connections</CardTitle>
                  <CardDescription>
                    Turning a workflow on is blocked until every required mailbox is connected.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pb-5">
                  {connections.map((connection) => (
                    <div
                      key={connection.provider}
                      className="rounded-[1.35rem] border border-black/6 bg-[#fbf8f2] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <ProviderGlyph provider={connection.provider} />
                          <div>
                            <p className="font-semibold text-foreground">
                              {PROVIDER_META[connection.provider].label}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {connection.email ?? formatTimestamp(connection.connectedAt)}
                            </p>
                          </div>
                        </div>
                        {connection.status === "connected" ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
                            Connected
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            className="rounded-full border-black/10 bg-white px-4"
                            onClick={() => window.location.assign(`/api/connections/${connection.provider}/connect`)}
                          >
                            {PROVIDER_META[connection.provider].buttonLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-[1.5rem] border border-black/6 bg-white py-0">
                <CardHeader className="pb-0">
                  <CardTitle>Execution status</CardTitle>
                  <CardDescription>
                    The workflow engine stays deterministic. LLM planning is a future layer, not part of runtime execution.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pb-5">
                  <div className="rounded-[1.35rem] bg-[#fbf8f2] px-4 py-4">
                    <div className="flex items-center gap-3 text-foreground">
                      {missingProvidersForSelected.length > 0 ? (
                        <CircleAlert className="size-4 text-amber-700" />
                      ) : (
                        <ShieldCheck className="size-4 text-emerald-700" />
                      )}
                      <span className="font-semibold">
                        {missingProvidersForSelected.length > 0
                          ? "Authorization is still required"
                          : "All required accounts are connected"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {missingProvidersForSelected.length > 0
                        ? `Still missing: ${missingProvidersForSelected
                            .map((provider) => PROVIDER_META[provider].label)
                            .join(", ")}.`
                        : "You can test run or activate the selected workflow without extra setup."}
                    </p>
                  </div>

                  <div className="rounded-[1.35rem] border border-black/6 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Last run
                    </p>
                    <div className="mt-2 flex items-start gap-3">
                      <ArrowRight className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">
                          {selectedWorkflow?.lastRunSummary?.message ?? "No run has been recorded yet."}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedWorkflow?.lastRunSummary
                            ? formatTimestamp(selectedWorkflow.lastRunSummary.timestamp)
                            : "Create or test a workflow to seed a run summary."}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white/60 px-4 py-4 text-sm leading-6 text-muted-foreground">
                Next planned layer: replace the stub generator with OpenRouter while keeping the same workflow schema and deterministic executor.
                <div className="mt-3 flex items-center gap-2 font-medium text-foreground">
                  View provider catalog
                  <ChevronRight className="size-4" />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
