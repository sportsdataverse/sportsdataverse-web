/**
 * Pure helpers for /platform/wp: Data API rows (`{schema}.schedule`,
 * `{schema}.pbp`) → the game picker's options and one game's WP series.
 */
import type { WpSport } from "../../content/wp.ts";
import { pickTeamColors, type TeamColors } from "./teamColor.ts";

/** One side of a game: `key` joins the sport's team table (CFB id, NFL
 *  abbreviation); `color`/`alt` come straight off the schedule (MBB/WBB). */
export type WpTeam = TeamColors & { name: string; key: string; score: string };
export type GameOption = { id: string; label: string; date: string; home: WpTeam; away: WpTeam };
export type WpPoint = { x: number; wp: number; period: number; clock: string; text: string; score: string };
type Row = Record<string, unknown>;

const str = (v: unknown): string => (v == null ? "" : String(v));
const col = (r: Row, c: string | undefined) => (c ? str(r[c]) : "");

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
    // A Set, since NFL's team key is the home/away abbreviation column itself.
    select: [
      ...new Set([
        s.id, s.week, s.home, s.away, s.homeId, s.awayId, s.homeColor, s.homeAlt, s.awayColor, s.awayAlt,
        s.date, s.homeScore, s.awayScore,
      ]),
    ]
      .filter(Boolean)
      .join(","),
    limit: API_MAX_ROWS,
  };
}

/** Query-proxy params for the sport's team colour table: not season-keyed, so
 *  one read per sport serves every season and game. */
export function teamsParams(sport: WpSport): Record<string, string> | null {
  const t = sport.teams;
  return t ? { schema: sport.schema, table: t.table, select: `${t.key},${t.color},${t.alt}`, limit: API_MAX_ROWS } : null;
}

/** Team table rows → colours by team key (stringified, like the schedule's). */
export function teamColorLookup(rows: Row[], teams: NonNullable<WpSport["teams"]>): Map<string, TeamColors> {
  return new Map(rows.map((r) => [str(r[teams.key]), { color: str(r[teams.color]), alt: str(r[teams.alt]) }]));
}

/**
 * The fill colours for a game, through `pickTeamColors` against the page's
 * resolved theme (next-themes; undefined before mount → the site's default,
 * dark). A team missing from the lookup, or with no colour at all, falls to
 * `pickTeamColors`' own fallback walk.
 */
export function wpTeamColors(
  game: GameOption,
  lookup: Map<string, TeamColors> | undefined,
  resolvedTheme: string | undefined
): { home: string; away: string } {
  const colors = (t: WpTeam) => lookup?.get(t.key) ?? t;
  return pickTeamColors(colors(game.home), colors(game.away), resolvedTheme === "light" ? "light" : "dark");
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
      date: col(r, schedule.date),
      home: {
        name: str(r[schedule.home]),
        key: col(r, schedule.homeId),
        color: col(r, schedule.homeColor),
        alt: col(r, schedule.homeAlt),
        score: col(r, schedule.homeScore),
      },
      away: {
        name: str(r[schedule.away]),
        key: col(r, schedule.awayId),
        color: col(r, schedule.awayColor),
        alt: col(r, schedule.awayAlt),
        score: col(r, schedule.awayScore),
      },
    }));
}

export type FillSegment = { side: "home" | "away"; pts: [number, number][] };

/**
 * The area between the WP line and 50%, as closed polygons in (play index,
 * wp) space: one per run above 50% (home) or below (away), split at each
 * crossing, whose play index is interpolated between the two plays either
 * side of it. Each run starts and ends on the 50% line. A play exactly at 50%
 * keeps the current side, so touching 50% is not a crossing.
 */
export function fillSegments(points: { wp: number }[]): FillSegment[] {
  const segs: FillSegment[] = [];
  const firstOff = points.find((p) => p.wp !== 0.5);
  let side: FillSegment["side"] = firstOff && firstOff.wp < 0.5 ? "away" : "home";
  points.forEach(({ wp }, i) => {
    const s = wp > 0.5 ? "home" : wp < 0.5 ? "away" : side;
    if (i === 0) segs.push({ side: s, pts: [[0, 0.5]] });
    else if (s !== side) {
      const a = points[i - 1].wp;
      const t = i - 1 + (0.5 - a) / (wp - a);
      segs[segs.length - 1].pts.push([t, 0.5]);
      segs.push({ side: s, pts: [[t, 0.5]] });
    }
    side = s;
    segs[segs.length - 1].pts.push([i, wp]);
  });
  if (segs.length) segs[segs.length - 1].pts.push([points.length - 1, 0.5]);
  return segs;
}

/** The empty state once a game has loaded without a chart. Plays whose WP is
 *  all null mean the sport-season has no published WP (MBB/WBB before 2025). */
export function emptyWpMessage(plays: number, points: number, sport: string, season: string): string {
  return plays > 0 && points === 0
    ? `WP isn't published for ${sport} ${season}.`
    : "No win-probability data for this game.";
}

/** The PNG export's file name: `wp_cfb_401628374.png`. */
export function wpExportFilename(sport: string, gameId: string): string {
  return `wp_${sport}_${gameId}.png`;
}

/** A schedule date for the export header, "Sep 14, 2024". An ISO day is that
 *  day; a UTC kickoff (CFB) is its US Eastern date.
 *  ponytail: ET for every kickoff, so a late Hawaii game reads a day on; use
 *  the venue's zone if the schedule ever carries one. */
function gameDate(raw: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const d = new Date(raw);
  if (!raw || Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: day ? "UTC" : "America/New_York",
  });
}

/**
 * The PNG export's header and footer: `Away @ Home · final A–H · date` over
 * `<page URL> · release updated <asOf>`. `asOf` is the season release asset's
 * `updated_at` (GitHub, UTC). A part the page doesn't have drops out.
 */
export function wpExportText(game: GameOption, url: string, asOf?: string): { title: string; footer: string } {
  const { home, away } = game;
  const title = [
    `${away.name} @ ${home.name}`,
    home.score && away.score ? `final ${away.score}–${home.score}` : "",
    gameDate(game.date),
  ];
  const footer = [url, asOf ? `release updated ${asOf.slice(0, 16).replace("T", " ")} UTC` : ""];
  return { title: title.filter(Boolean).join(" · "), footer: footer.filter(Boolean).join(" · ") };
}
