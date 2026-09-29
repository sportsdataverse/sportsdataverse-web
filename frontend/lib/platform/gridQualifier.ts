/**
 * Sample sizes and the leaderboard qualifier in ResultsGrid.
 *
 * A player leaderboard (CFB / NFL passing, rushing, receiving) gates its rows
 * per TEAM GAME, not per metric: a passer qualifies with `dropbacks >= 14 *
 * team_games`. The producer ranks and percentiles among qualifiers only, so a
 * non-qualifier's `X_pct` is null; the grid fades that row and `q` hides it.
 */
import { formatValue } from "./trends.ts";

/** `X`'s column index → its `X_n` sample-size column's; an `X_n` without its `X` is ignored. */
export function nSiblings(columns: string[]): Map<number, number> {
  const at = new Map(columns.map((c, i) => [c, i] as const));
  const out = new Map<number, number>();
  columns.forEach((c, i) => {
    const base = c.endsWith("_n") ? at.get(c.slice(0, -2)) : undefined;
    if (base !== undefined) out.set(base, i);
  });
  return out;
}

/** Each category's volume column. The source of truth is cfb-data
 *  `python/cfb_data_build/team_summaries.py` `PLAYER_QUALIFIERS` (nfl-data's is the same):
 *  `<volume> >= qualifier_min * team_games`. The minimum is READ from `league_averages`. */
export const QUALIFIER_VOLUME: Record<string, string> = { passing: "dropbacks", rushing: "plays", receiving: "plays" };

/** The leagues whose player leaderboards carry the gate (their Query tables are named after the category). */
const LEAGUES = ["cfb", "nfl"];

/** A Query table's `league_averages` entity and category when it is a gated player leaderboard, else null. */
export function categoryOf(schema: string, table: string): { entity: "player"; category: string } | null {
  return LEAGUES.includes(schema) && Object.hasOwn(QUALIFIER_VOLUME, table) ? { entity: "player", category: table } : null;
}

/** An Explore release file as the Query table it mirrors (espn_cfb_passing's cfb_passing → cfb.passing,
 *  nfl_passing's passing → nfl.passing); null outside the gated leagues. */
export function exploreSource(tag: string, stem: string): { schema: string; table: string } | null {
  const league = /^(?:espn_)?(cfb|nfl)_/.exec(tag)?.[1];
  if (!league) return null;
  return { schema: league, table: stem.startsWith(`${league}_`) ? stem.slice(league.length + 1) : stem };
}

const num = (v: string | number | null): number | null => (v == null || (typeof v === "string" && v.trim() === "") ? null : Number(v));

/** The producer's gate, `volume < min * teamGames`; null (unknown, never faded) when any input is missing or not finite. */
export function belowQualifier(volume: string | number | null, teamGames: string | number | null, min: number | null): boolean | null {
  const [v, g] = [num(volume), num(teamGames)];
  if (v === null || g === null || min === null || !Number.isFinite(v) || !Number.isFinite(g) || !Number.isFinite(min)) return null;
  return v < min * g;
}

/** The gate from one season's `league_averages` rows for an entity and category: CFB's `fbs` level (every level
 *  carries the same gate), else the league's own (`nfl`); null when there is none (the team categories). */
export function qualifierMin(rows: Record<string, unknown>[], schema: string): number | null {
  const level = schema === "cfb" ? "fbs" : schema;
  const v = rows.find((r) => r.level === level && r.qualifier_min != null)?.qualifier_min;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "40 dropbacks in 5 team games, below the qualifier (14 per team game = 70)". */
export function belowNote(volume: string, teamGames: string, min: number, unit: string): string {
  const f = (n: number) => formatValue(n, undefined, false);
  return `${volume} ${unit} in ${teamGames} team games, below the qualifier (${f(min)} per team game = ${f(min * Number(teamGames))})`;
}
