/**
 * Pure helpers for /platform/wp: Data API rows (`{schema}.schedule`,
 * `{schema}.pbp`) → the game picker's options and one game's WP series.
 */
import type { WpSport } from "../../content/wp.ts";

export type GameOption = { id: string; label: string };
export type WpPoint = { x: number; wp: number; period: number; clock: string; text: string; score: string };
type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The Data API's own row cap (sdv-db MAX_LIMIT). The largest schedule is
 *  ~6.3k games (MBB) and the longest game ~660 plays (4OT MBB), so neither
 *  read comes near it. */
const API_MAX_ROWS = "50000";

/** Query-proxy params for the season's game list (`{schema}.schedule`). */
export function scheduleParams(sport: WpSport, season: string): Record<string, string> {
  const s = sport.schedule;
  return {
    ...s.filter, // first, so a filter key can never override the scoped keys
    schema: sport.schema,
    table: "schedule",
    season,
    select: [s.id, s.week, s.home, s.away].filter(Boolean).join(","),
    limit: API_MAX_ROWS,
  };
}

/** Query-proxy params for one game's plays (`{schema}.pbp`); `season` lets
 *  Postgres prune to that season's partition. */
export function pbpParams(sport: WpSport, season: string, gameId: string): Record<string, string> {
  const c = sport.cols;
  return {
    schema: sport.schema,
    table: "pbp",
    season,
    [c.gameId]: gameId,
    select: [c.order, c.wp, c.period, c.clock, c.text, c.homeScore, c.awayScore].filter(Boolean).join(","),
    order: c.order,
    limit: API_MAX_ROWS,
  };
}

/** Last load wins: each load takes a ticket, and only the newest ticket may
 *  apply its response or clear the spinner. `next()` alone abandons whatever
 *  is in flight. */
export function loadSequencer() {
  let n = 0;
  return { next: () => ++n, isLatest: (ticket: number) => ticket === n };
}

/** pbp rows → chart points: a null WP is dropped, WP is clamped to [0, 1],
 *  a missing period defaults to 1. Rows arrive in play order. */
export function wpPointsFromRows(rows: Row[], cols: WpSport["cols"]): WpPoint[] {
  return rows
    .filter((r) => r[cols.wp] != null)
    .map((r) => {
      const home = cols.homeScore ? r[cols.homeScore] : null;
      const away = cols.awayScore ? r[cols.awayScore] : null;
      return {
        x: Number(r[cols.order]),
        wp: Math.max(0, Math.min(1, Number(r[cols.wp]))),
        period: Number(r[cols.period]) || 1,
        clock: cols.clock ? str(r[cols.clock]) : "",
        text: str(r[cols.text]),
        score: home != null && away != null ? `${away}-${home}` : "",
      };
    });
}

/** schedule rows → picker options labelled `W3 · Away @ Home`, ordered by
 *  week (missing last) then home team. The API orders by one column only. */
export function gameOptionsFromSchedule(rows: Row[], schedule: WpSport["schedule"]): GameOption[] {
  const week = (r: Row) => (schedule.week && r[schedule.week] != null ? Number(r[schedule.week]) : Infinity);
  return [...rows]
    .sort((a, b) => week(a) - week(b) || str(a[schedule.home]).localeCompare(str(b[schedule.home])))
    .map((r) => ({
      id: str(r[schedule.id]),
      label: `${week(r) !== Infinity ? `W${week(r)} · ` : ""}${str(r[schedule.away])} @ ${str(r[schedule.home])}`,
    }));
}

/** The empty state once a game has loaded without a chart. Plays whose WP is
 *  all null mean the sport-season has no published WP (MBB/WBB before 2025). */
export function emptyWpMessage(plays: number, points: number, sport: string, season: string): string {
  return plays > 0 && points === 0
    ? `WP isn't published for ${sport} ${season}.`
    : "No win-probability data for this game.";
}
