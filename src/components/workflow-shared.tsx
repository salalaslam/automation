"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROVIDER_META, type IntegrationProvider } from "@/lib/provider-catalog";
import { type DashboardData } from "@/lib/workflow-model";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function getMutationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

export async function requestJson<T>(input: string, init?: RequestInit) {
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

export function useDashboardQuery() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => requestJson<DashboardData>("/api/dashboard"),
  });
}

export function buildConnectionHref(
  provider: IntegrationProvider,
  returnTo?: string,
) {
  const params = new URLSearchParams();

  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query
    ? `/api/connections/${provider}/connect?${query}`
    : `/api/connections/${provider}/connect`;
}

export function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  const meta = PROVIDER_META[provider];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={meta.iconUrl}
      alt={meta.label}
      width={16}
      height={16}
      className="shrink-0 object-contain"
      loading="eager"
    />
  );
}

export function ConnectionBadge({
  status,
}: {
  status: "connected" | "disconnected" | "needs_reconnect";
}) {
  if (status === "connected") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        Connected
      </span>
    );
  }

  if (status === "needs_reconnect") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        Reconnect
      </span>
    );
  }

  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Not connected
    </span>
  );
}

export function UserControls() {
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button size="sm" className="h-8 text-xs">
          Sign in
        </Button>
      </SignInButton>
    );
  }

  return <UserButton />;
}

export function SignInState() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
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

export function AuthorizationDialog({
  open,
  providers,
  onOpenChange,
  returnTo,
}: {
  open: boolean;
  providers: IntegrationProvider[];
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
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
              className="flex items-center justify-between rounded-xl border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <ProviderIcon provider={provider} />
                <span className="text-xs font-medium">{PROVIDER_META[provider].label}</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  window.location.assign(buildConnectionHref(provider, returnTo))
                }
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