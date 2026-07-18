/**
 * Types for the sdv-orch trigger/observability surface, mirroring the
 * Pydantic models in sdv-orch `sdv_orch/api/runs.py` and the registry's
 * `catalog()` payload. Client-safe (no server imports).
 */

export interface PipelineStage {
  key: string;
  label: string;
  repo: string;
  rate_classes: string[];
  deps: string[];
  supports_rescrape: boolean;
  note: string | null;
}

export interface Pipeline {
  sport: string;
  label: string;
  season_min: number;
  season_max: number;
  /** Daily schedule (paused deployment) if the pipeline has one, else null. */
  cron: string | null;
  /** SDV package clones this pipeline's scripts depend on (preflight targets). */
  packages: string[];
  /** sdv-db ingest slice refreshed when refresh_warehouse is set, else null. */
  warehouse_sport: string | null;
  default_stages: string[];
  stages: PipelineStage[];
}

export interface RunRef {
  run_id: string;
  state: string;
  name: string;
}

export interface RunDetail extends RunRef {
  deployment: string | null;
  parameters: Record<string, unknown>;
  start_time: string | null;
  end_time: string | null;
  total_run_time: number | null;
}

export interface TaskRun {
  task_run_id: string;
  name: string;
  state: string;
  start_time: string | null;
  end_time: string | null;
  duration_s: number | null;
  retries: number;
}

export interface LogLine {
  ts: string;
  level: string;
  message: string;
}

export interface LogPage {
  logs: LogLine[];
  next_offset: number;
}

export interface Limit {
  tag: string;
  limit: number;
  active: number;
}

export interface TriggerRequest {
  sport: string;
  start: number;
  end?: number | null;
  stages?: string[] | null;
  rescrape?: boolean | null;
  backfill?: boolean;
  /** Chain an sdv-db warehouse refresh of this sport's slice after the run. */
  refresh_warehouse?: boolean;
  /** Override the package-freshness preflight mode: warn | strict | off. */
  preflight?: string | null;
}

export interface PreflightPackage {
  ok: boolean;
  findings: string[];
}

export interface PreflightReport {
  packages: Record<string, PreflightPackage>;
  ok: boolean;
  known: string[];
}

/** Prefect state names that mean a run is finished. */
export const TERMINAL_STATES = new Set([
  "Completed",
  "Failed",
  "Crashed",
  "Cancelled",
  "TimedOut",
]);

export function isTerminal(state: string | null | undefined): boolean {
  return !!state && TERMINAL_STATES.has(state);
}
