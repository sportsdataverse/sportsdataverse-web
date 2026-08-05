/**
 * Router-agnostic platform widgets shared by the App Router shell and any
 * remaining Pages-Router consumers (via PlatformShell re-exports).
 */

import {
  LayoutDashboard,
  Workflow,
  Database,
  Search,
  Braces,
  BookOpen,
  Percent,
  TrendingUp,
  Boxes,
  HardDrive,
  KeyRound,
  Package,
  FileCode2,
  Gauge,
} from "lucide-react";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
  adminOnly?: boolean;
};

/** THE platform nav — single source for the sidebar, the mobile drawer, the
 *  ⌘K palette, and the topbar crumb. */
export const PLATFORM_NAV: { title: string | null; items: PlatformNavItem[] }[] = [
  {
    title: null,
    items: [{ href: "/platform", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "Data",
    items: [
      { href: "/platform/datasets", label: "Datasets", icon: Database },
      { href: "/platform/query", label: "Query", icon: Braces },
      { href: "/platform/explore", label: "Explore", icon: Search },
      { href: "/platform/lookups", label: "Lookups", icon: BookOpen },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/platform/automation", label: "Automation", icon: Workflow },
      // The org-member package CMS (/packages/manage edits the R/Py/Node.js
      // entries shown on /packages) lives on the public site where members
      // rarely stumble onto it — surface it here where they already work.
      { href: "/packages/manage", label: "Packages CMS", icon: Package },
    ],
  },
  {
    title: "Models",
    items: [
      { href: "/platform/models", label: "Models", icon: Boxes },
      { href: "/platform/wp", label: "Win Prob", icon: Percent },
      { href: "/platform/trends", label: "Trends", icon: TrendingUp },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/platform/database", label: "Database", icon: HardDrive },
      { href: "/platform/api-key", label: "API Key", icon: KeyRound },
      { href: "/platform/admin", label: "Admin", icon: Gauge, adminOnly: true },
      { href: "https://data.sportsdataverse.org/docs", label: "API Docs", icon: FileCode2, external: true },
    ],
  },
];

/** Flat view of PLATFORM_NAV (⌘K palette, crumb resolution, legacy consumers). */
export const PLATFORM_TABS = PLATFORM_NAV.flatMap((g) =>
  g.items.map(({ href, label }) => ({ href, label }))
);

/** Colored chip for workflow conclusions / run statuses / booleans, on the
 *  shared status-token ramp: `-ink` variants for light-mode text, bare colors
 *  in dark (see globals.css). Unrecognized values read as neutral, not as
 *  failure — only explicit failure states go red. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "unknown").toLowerCase();
  const tone =
    value === "success" || value === "completed" || value === "ok" || value === "passed"
      ? "bg-status-success/15 text-status-success-ink dark:text-status-success"
      : value === "in_progress" || value === "queued" || value === "running" || value === "pending" || value === "stale"
        ? "bg-status-running/15 text-status-running-ink dark:text-status-running"
        : value === "scheduled" || value === "late"
          ? "bg-status-scheduled/15 text-status-scheduled-ink dark:text-status-scheduled"
          : value === "failure" || value === "failed" || value === "error" || value === "crashed" || value === "timed_out" || value === "startup_failure" || value === "action_required"
            ? "bg-status-failed/15 text-status-failed-ink dark:text-status-failed"
            : "bg-status-cancelled/20 text-status-cancelled-ink dark:text-status-cancelled";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${tone}`}
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
