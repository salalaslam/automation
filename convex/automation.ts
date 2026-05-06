import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const providerValidator = v.union(v.literal("gmail"), v.literal("outlook"));
const workflowStatusValidator = v.union(v.literal("draft"), v.literal("active"));
const stepStatusValidator = v.union(v.literal("ready"), v.literal("attention"));
const runStatusValidator = v.union(
  v.literal("success"),
  v.literal("pending"),
  v.literal("needs_auth"),
);

const workflowDraftValidator = v.object({
  name: v.string(),
  description: v.string(),
  prompt: v.string(),
  status: workflowStatusValidator,
  requirements: v.array(providerValidator),
  trigger: v.object({
    label: v.string(),
    cadence: v.string(),
  }),
  steps: v.array(
    v.object({
      id: v.string(),
      provider: providerValidator,
      kind: v.string(),
      title: v.string(),
      detail: v.string(),
      status: stepStatusValidator,
      configSummary: v.array(v.string()),
    }),
  ),
  lastRunSummary: v.optional(
    v.object({
      status: runStatusValidator,
      message: v.string(),
      timestamp: v.number(),
    }),
  ),
});

const PROVIDERS = ["gmail", "outlook"] as const;

function seedWorkflowDraft() {
  const now = Date.now();

  return {
    name: "Triage Gmail + Outlook mail",
    description:
      "Clean Gmail and Outlook inboxes every morning and send a short recap after deterministic cleanup steps finish.",
    prompt:
      "Clean Gmail and Outlook inboxes every morning and send a short recap after deterministic cleanup steps finish.",
    status: "draft" as const,
    requirements: ["outlook", "gmail"] as Array<"outlook" | "gmail">,
    trigger: {
      label: "Daily inbox sweep",
      cadence: "Weekdays at 08:30",
    },
    steps: [
      {
        id: "review-outlook-1",
        provider: "outlook" as const,
        kind: "ingest",
        title: "Review Outlook inbox",
        detail: "Collect focused and other inbox threads from Microsoft 365.",
        status: "ready" as const,
        configSummary: [
          "Runs every morning at 08:30",
          "Returns a structured summary payload",
        ],
      },
      {
        id: "cleanup-gmail-2",
        provider: "gmail" as const,
        kind: "cleanup",
        title: "Apply Gmail cleanup rules",
        detail: "Archive newsletters, mark spam, and move receipts into labels.",
        status: "attention" as const,
        configSummary: [
          "Uses deterministic connector actions only",
          "Dry run enabled before archive or spam changes",
        ],
      },
      {
        id: "digest-outlook-3",
        provider: "outlook" as const,
        kind: "digest",
        title: "Compose Outlook recap",
        detail: "Create a short summary of everything triaged inside Outlook.",
        status: "ready" as const,
        configSummary: [
          "Returns a structured summary payload",
          "Sends a single recap after cleanup completes",
        ],
      },
    ],
    lastRunSummary: {
      status: "pending" as const,
      message: "Workspace seeded. Test run to simulate deterministic execution.",
      timestamp: now,
    },
  };
}

export const ensureWorkspace = mutation({
  args: {
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    for (const provider of PROVIDERS) {
      const existingConnection = await ctx.db
        .query("connections")
        .withIndex("by_owner_provider", (queryBuilder) =>
          queryBuilder.eq("ownerId", args.ownerId).eq("provider", provider),
        )
        .unique();

      if (!existingConnection) {
        await ctx.db.insert("connections", {
          ownerId: args.ownerId,
          provider,
          status: "disconnected",
          scopes: [],
          updatedAt: Date.now(),
        });
      }
    }

    const existingWorkflow = await ctx.db
      .query("workflows")
      .withIndex("by_owner", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId),
      )
      .first();

    if (!existingWorkflow) {
      const now = Date.now();
      const workflow = seedWorkflowDraft();

      await ctx.db.insert("workflows", {
        ownerId: args.ownerId,
        ...workflow,
        createdAt: now,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const getDashboard = query({
  args: {
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    const workflows = await ctx.db
      .query("workflows")
      .withIndex("by_owner", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId),
      )
      .collect();
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_owner", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId),
      )
      .collect();

    return {
      workflows: workflows.sort((left, right) => right.updatedAt - left.updatedAt),
      connections: connections.sort((left, right) =>
        left.provider.localeCompare(right.provider),
      ),
      generatedAt: Date.now(),
    };
  },
});

export const createWorkflowFromPrompt = mutation({
  args: {
    ownerId: v.string(),
    prompt: v.string(),
    workflow: workflowDraftValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const workflowId = await ctx.db.insert("workflows", {
      ownerId: args.ownerId,
      ...args.workflow,
      prompt: args.prompt,
      createdAt: now,
      updatedAt: now,
      lastRunSummary: args.workflow.lastRunSummary ?? {
        status: "pending",
        message: "Workflow drafted from stub planner.",
        timestamp: now,
      },
    });

    return ctx.db.get(workflowId);
  },
});

export const toggleWorkflow = mutation({
  args: {
    ownerId: v.string(),
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);

    if (!workflow || workflow.ownerId !== args.ownerId) {
      throw new Error("Workflow not found.");
    }

    const connections = await ctx.db
      .query("connections")
      .withIndex("by_owner", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId),
      )
      .collect();
    const connectedProviders = new Set(
      connections
        .filter((connection) => connection.status === "connected")
        .map((connection) => connection.provider),
    );
    const missingProviders = workflow.requirements.filter(
      (provider) => !connectedProviders.has(provider),
    );

    if (missingProviders.length > 0) {
      return {
        ok: false as const,
        error: "authorization_required" as const,
        workflowId: workflow._id,
        missingProviders,
      };
    }

    const nextStatus = workflow.status === "active" ? "draft" : "active";
    const now = Date.now();

    await ctx.db.patch(args.workflowId, {
      status: nextStatus,
      updatedAt: now,
      lastRunSummary: {
        status: nextStatus === "active" ? "success" : "pending",
        message:
          nextStatus === "active"
            ? "Workflow activated. Deterministic execution is enabled."
            : "Workflow returned to draft mode.",
        timestamp: now,
      },
    });

    return {
      ok: true as const,
      workflowId: workflow._id,
      status: nextStatus,
    };
  },
});

export const recordTestRun = mutation({
  args: {
    ownerId: v.string(),
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);

    if (!workflow || workflow.ownerId !== args.ownerId) {
      throw new Error("Workflow not found.");
    }

    const connections = await ctx.db
      .query("connections")
      .withIndex("by_owner", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId),
      )
      .collect();
    const connectedProviders = new Set(
      connections
        .filter((connection) => connection.status === "connected")
        .map((connection) => connection.provider),
    );
    const missingProviders = workflow.requirements.filter(
      (provider) => !connectedProviders.has(provider),
    );
    const now = Date.now();
    const runSummary =
      missingProviders.length > 0
        ? {
            status: "needs_auth" as const,
            message: `Test run blocked until ${missingProviders.join(" and ")} is connected.`,
            timestamp: now,
          }
        : {
            status: "success" as const,
            message: "Test run completed with stubbed planner output and deterministic connector steps.",
            timestamp: now,
          };

    await ctx.db.insert("workflowRuns", {
      ownerId: args.ownerId,
      workflowId: args.workflowId,
      status: runSummary.status,
      summary: runSummary.message,
      createdAt: now,
    });

    await ctx.db.patch(args.workflowId, {
      updatedAt: now,
      lastRunSummary: runSummary,
    });

    return runSummary;
  },
});

export const upsertConnection = mutation({
  args: {
    ownerId: v.string(),
    provider: providerValidator,
    email: v.optional(v.string()),
    scopes: v.array(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingConnection = await ctx.db
      .query("connections")
      .withIndex("by_owner_provider", (queryBuilder) =>
        queryBuilder.eq("ownerId", args.ownerId).eq("provider", args.provider),
      )
      .unique();

    if (existingConnection) {
      await ctx.db.patch(existingConnection._id, {
        status: "connected",
        email: args.email,
        scopes: args.scopes,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        connectedAt: existingConnection.connectedAt ?? now,
        updatedAt: now,
      });

      return null;
    }

    await ctx.db.insert("connections", {
      ownerId: args.ownerId,
      provider: args.provider,
      status: "connected",
      email: args.email,
      scopes: args.scopes,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      connectedAt: now,
      updatedAt: now,
    });

    return null;
  },
});
