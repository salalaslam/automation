import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import { AppProviders } from "@/components/providers/app-providers";
import { isClerkEnabled } from "@/lib/server/auth";
import "./globals.css";

export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Automation",
  description: "Workflow studio for Gmail and Outlook automations on Next.js, Convex, and Vercel.",
};

const clerkEnabled = isClerkEnabled();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = <AppProviders>{children}</AppProviders>;

  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="h-full">
        {clerkEnabled ? <ClerkProvider dynamic>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
