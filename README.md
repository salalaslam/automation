# Automation

Workflow studio for Gmail and Outlook built with Next.js App Router, Convex, TanStack Query, Tailwind CSS, and shadcn/ui. The current planner is intentionally stubbed so the runtime stays deterministic; OpenRouter can replace the planner later without changing the execution model.

## Stack

- Next.js 16 on Vercel
- Convex as the database and mutation/query runtime
- Clerk for user authentication
- Tailwind CSS v4 + shadcn/ui for the interface
- TanStack Query for client-side data orchestration

## Current scope

- Gmail and Outlook are the only supported workflow providers
- Turning a workflow on checks required mailbox connections first
- Gmail and Outlook OAuth is live, including token refresh handling and reconnect state
- Test runs perform live inbox checks against Gmail and Microsoft Graph before writing run summaries
- A built-in template can summarize today's Gmail and Outlook inbox messages into one deterministic digest
- Provider metadata and server runtime helpers are organized so new connectors can plug in later
- Workflow generation is stubbed with deterministic templates for now

## Local development

1. Copy `.env.example` to `.env.local`.
2. Fill in your Clerk, Google, and Microsoft credentials. Google and Microsoft keys are required for live OAuth and mailbox test runs.
3. Start a local Convex deployment:

```bash
pnpm convex dev --configure new --dev-deployment local --once
```

4. Start the app:

```bash
pnpm dev
```

If you want Convex to keep watching while you work, run this in a second terminal:

```bash
pnpm convex:dev
```

## OAuth redirect URIs

Use these redirect URIs in your provider consoles:

- Google: `http://localhost:3000/api/connections/gmail/callback`
- Microsoft: `http://localhost:3000/api/connections/outlook/callback`

For production on Vercel, swap the host for your deployed domain.

## Vercel deployment

1. Import the repo into Vercel.
2. Add every variable from `.env.example` in the Vercel project settings.
3. Create a cloud Convex deployment and set `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` from that deployment.
4. Update the Google and Microsoft redirect URIs to use the production domain.

## OpenRouter later

The stub planner is isolated in the route that creates workflows. When you are ready to add OpenRouter, replace the stub builder in the workflow generation route and keep the same workflow schema flowing into Convex.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
