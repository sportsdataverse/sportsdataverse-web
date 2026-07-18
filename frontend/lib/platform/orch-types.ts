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
