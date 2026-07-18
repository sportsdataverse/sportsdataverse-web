import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn, signOut } from "next-auth/react";
import { Github } from "lucide-react";
import { Button } from "@components/ui/button";
import type { PlatformSessionProps } from "@lib/platform/auth";

/**
 * Shared chrome for the members-only /platform area: handles the
 * members-only gate (mirrors /packages/manage) and renders the tab nav +
 * session bar around authorized content.
 */

import { PLATFORM_TABS } from "./widgets";

export { PLATFORM_TABS, StatusBadge, Sparkline, formatBytes, timeAgo } from "./widgets";

type ShellProps = {
  session: PlatformSessionProps;
  title: string;
  children: React.ReactNode;
};

export default function PlatformShell({ session, title, children }: ShellProps) {
  const router = useRouter();
  const { authorized, signedIn, login } = session;

  if (!authorized) {
    return (
      <>
        <Head>
          <title>{title} · SportsDataverse Platform</title>
        </Head>
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text font-sarina text-3xl font-bold text-transparent">
            SportsDataverse Platform
          </h1>
          {signedIn ? (
            <p className="font-inter text-muted-foreground">
              Your GitHub account isn&apos;t an active member of the{" "}
              <span className="font-semibold">sportsdataverse</span> organization,
              so the platform is off limits. If you believe this is a mistake, ask
              an org admin to confirm your membership.
            </p>
          ) : (
            <p className="font-inter text-muted-foreground">
              The platform (automation, datasets, model runs, database status) is
              available to members of the{" "}
              <span className="font-semibold">sportsdataverse</span> GitHub
              organization. Sign in to continue.
            </p>
          )}
          <div className="flex gap-3">
            {signedIn ? (
              <Button variant="outline" onClick={() => signOut()}>
                Sign out
              </Button>
            ) : (
              <Button onClick={() => signIn("github", { callbackUrl: router.asPath })}>
                <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{title} · SportsDataverse Platform</title>
      </Head>
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text font-sarina text-3xl font-bold text-transparent">
            Platform
          </h1>
          <div className="flex items-center gap-3">
            <span className="font-inter text-sm text-muted-foreground">
              @{login}
            </span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mb-8 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
          {PLATFORM_TABS.map((tab) => {
            const active =
              tab.href === "/platform"
                ? router.pathname === "/platform"
                : router.pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2 font-inter text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </>
  );
}
