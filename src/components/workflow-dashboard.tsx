"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Loader2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PROVIDER_META,
  type IntegrationProvider,
} from "@/lib/provider-catalog";
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
      "Automatically scan all inboxes, classify low-value mail, and archive spam-heavy threads before your day starts.",
    prompt:
      "Every weekday morning, clean Gmail and Outlook inboxes, archive spam and promotions, and send me a short recap.",
    category: "Email",
    providers: ["outlook", "gmail"],
  },
  {
    id: "unread-digest",
    title: "Daily Unread Email Digest",
    description:
      "Review unread Gmail and Outlook messages from the last day and compile a concise morning digest with follow-up priorities.",
    prompt:
      "Every morning at 8 AM, review unread Gmail and Outlook emails from the last 24 hours and send me a prioritized digest.",
    category: "Productivity assistant",
    providers: ["gmail", "outlook"],
  },
  {
    id: "youtube-analysis",
    title: "YouTube Channel Analysis",
    description:
      "Track newly published videos, summarize themes, and email a research brief you can review without opening every tab.",
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
      <div className="flex min-h-screen items-center justify-center bg-[#fcfbf8]">
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
    <div className="min-h-screen bg-[#fcfbf8] text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(17,24,39,0.08),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-16 pt-6 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <Badge variant="outline" className="rounded-full border-black/10 bg-white/70 px-3 py-1 text-[11px]">
            Workflow automation studio
          </Badge>
          <div className="flex items-center gap-3">
            {!authEnabled && (
              <Badge variant="outline" className="rounded-full bg-white/70 px-3 py-1 text-[11px]">
                Demo mode
              </Badge>
            )}
            {authEnabled && <UserControls />}
          </div>
        </header>

        <section className="mx-auto flex max-w-3xl flex-col items-center px-2 pb-12 pt-12 text-center sm:pt-20">
          <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Automate your work with Workflows
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Create workflow systems for inbox cleanup, reporting, and recurring admin work without rebuilding the logic from scratch.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/workflows/new"
              className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}
            >
              <Plus className="size-4" />
              Create workflow
            </Link>
            <div className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-sm text-muted-foreground">
              {workflows.length} saved workflow{workflows.length === 1 ? "" : "s"}
            </div>
          </div>
        </section>

        <section className="mt-2">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
                My Workflows
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open an existing workflow or start a new one from a template.
              </p>
            </div>
            {workflows.length > 0 && (
              <Link
                href={`/workflows/${workflows[0]?._id}`}
                className="hidden items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 sm:inline-flex"
              >
                Open latest
                <ArrowRight className="size-4" />
              </Link>
            )}
          </div>

          {workflows.length === 0 ? (
            <div className="flex min-h-44 items-center justify-center rounded-[28px] border border-black/10 bg-white/80 px-6 py-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
              <div className="space-y-2">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-black/10 bg-zinc-50">
                  <Sparkles className="size-5 text-zinc-500" />
                </div>
                <p className="text-lg font-medium text-zinc-800">No workflows yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first workflow to automate recurring tasks.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workflows.map((workflow) => (
                <Link key={workflow._id} href={`/workflows/${workflow._id}`}>
                  <Card className="h-full rounded-[28px] border border-black/10 bg-white/90 py-0 shadow-[0_20px_60px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_26px_80px_rgba(15,23,42,0.08)]">
                    <CardHeader className="px-5 py-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <CardTitle className="text-xl font-semibold text-zinc-900">
                            {workflow.name}
                          </CardTitle>
                          <CardDescription className="line-clamp-2 text-sm leading-6">
                            {workflow.description}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={workflow.status === "active" ? "secondary" : "outline"}
                          className="rounded-full px-2.5 py-1 text-[11px] capitalize"
                        >
                          {workflow.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 px-5 pb-5">
                      <div className="flex items-center gap-2">
                        {workflow.requirements.map((provider) => (
                          <span
                            key={provider}
                            className={cn(
                              "flex size-9 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
                              PROVIDER_META[provider].accentClassName,
                            )}
                          >
                            <ProviderIcon provider={provider} />
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="size-4" />
                          Updated {formatTimestamp(workflow.updatedAt)}
                        </span>
                        <span className="font-medium text-zinc-800">Open</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-14">
          <div className="mb-5">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Start from Template
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prebuilt prompts for common automation patterns.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            {templateFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  activeFilter === filter
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-black/10 bg-white/80 text-zinc-700 hover:border-zinc-400 hover:text-zinc-900",
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {visibleTemplates.map((template) => (
              <Link
                key={template.id}
                href={{
                  pathname: "/workflows/new",
                  query: { prompt: template.prompt },
                }}
              >
                <Card className="h-full rounded-[28px] border border-black/10 bg-white/90 py-0 shadow-[0_20px_60px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_26px_80px_rgba(15,23,42,0.08)]">
                  <CardHeader className="px-5 py-5">
                    <CardTitle className="text-2xl font-semibold tracking-tight text-zinc-900">
                      {template.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-3 text-base leading-7">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between px-5 pb-5">
                    <div className="flex items-center gap-2">
                      {template.highlight === "ai" ? (
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-zinc-900 text-white">
                          <Sparkles className="size-4" />
                        </span>
                      ) : null}
                      {template.providers.map((provider) => (
                        <span
                          key={provider}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
                            PROVIDER_META[provider].accentClassName,
                          )}
                        >
                          <ProviderIcon provider={provider} />
                        </span>
                      ))}
                    </div>
                    <ArrowRight className="size-4 text-zinc-500" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}