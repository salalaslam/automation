import {
  INTEGRATION_PROVIDERS,
  PROVIDER_META,
  type ConnectionState,
  type IntegrationProvider,
  type ProviderCategory,
} from "./provider-catalog";

export type { ConnectionState, IntegrationProvider, ProviderCategory };

export const STEP_PROVIDERS = [
  ...INTEGRATION_PROVIDERS,
  "google-drive",
  "google-docs",
  "slack",
  "salesforce",
  "google-calendar",
  "ai",
] as const;

export type StepProvider = (typeof STEP_PROVIDERS)[number];

export type StepAvailability = "live" | "preview";

export type StepCatalogOption = {
  id: string;
  provider: StepProvider;
  kind: string;
  title: string;
  detail: string;
  configSummary: string[];
  availability: StepAvailability;
};

export type StepCatalogGroup = {
  id: string;
  title: string;
  description: string;
  options: StepCatalogOption[];
};

export const STEP_PROVIDER_META: Record<
  StepProvider,
  { label: string; availability: StepAvailability }
> = {
  gmail: {
    label: "Gmail",
    availability: "live",
  },
  outlook: {
    label: "Outlook Email",
    availability: "live",
  },
  "google-drive": {
    label: "Google Drive",
    availability: "preview",
  },
  "google-docs": {
    label: "Google Docs",
    availability: "preview",
  },
  slack: {
    label: "Slack",
    availability: "preview",
  },
  salesforce: {
    label: "Salesforce",
    availability: "preview",
  },
  "google-calendar": {
    label: "Google Calendar",
    availability: "preview",
  },
  "ai": {
    label: "AI",
    availability: "preview",
  },
};

export const STEP_OPTION_GROUPS: StepCatalogGroup[] = [
  {
    id: "mail",
    title: "Mail",
    description: "Live mailbox actions that work with the current Gmail and Outlook connections.",
    options: [
      {
        id: "gmail-scan-inbox",
        provider: "gmail",
        kind: "ingest",
        title: "Scan Gmail inbox",
        detail: "Collect unread, promotional, and low-priority threads from Gmail.",
        configSummary: [
          "Reads inbox threads with sender, subject, and preview metadata",
          "Compatible with deterministic cleanup and digest actions",
        ],
        availability: "live",
      },
      {
        id: "gmail-cleanup-rules",
        provider: "gmail",
        kind: "cleanup",
        title: "Apply Gmail cleanup rules",
        detail: "Archive newsletters, mark spam, and move receipts into labels.",
        configSummary: [
          "Uses deterministic Gmail actions only",
          "Dry run remains available before mailbox changes",
        ],
        availability: "live",
      },
      {
        id: "gmail-send-digest",
        provider: "gmail",
        kind: "digest",
        title: "Send Gmail digest",
        detail: "Summarize what changed and flag anything that needs manual review.",
        configSummary: [
          "Outputs a concise recap payload",
          "Highlights urgent or repeated senders first",
        ],
        availability: "live",
      },
      {
        id: "outlook-review-inbox",
        provider: "outlook",
        kind: "ingest",
        title: "Review Outlook inbox",
        detail: "Collect focused and other inbox threads from Microsoft 365.",
        configSummary: [
          "Pulls Outlook threads with structured mailbox metadata",
          "Pairs with Outlook cleanup and recap actions",
        ],
        availability: "live",
      },
      {
        id: "outlook-sort-conversations",
        provider: "outlook",
        kind: "cleanup",
        title: "Sort Outlook conversations",
        detail: "Move updates into folders, archive stale threads, and tag follow-ups.",
        configSummary: [
          "Targets Microsoft 365 folders and follow-up flows",
          "Keeps the workflow deterministic and auditable",
        ],
        availability: "live",
      },
      {
        id: "outlook-compose-recap",
        provider: "outlook",
        kind: "digest",
        title: "Compose Outlook recap",
        detail: "Create a short summary of everything triaged inside Outlook.",
        configSummary: [
          "Produces a concise Outlook recap message",
          "Designed for end-of-run reporting",
        ],
        availability: "live",
      },
    ],
  },
  {
    id: "drive",
    title: "Drive",
    description: "File handling steps you can stage now while connector runtime support is being wired.",
    options: [
      {
        id: "drive-read-file",
        provider: "google-drive",
        kind: "read",
        title: "Read file",
        detail: "Open a specific Drive file and extract structured content for later steps.",
        configSummary: [
          "Targets a known Google Drive file",
          "Passes extracted content to downstream actions",
        ],
        availability: "preview",
      },
      {
        id: "drive-search-files",
        provider: "google-drive",
        kind: "search",
        title: "Search files",
        detail: "Find Drive files by name, owner, or metadata before processing them.",
        configSummary: [
          "Searches Drive by query and metadata filters",
          "Designed for document lookup flows",
        ],
        availability: "preview",
      },
      {
        id: "drive-upload-file",
        provider: "google-drive",
        kind: "write",
        title: "Upload file",
        detail: "Create a new Drive file from generated content or attachments.",
        configSummary: [
          "Stages file creation in the target Drive workspace",
          "Useful for reports, exports, and archives",
        ],
        availability: "preview",
      },
    ],
  },
  {
    id: "docs",
    title: "Docs",
    description: "Document operations for drafting, reading, and appending generated content.",
    options: [
      {
        id: "docs-search-documents",
        provider: "google-docs",
        kind: "search",
        title: "Search documents",
        detail: "Find matching Google Docs before reading or updating them.",
        configSummary: [
          "Searches docs by title and metadata",
          "Pairs well with document read and append flows",
        ],
        availability: "preview",
      },
      {
        id: "docs-read-document",
        provider: "google-docs",
        kind: "read",
        title: "Read document",
        detail: "Load an existing document and extract the latest body content.",
        configSummary: [
          "Designed for reference and summarization tasks",
          "Preserves the source document as read-only input",
        ],
        availability: "preview",
      },
      {
        id: "docs-create-document",
        provider: "google-docs",
        kind: "write",
        title: "Create document",
        detail: "Generate a new Google Doc to hold notes, recaps, or workflow output.",
        configSummary: [
          "Creates a new document from workflow output",
          "Ideal for reports and generated briefs",
        ],
        availability: "preview",
      },
      {
        id: "docs-append-document",
        provider: "google-docs",
        kind: "write",
        title: "Append to document",
        detail: "Add new generated content to the end of an existing Google Doc.",
        configSummary: [
          "Appends structured output without overwriting prior content",
          "Useful for daily logs and rolling reports",
        ],
        availability: "preview",
      },
    ],
  },
  {
    id: "slack",
    title: "Slack",
    description: "Messaging and workspace discovery steps for downstream notifications and triage.",
    options: [
      {
        id: "slack-send-message",
        provider: "slack",
        kind: "notify",
        title: "Send message",
        detail: "Post a message into a Slack channel or DM when the workflow finishes.",
        configSummary: [
          "Targets a selected channel or direct conversation",
          "Fits approval, alerting, and recap use cases",
        ],
        availability: "preview",
      },
      {
        id: "slack-search-messages",
        provider: "slack",
        kind: "search",
        title: "Search messages",
        detail: "Look up recent Slack messages before deciding what to post or summarize.",
        configSummary: [
          "Searches recent Slack conversation history",
          "Useful for context-aware follow-up actions",
        ],
        availability: "preview",
      },
      {
        id: "slack-lookup-users",
        provider: "slack",
        kind: "lookup",
        title: "Lookup users/channels",
        detail: "Resolve Slack people or channels dynamically before sending updates.",
        configSummary: [
          "Supports dynamic channel and owner routing",
          "Helps workflows stay reusable across teams",
        ],
        availability: "preview",
      },
    ],
  },
  {
    id: "salesforce",
    title: "Salesforce",
    description: "CRM steps for reading and staging record updates inside larger automations.",
    options: [
      {
        id: "salesforce-query-records",
        provider: "salesforce",
        kind: "query",
        title: "Query records",
        detail: "Run a targeted records query to feed leads, contacts, or opportunities into the workflow.",
        configSummary: [
          "Designed for structured record retrieval",
          "Feeds CRM data into downstream routing decisions",
        ],
        availability: "preview",
      },
      {
        id: "salesforce-search-records",
        provider: "salesforce",
        kind: "search",
        title: "Search records",
        detail: "Search Salesforce objects by keyword before selecting the next action.",
        configSummary: [
          "Helps locate related accounts and contacts quickly",
          "Supports interactive CRM lookup flows",
        ],
        availability: "preview",
      },
      {
        id: "salesforce-create-record",
        provider: "salesforce",
        kind: "write",
        title: "Create record",
        detail: "Stage creation of a Salesforce record when the workflow produces a new lead or case.",
        configSummary: [
          "Targets standard CRM creation flows",
          "Useful for intake and handoff automations",
        ],
        availability: "preview",
      },
      {
        id: "salesforce-update-record",
        provider: "salesforce",
        kind: "write",
        title: "Update record",
        detail: "Prepare a record update step for ownership, status, or follow-up changes.",
        configSummary: [
          "Supports staged CRM status and field updates",
          "Fits sales and support orchestration patterns",
        ],
        availability: "preview",
      },
    ],
  },
  {
    id: "calendar",
    title: "Google Calendar",
    description: "Calendar discovery and event creation steps for follow-up scheduling.",
    options: [
      {
        id: "calendar-search-events",
        provider: "google-calendar",
        kind: "search",
        title: "Search events",
        detail: "Look up upcoming events before proposing time or sending a recap.",
        configSummary: [
          "Reads the target calendar for scheduling context",
          "Useful before creating a follow-up event",
        ],
        availability: "preview",
      },
      {
        id: "calendar-create-event",
        provider: "google-calendar",
        kind: "write",
        title: "Create event",
        detail: "Stage a calendar event when the workflow determines a follow-up should be scheduled.",
        configSummary: [
          "Creates a structured event from workflow output",
          "Fits reminders, reviews, and handoff scheduling",
        ],
        availability: "preview",
      },
    ],
  },
];

export type WorkflowStatus = "draft" | "active";

export type StepStatus = "ready" | "attention";

export type RunStatus = "success" | "pending" | "needs_auth" | "error";

export type WorkflowChatRole = "user" | "assistant";

export type WorkflowChatMessage = {
  id: string;
  role: WorkflowChatRole;
  content: string;
  createdAt: number;
};

export type WorkflowTrigger = {
  label: string;
  cadence: string;
};

export type WorkflowStep = {
  id: string;
  provider: StepProvider;
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
  chatMessages?: WorkflowChatMessage[];
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

export function isIntegrationStepProvider(
  provider: StepProvider,
): provider is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(provider);
}

export function getStepCatalogOption(optionId: string) {
  return STEP_OPTION_GROUPS.flatMap((group) => group.options).find(
    (option) => option.id === optionId,
  );
}

export function buildWorkflowStepFromOption(optionId: string): WorkflowStep {
  const option = getStepCatalogOption(optionId);

  if (!option) {
    throw new Error("Step option not found.");
  }

  return {
    id: `${slug(option.title)}-${Date.now().toString(36)}`,
    provider: option.provider,
    kind: option.kind,
    title: option.title,
    detail: option.detail,
    status: option.availability === "live" ? "ready" : "attention",
    configSummary:
      option.availability === "live"
        ? option.configSummary
        : [
            ...option.configSummary,
            "Connector execution is staged as a preview while runtime support is being wired.",
          ],
  };
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

export function buildWorkflowAssistantReply(
  workflow: Pick<WorkflowRecord, "name" | "requirements" | "steps">,
) {
  const providerLabels = workflow.requirements.map((provider) =>
    PROVIDER_META[provider].label.replace(" Email", ""),
  );

  const providerSummary =
    providerLabels.length > 0
      ? ` across ${providerLabels.join(" + ")}`
      : "";
  const stepLabel = workflow.steps.length === 1 ? "step" : "steps";

  return `Generated workflow \"${workflow.name}\" with ${workflow.steps.length} ${stepLabel}${providerSummary}. Review the draft on the right and keep chatting to refine it.`;
}

export function createWorkflowChatTranscript(
  prompt: string,
  workflow: Pick<WorkflowRecord, "name" | "requirements" | "steps">,
  createdAt = Date.now(),
): WorkflowChatMessage[] {
  const normalizedPrompt = normalizePrompt(prompt);

  return [
    {
      id: `user-${createdAt}`,
      role: "user",
      content: normalizedPrompt,
      createdAt,
    },
    {
      id: `assistant-${createdAt + 1}`,
      role: "assistant",
      content: buildWorkflowAssistantReply(workflow),
      createdAt: createdAt + 1,
    },
  ];
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
      provider: "ai" as const,
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
