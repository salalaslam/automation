import {
  INTEGRATION_PROVIDERS,
  PROVIDER_META,
  type ConnectionState,
  type IntegrationProvider,
  type ProviderCategory,
} from "./provider-catalog";

export type { ConnectionState, IntegrationProvider, ProviderCategory };

export type WorkflowStatus = "draft" | "active";

export type StepStatus = "ready" | "attention";

export type RunStatus = "success" | "pending" | "needs_auth" | "error";

export type WorkflowTrigger = {
  label: string;
  cadence: string;
};

export type WorkflowStep = {
  id: string;
  provider: IntegrationProvider;
  kind: string;
  title: string;
  detail: string;
  status: StepStatus;
  configSummary: string[];
};

export type WorkflowRunSummary = {
  status: RunStatus;
  message: string;
  timestamp: number;
};

export type WorkflowRecord = {
  _id: string;
  name: string;
  description: string;
  prompt: string;
  status: WorkflowStatus;
  requirements: IntegrationProvider[];
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  lastRunSummary?: WorkflowRunSummary;
  createdAt: number;
  updatedAt: number;
};

export type AccountConnection = {
  provider: IntegrationProvider;
  category: ProviderCategory;
  status: ConnectionState;
  email?: string;
  scopes: string[];
  canRefresh: boolean;
  expiresAt?: number;
  connectedAt?: number;
  lastError?: string;
  lastSyncedAt?: number;
  updatedAt: number;
};

export type DashboardData = {
  workflows: WorkflowRecord[];
  connections: AccountConnection[];
  generatedAt: number;
};

export type WorkflowDraftInput = Omit<
  WorkflowRecord,
  "_id" | "createdAt" | "updatedAt"
>;

const STEP_LIBRARY: Record<
  IntegrationProvider,
  Array<{ kind: string; title: string; detail: string }>
> = {
  gmail: [
    {
      kind: "ingest",
      title: "Scan Gmail inbox",
      detail: "Collect unread, promotional, and low-priority threads from Gmail.",
    },
    {
      kind: "cleanup",
      title: "Apply Gmail cleanup rules",
      detail: "Archive newsletters, mark spam, and move receipts into labels.",
    },
    {
      kind: "digest",
      title: "Send Gmail digest",
      detail: "Summarize what changed and flag anything that needs manual review.",
    },
  ],
  outlook: [
    {
      kind: "ingest",
      title: "Review Outlook inbox",
      detail: "Collect focused and other inbox threads from Microsoft 365.",
    },
    {
      kind: "cleanup",
      title: "Sort Outlook conversations",
      detail: "Move updates into folders, archive stale threads, and tag follow-ups.",
    },
    {
      kind: "digest",
      title: "Compose Outlook recap",
      detail: "Create a short summary of everything triaged inside Outlook.",
    },
  ],
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function isTodayMessagesSummaryPrompt(prompt: string) {
  return /\btoday'?s?\b/i.test(prompt)
    && /\b(messages?|emails?|mail)\b/i.test(prompt)
    && /\b(summary|summarize|digest|recap|brief)\b/i.test(prompt);
}

function buildTodayMessagesSummaryWorkflow(
  prompt: string,
  requirements: IntegrationProvider[],
): WorkflowDraftInput {
  const providerLabel = requirements
    .map((provider) => PROVIDER_META[provider].label.replace(" Email", ""))
    .join(" + ");
  const finalProvider = requirements[0];
  const steps: WorkflowStep[] = [
    ...requirements.map((provider, index) => ({
      id: `${slug(`collect ${provider} today messages`)}-${index + 1}`,
      provider,
      kind: "ingest",
      title: `Collect today's ${PROVIDER_META[provider].label.replace(" Email", "")} messages`,
      detail:
        provider === "gmail"
          ? "Pull Gmail inbox messages received today with sender, subject, and preview metadata."
          : "Pull Outlook inbox messages received today with sender, subject, and preview metadata.",
      status: "ready" as const,
      configSummary: [
        "Filters inbox mail received since local midnight",
        "Captures sender, subject, timestamp, and preview text",
      ],
    })),
    {
      id: `${slug("summarize today inbox activity")}-${requirements.length + 1}`,
      provider: finalProvider,
      kind: "digest",
      title: "Summarize today's inbox activity",
      detail:
        "Combine Gmail and Outlook messages into one concise digest with key senders, topics, and likely follow-ups.",
      status: "attention",
      configSummary: [
        "Produces a deterministic cross-provider summary",
        "Highlights urgent threads and repeated senders first",
      ],
    },
  ];

  return {
    name: `Summarize today's ${providerLabel} messages`,
    description: prompt,
    prompt,
    status: "draft",
    requirements,
    trigger: {
      label: "Today's inbox digest",
      cadence: "Weekdays at 17:30",
    },
    steps,
    lastRunSummary: {
      status: "pending",
      message: "Workflow drafted. Test run to generate a same-day inbox summary.",
      timestamp: Date.now(),
    },
  };
}

export function deriveProvidersFromPrompt(
  prompt: string,
): IntegrationProvider[] {
  const normalized = normalizePrompt(prompt);
  const wantsGmail = /gmail|google/i.test(normalized);
  const wantsOutlook = /outlook|microsoft|office 365/i.test(normalized);

  if (wantsGmail && wantsOutlook) {
    return ["gmail", "outlook"];
  }

  if (wantsOutlook) {
    return ["outlook"];
  }

  if (wantsGmail) {
    return ["gmail"];
  }

  return [...INTEGRATION_PROVIDERS];
}

export function buildStubWorkflow(prompt: string): WorkflowDraftInput {
  const normalized = normalizePrompt(prompt);
  const requirements = deriveProvidersFromPrompt(normalized);

  if (isTodayMessagesSummaryPrompt(normalized)) {
    return buildTodayMessagesSummaryWorkflow(normalized, requirements);
  }

  const stepSeed = requirements.flatMap((provider) => STEP_LIBRARY[provider].slice(0, 2));
  const finalProvider = requirements[0];
  const digestStep = STEP_LIBRARY[finalProvider][2];
  const steps: WorkflowStep[] = [...stepSeed, digestStep].map((step, index) => ({
    id: `${slug(step.title)}-${index + 1}`,
    provider: index === stepSeed.length ? finalProvider : requirements[Math.min(index >> 1, requirements.length - 1)],
    kind: step.kind,
    title: step.title,
    detail: step.detail,
    status: index === 1 ? "attention" : "ready",
    configSummary: [
      index === 0 ? "Runs every morning at 08:30" : "Uses deterministic connector actions only",
      step.kind === "cleanup" ? "Dry run enabled before archive or spam changes" : "Returns a structured summary payload",
    ],
  }));

  const verb = /digest|summary|report/i.test(normalized)
    ? "Deliver"
    : /archive|clean|cleanup|triage/i.test(normalized)
      ? "Triage"
      : "Orchestrate";

  return {
    name: `${verb} ${requirements.map((provider) => PROVIDER_META[provider].label.replace(" Email", "")).join(" + ")} mail`,
    description: normalized,
    prompt: normalized,
    status: "draft",
    requirements,
    trigger: {
      label: "Daily inbox sweep",
      cadence: "Weekdays at 08:30",
    },
    steps,
    lastRunSummary: {
      status: "pending",
      message: "LLM planning is stubbed for now; workflow structure is deterministic.",
      timestamp: Date.now(),
    },
  };
}

export function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return "Not connected yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function getConnectionReadiness(connection: AccountConnection) {
  return connection.status === "connected";
}
