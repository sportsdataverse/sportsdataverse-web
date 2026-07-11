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

export const PLATFORM_TABS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/automation", label: "Automation" },
  { href: "/platform/datasets", label: "Datasets" },
  { href: "/platform/models", label: "Models" },
  { href: "/platform/database", label: "Database" },
] as const;

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

// ---------------------------------------------------------------------------
// Small shared widgets
// ---------------------------------------------------------------------------

/** Colored chip for workflow conclusions / run statuses / booleans. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "unknown").toLowerCase();
  const tone =
    value === "success" || value === "completed" || value === "ok" || value === "passed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : value === "in_progress" || value === "queued" || value === "running" || value === "stale"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : value === "unknown" || value === "none"
          ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

/** Inline SVG sparkline — avoids a charting dependency for trend-at-a-glance. */
export function Sparkline({ values, width = 120, height = 28 }: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <span className="font-inter text-xs text-muted-foreground">–</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = pad + (i * (width - 2 * pad)) / (values.length - 1);
      const y = height - pad - ((v - min) * (height - 2 * pad)) / span;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="text-primary" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  return `${(bytes / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
