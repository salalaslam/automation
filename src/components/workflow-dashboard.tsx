"use client";

import Link from "next/link";
import { ChevronRight, Loader2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { type IntegrationProvider } from "@/lib/provider-catalog";
import { formatTimestamp } from "@/lib/workflow-model";
import { cn } from "@/lib/utils";

import {
  ApiError,
  ProviderIcon,
  SignInState,
  UserControls,
  useDashboardQuery,
} from "./workflow-shared";

type WorkflowDashboardProps = {
  authEnabled: boolean;
};

type TemplateFilter =
  | "All"
  | "Email"
  | "Data management"
  | "Marketing"
  | "Productivity assistant";

type WorkflowTemplate = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: Exclude<TemplateFilter, "All">;
  providers: IntegrationProvider[];
  highlight?: "ai";
};

const templateFilters: TemplateFilter[] = [
  "All",
  "Email",
  "Data management",
  "Marketing",
  "Productivity assistant",
];

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "today-mail-summary",
    title: "Today's Inbox Summary",
    description:
      "Collect today's Gmail and Outlook inbox messages, surface the main senders and topics, and produce one concise recap.",
    prompt:
      "Every weekday afternoon, gather today's Gmail and Outlook inbox messages and summarize the important threads, senders, and follow-ups for me.",
    category: "Productivity assistant",
    providers: ["gmail", "outlook"],
  },
  {
    id: "spam-cleanup",
    title: "Daily Spam Email Cleanup",
    description:
      "Automatically scan all inboxes, classify and clean up spam and low-value promotions before the workday begins.",
    prompt:
      "Every weekday morning, clean Gmail and Outlook inboxes, archive spam and promotions, and send me a short recap.",
    category: "Email",
    providers: ["outlook", "gmail"],
  },
  {
    id: "unread-digest",
    title: "Daily Unread Email Digest",
    description:
      "Every morning at 8 AM, review unread Gmail and Outlook messages from the last 24 hours and send a concise digest.",
    prompt:
      "Every morning at 8 AM, review unread Gmail and Outlook emails from the last 24 hours and send me a prioritized digest.",
    category: "Productivity assistant",
    providers: ["gmail", "outlook"],
  },
  {
    id: "youtube-analysis",
    title: "YouTube Channel Analysis",
    description:
      "Research new YouTube videos, summarize the important themes, and generate a report you can review from email.",
    prompt:
      "Research new YouTube videos from selected channels each day and send a Gmail briefing with key topics, trends, and recommendations.",
    category: "Marketing",
    providers: ["gmail"],
    highlight: "ai",
  },
];

export function WorkflowDashboard({ authEnabled }: WorkflowDashboardProps) {
  const dashboardQuery = useDashboardQuery();
  const [activeFilter, setActiveFilter] = useState<TemplateFilter>("All");

  const workflows = dashboardQuery.data?.workflows ?? [];
  const visibleTemplates = useMemo(
    () =>
      activeFilter === "All"
        ? workflowTemplates
        : workflowTemplates.filter((template) => template.category === activeFilter),
    [activeFilter],
  );

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
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

  return (
    <div className="min-h-screen bg-white px-4 py-4 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex justify-end">{authEnabled && <UserControls />}</div>

        <section className="pt-4 text-center">
          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground">
            Automate your work with Workflows
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Create Workflow to manage tasks
          </p>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">My Workflows</h2>
            <div className="flex items-center gap-2">
              <Link
                href={{ pathname: "/workflows/new", query: { prompt: "" } }}
                className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-zinc-50"
              >
                <Plus className="size-3" />
                New automation
              </Link>
              <Link
                href={workflows[0] ? `/workflows/${workflows[0]._id}` : "/workflows/new"}
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                View All
                <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>

          {workflows.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center px-4 py-6 text-center">
              <div className="space-y-1.5">
                <div className="mx-auto flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground">
                  <Sparkles className="size-3.5" />
                </div>
                <p className="text-sm font-medium text-zinc-600">No workflows yet</p>
                <p className="text-xs text-muted-foreground">
                  Create your first workflow to automate your tasks
                </p>
                <Link
                  href={{ pathname: "/workflows/new", query: { prompt: "" } }}
                  className="mx-auto mt-2 inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-zinc-50"
                >
                  <Plus className="size-3" />
                  New automation
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {workflows.map((workflow) => (
                <Link
                  key={workflow._id}
                  href={`/workflows/${workflow._id}`}
                  className="rounded border border-border bg-white p-3 transition-colors hover:bg-zinc-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {workflow.name}
                      </h3>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                          workflow.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-muted-foreground",
                        )}
                      >
                        {workflow.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {workflow.description}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    {workflow.requirements.map((provider) => (
                      <span key={provider} className="inline-flex items-center gap-1">
                        <ProviderIcon provider={provider} />
                      </span>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Updated {formatTimestamp(workflow.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 pb-6">
          <h2 className="text-base font-semibold">Start from Template</h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {templateFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  activeFilter === filter
                    ? "border-foreground text-foreground"
                    : "border-border text-foreground/80 hover:border-foreground/40",
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {visibleTemplates.map((template) => (
              <Link
                key={template.id}
                href={{
                  pathname: "/workflows/new",
                  query: { prompt: template.prompt },
                }}
                className="rounded border border-border bg-white p-3 transition-colors hover:bg-zinc-50"
              >
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {template.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {template.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  {template.highlight === "ai" ? (
                    <span className="inline-flex size-5 items-center justify-center text-foreground">
                      <Sparkles className="size-4" />
                    </span>
                  ) : null}
                  {template.providers.map((provider) => (
                    <span key={provider} className="inline-flex items-center gap-1">
                      <ProviderIcon provider={provider} />
                    </span>
                  ))}
                  <span className="ml-auto text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}