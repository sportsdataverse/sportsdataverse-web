/**
 * Router-agnostic platform widgets shared by the App Router shell and any
 * remaining Pages-Router consumers (via PlatformShell re-exports).
 */

export const PLATFORM_TABS = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/automation", label: "Automation" },
  { href: "/platform/datasets", label: "Datasets" },
  { href: "/platform/explore", label: "Explore" },
  { href: "/platform/lookups", label: "Lookups" },
  { href: "/platform/wp", label: "Win Prob" },
  { href: "/platform/trends", label: "Trends" },
  { href: "/platform/models", label: "Models" },
  { href: "/platform/database", label: "Database" },
] as const;

/** Colored chip for workflow conclusions / run statuses / booleans, on the
 *  shared status-token ramp (see globals.css `--color-status-*`). */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "unknown").toLowerCase();
  const tone =
    value === "success" || value === "completed" || value === "ok" || value === "passed"
      ? "bg-status-success/15 text-status-success"
      : value === "in_progress" || value === "queued" || value === "running" || value === "pending" || value === "stale"
        ? "bg-status-running/15 text-status-running"
        : value === "scheduled" || value === "late"
          ? "bg-status-scheduled/15 text-status-scheduled"
          : value === "cancelled" || value === "cancelling" || value === "unknown" || value === "none"
            ? "bg-status-cancelled/20 text-status-cancelled"
            : "bg-status-failed/15 text-status-failed";
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
