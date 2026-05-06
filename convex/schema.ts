import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const providerValidator = v.union(v.literal("gmail"), v.literal("outlook"));
const stepStatusValidator = v.union(v.literal("ready"), v.literal("attention"));
const workflowStatusValidator = v.union(v.literal("draft"), v.literal("active"));
const runStatusValidator = v.union(
  v.literal("success"),
  v.literal("pending"),
  v.literal("needs_auth"),
);

const stepValidator = v.object({
  id: v.string(),
  provider: providerValidator,
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

export default defineSchema({
  workflows: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    status: workflowStatusValidator,
    requirements: v.array(providerValidator),
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
    provider: providerValidator,
    status: v.union(v.literal("connected"), v.literal("disconnected")),
    email: v.optional(v.string()),
    scopes: v.array(v.string()),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    connectedAt: v.optional(v.number()),
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
