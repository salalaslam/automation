export const INTEGRATION_PROVIDERS = ["gmail", "outlook"] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type ProviderCategory = "mail";

export type ConnectionState =
  | "connected"
  | "disconnected"
  | "needs_reconnect";

export const PROVIDER_META: Record<
  IntegrationProvider,
  {
    category: ProviderCategory;
    label: string;
    description: string;
    iconUrl: string;
    accentClassName: string;
    buttonLabel: string;
  }
> = {
  gmail: {
    category: "mail",
    label: "Gmail",
    description: "Google Workspace mailboxes and cleanup rules.",
    iconUrl: "/gmail.svg",
    accentClassName: "from-rose-400 via-amber-300 to-lime-300",
    buttonLabel: "Connect",
  },
  outlook: {
    category: "mail",
    label: "Outlook Email",
    description: "Microsoft 365 inboxes, folders, and digest actions.",
    iconUrl: "/outlook.svg",
    accentClassName: "from-sky-600 via-cyan-400 to-blue-300",
    buttonLabel: "Connect",
  },
};

export function isIntegrationProvider(
  value: string,
): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}
