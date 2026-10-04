import type { ProducerState } from "@lib/ecosystemStatus";

/**
 * The shared status-* ramp (DESIGN.md "Components"): a state reads the same on /status and on a package
 * card, and never by hue alone (the chip always carries its word). Server-safe.
 */
export type Tone = "success" | "scheduled" | "running" | "failed" | "cancelled";

const CHIP: Record<Tone, string> = {
  success: "bg-status-success/15 text-status-success-ink dark:text-status-success",
  scheduled: "bg-status-scheduled/15 text-status-scheduled-ink dark:text-status-scheduled",
  running: "bg-status-running/15 text-status-running-ink dark:text-status-running",
  failed: "bg-status-failed/15 text-status-failed-ink dark:text-status-failed",
  cancelled: "bg-status-cancelled/20 text-status-cancelled-ink dark:text-status-cancelled",
};

export const DOT: Record<Tone, string> = {
  success: "bg-status-success",
  scheduled: "bg-status-scheduled",
  running: "bg-status-running",
  failed: "bg-status-failed",
  cancelled: "bg-status-cancelled",
};

export const STATE_TONE: Record<ProducerState, Tone> = {
  fresh: "success",
  idle: "scheduled",
  stale: "running",
  failing: "failed",
  unknown: "cancelled",
};

export default function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${CHIP[tone]}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
