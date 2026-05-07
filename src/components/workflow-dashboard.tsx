"use client";

import Link from "next/link";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
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
    <div className="min-h-screen bg-white px-6 py-8 text-foreground sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex justify-end">{authEnabled && <UserControls />}</div>

        <section className="pt-8 text-center sm:pt-12">
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Automate your work with Workflows
          </h1>
          <p className="mt-6 text-base text-muted-foreground sm:text-lg">
            Create Workflow to manage tasks
          </p>
        </section>

        <section className="mt-16">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-3xl font-bold tracking-tight">My Workflows</h2>
            <Link
              href={workflows[0] ? `/workflows/${workflows[0]._id}` : "/workflows/new"}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View All
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <div className="rounded-3xl border border-border bg-white">
            {workflows.length === 0 ? (
              <div className="flex min-h-44 items-center justify-center px-6 py-10 text-center">
                <div className="space-y-2">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground">
                    <Sparkles className="size-4" />
                  </div>
                  <p className="text-2xl font-semibold text-zinc-600">No workflows yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create your first workflow to automate your tasks
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {workflows.map((workflow) => (
                  <Link
                    key={workflow._id}
                    href={`/workflows/${workflow._id}`}
                    className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {workflow.name}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                            workflow.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-muted-foreground",
                          )}
                        >
                          {workflow.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {workflow.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 sm:shrink-0">
                      <div className="flex items-center gap-2">
                        {workflow.requirements.map((provider) => (
                          <span key={provider} className="inline-flex items-center gap-1">
                            <ProviderIcon provider={provider} />
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Updated {formatTimestamp(workflow.updatedAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-14 pb-10">
          <h2 className="text-3xl font-bold tracking-tight">Start from Template</h2>

          <div className="mt-5 flex flex-wrap gap-3">
            {templateFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  activeFilter === filter
                    ? "border-foreground text-foreground"
                    : "border-border text-foreground/80 hover:border-foreground/40",
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {visibleTemplates.map((template) => (
              <Link
                key={template.id}
                href={{
                  pathname: "/workflows/new",
                  query: { prompt: template.prompt },
                }}
                className="rounded-3xl border border-border bg-white p-5 transition-colors hover:bg-zinc-50"
              >
                <div className="min-h-28">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    {template.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-muted-foreground">
                    {template.description}
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-2">
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