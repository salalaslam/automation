import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const integrationProviderValidator = v.union(
  v.literal("gmail"),
  v.literal("outlook"),
);
const stepProviderValidator = v.union(
  integrationProviderValidator,
  v.literal("google-drive"),
  v.literal("google-docs"),
  v.literal("slack"),
  v.literal("salesforce"),
  v.literal("google-calendar"),
);
const connectionStatusValidator = v.union(
  v.literal("connected"),
  v.literal("disconnected"),
  v.literal("needs_reconnect"),
);
const stepStatusValidator = v.union(v.literal("ready"), v.literal("attention"));
const workflowStatusValidator = v.union(v.literal("draft"), v.literal("active"));
const runStatusValidator = v.union(
  v.literal("success"),
  v.literal("pending"),
  v.literal("needs_auth"),
  v.literal("error"),
);

const stepValidator = v.object({
  id: v.string(),
  provider: stepProviderValidator,
  kind: v.string(),
  title: v.string(),
  detail: v.string(),
  status: stepStatusValidator,
  configSummary: v.array(v.string()),
});

const runSummaryValidator = v.object({
  status: runStatusValidator,
  message: v.string(),
  timestamp: v.number(),
});

const chatMessageValidator = v.object({
  id: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  createdAt: v.number(),
});

export default defineSchema({
  workflows: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    chatMessages: v.optional(v.array(chatMessageValidator)),
    status: workflowStatusValidator,
    requirements: v.array(integrationProviderValidator),
    trigger: v.object({
      label: v.string(),
      cadence: v.string(),
    }),
    steps: v.array(stepValidator),
    lastRunSummary: v.optional(runSummaryValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  connections: defineTable({
    ownerId: v.string(),
    provider: integrationProviderValidator,
    category: v.optional(v.literal("mail")),
    status: connectionStatusValidator,
    email: v.optional(v.string()),
    scopes: v.array(v.string()),
    canRefresh: v.optional(v.boolean()),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    connectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_provider", ["ownerId", "provider"]),
  workflowRuns: defineTable({
    ownerId: v.string(),
    workflowId: v.id("workflows"),
    status: runStatusValidator,
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_workflow", ["workflowId"]),
});
