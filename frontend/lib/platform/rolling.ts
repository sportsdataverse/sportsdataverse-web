/**
 * Pure helpers for /platform/rolling: F3's precomputed `{league}.rolling_windows`
 * rows, read through the Query proxy. The Data API has no window functions,
 * so every number is F3's; this module only builds the reads and formats.
 */
import type { RollingFormat, RollingMetric } from "../../content/rolling.ts";
import { formatDelta } from "./scales.ts";

export type RollingTab = "best" | "improved" | "coldest";

/** Each tab re-orders the hero cards; the risers/fallers card doesn't change. */
export const ROLLING_TABS: { key: RollingTab; label: string; order: string }[] = [
  { key: "best", label: "Best", order: "-cur" },
  { key: "improved", label: "Most improved", order: "-delta_season" },
  { key: "coldest", label: "Coldest", order: "cur" },
];

/** The page's cards, each with its own window (`win.<card>` in the URL). Stable
 *  ids: they are URL keys, so renaming one breaks shared links. */
export const ROLLING_CARDS = ["hero", "movers"] as const;
export type RollingCard = (typeof ROLLING_CARDS)[number];

export type RollingRow = {
  entity_id: string;
  entity_name: string;
  cur: number;
  prev: number | null;
  season_start: number | null;
  delta_prev: number | null;
  delta_season: number | null;
  delta_prev_rank: number | null;
  last_event_date: string;
};

const SELECT = "entity_id,entity_name,cur,prev,season_start,delta_prev,delta_season,delta_prev_rank,last_event_date";

/** "Active" = an event in the `days` before the table's as-of date (not today),
 *  so a stale publish doesn't empty the page. */
export function activeSince(asOf: string, days = 14): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** formatDelta's tone, greyed while |delta| is under the metric's noise. */
export function deltaTone(delta: number, noise: number): string {
  return Math.abs(delta) < noise ? "text-muted-foreground" : formatDelta(delta).tone;
}

/** A signed delta with its unit: `+0.12 EPA`, or `+3.1 pp` for a 0–1 rate. */
export function formatUnits(v: number, format: RollingFormat): string {
  return format === "pct" ? `${formatDelta(v * 100, 1).text} pp` : `${formatDelta(v, 2).text} EPA`;
}

/** A level (not a delta): `0.21`, or `47.3%`. */
export function formatValue(v: number, format: RollingFormat): string {
  return format === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
}

export function windowLabel(n: number, unit: string): string {
  return `${n} ${unit === "carry" ? "carries" : `${unit}s`}`;
}

/** The newest season and its as-of date (one per season: F3 stamps its max event date). */
export function metaParams(league: string): Record<string, string> {
  return { schema: league, table: "rolling_windows", select: "season,as_of_date", order: "-season", limit: "1" };
}

/**
 * One card's read. `window_unit` is required (window_n alone is ambiguous) and
 * `qualified=true` keeps short careers out: without it the best "last 100
 * dropbacks" are players with one dropback. `since` null = the active filter is off.
 */
export function cardParams(
  league: string,
  m: RollingMetric,
  windowN: number,
  season: string,
  since: string | null,
  order: string,
  limit: number
): Record<string, string> {
  return {
    schema: league,
    table: "rolling_windows",
    season,
    metric: m.metric,
    window_unit: m.unit,
    window_n: String(windowN),
    entity_type: m.entity,
    qualified: "true",
    ...(since ? { last_event_date__gte: since } : {}),
    select: SELECT,
    order,
    limit: String(limit),
  };
}

/** The risers/fallers card: risers as ranked; fallers without anyone already
 *  listed (a short list can overlap) and reversed, so the card ends on the
 *  biggest faller. A null delta (no full previous window) is dropped. */
export function movers(risers: RollingRow[], fallers: RollingRow[]): { top: RollingRow[]; bottom: RollingRow[] } {
  const top = risers.filter((r) => r.delta_prev != null);
  const ids = new Set(top.map((r) => r.entity_id));
  return { top, bottom: fallers.filter((r) => r.delta_prev != null && !ids.has(r.entity_id)).reverse() };
}
