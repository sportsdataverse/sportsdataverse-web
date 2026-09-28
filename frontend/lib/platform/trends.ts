/**
 * Pure logic for /platform/trends: the multi-team overlay's picks, the
 * end-label layout, the wide (CFB/NFL weekly) sources' series, stat list
 * and team-name join, and the league band and rank context. Relative `.ts`
 * imports so `node --test` loads it.
 */
import { CATEGORICAL, categoricalSlot, type CategoricalSlot } from "./chartTokens.ts";
import type { TeamNames, TrendSport } from "../../content/trends.ts";

/** One team per categorical slot: `categoricalSlot(i)` never cycles a hue. */
export const MAX_TRENDS_TEAMS = CATEGORICAL.length;

/** Picks by position, and position IS the colour slot, so a team keeps its
 *  colour when another is removed (a removal leaves a gap, `null`). Never
 *  ends in a gap; at most MAX_TRENDS_TEAMS long. */
export type TrendPicks = (string | null)[];

export function trimGaps(picks: readonly (string | null)[]): TrendPicks {
  let n = picks.length;
  while (n > 0 && picks[n - 1] === null) n--;
  return picks.slice(0, n);
}

/** Add a pick in the first gap, else at the end. A team already on is a
 *  no-op; with no gap and no room the pick is refused (the page says so),
 *  never folded onto a used colour. */
export function addTeam(
  picks: readonly (string | null)[],
  team: string,
  max: number = MAX_TRENDS_TEAMS
): { teams: TrendPicks; refused: boolean } {
  const out = [...picks];
  if (out.includes(team)) return { teams: out, refused: false };
  const gap = out.indexOf(null);
  if (gap >= 0) out[gap] = team;
  else if (out.length < max) out.push(team);
  else return { teams: out, refused: true };
  return { teams: out, refused: false };
}

/** Remove a pick, leaving a gap: every other team keeps its position. */
export function removeTeam(picks: readonly (string | null)[], team: string): TrendPicks {
  return trimGaps(picks.map((t) => (t === team ? null : t)));
}

/** Each pick with its colour slot (slot = position); gaps skipped. */
export function pickSlots(picks: readonly (string | null)[]): { team: string; slot: CategoricalSlot }[] {
  return picks.flatMap((team, i) => {
    const slot = categoricalSlot(i);
    return team !== null && slot ? [{ team, slot }] : [];
  });
}

/**
 * End labels at their lines' last y, nudged so no two sit closer than `gap`
 * and all stay within [lo, hi]. Top-to-bottom order is kept (a tie keeps
 * series order). A downward pass opens the gaps, an upward pass pulls a crowd
 * back off the bottom edge.
 * ponytail: pushes a cluster down from its topmost label rather than centring
 * it on the lines; centre clusters if a label drifts visibly from its line.
 * If the labels cannot fit in [lo, hi] at all, the top one overflows `lo`.
 */
export function spreadLabels(ys: readonly number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  const out = [...ys];
  let prev = -Infinity;
  for (const i of order) prev = out[i] = Math.max(ys[i], lo, prev + gap);
  let next = Infinity;
  for (const i of order.reverse()) next = out[i] = Math.min(out[i], hi, next - gap);
  return out;
}

/**
 * End labels in one column at the plot's right edge, each tied back to its
 * line's last point by a leader. CFB/NFL seasons end in different weeks, so a
 * line can stop mid-plot: a label there would sit on the other lines, and
 * labels at different x could still collide with them. In one column every
 * label stays in the gutter, where spacing them is a 1-D problem.
 */
export function endLabels(
  ys: readonly number[],
  right: number,
  gap: number,
  lo: number,
  hi: number
): { x: number; y: number }[] {
  return spreadLabels(ys, gap, lo, hi).map((y) => ({ x: right, y }));
}

/**
 * The last week a weekly file actually played: the file-wide games total,
 * week by week, stops changing once a producer forward-fills unplayed weeks
 * (CFB 2026 repeats week 4 through week 15). That flat tail is trimmed; a
 * week that still adds games (a partial postseason) is kept. No rows: no trim.
 * A total that is not a number throws: it would otherwise never look flat.
 */
export function lastPlayedWeek(pairs: readonly { week: number; gamesTotal: number }[]): number {
  const bad = pairs.find((p) => !Number.isFinite(p.gamesTotal));
  if (bad) throw new Error(`week ${bad.week}: games total is not a number`);
  const byWeek = [...pairs].sort((a, b) => a.week - b.week);
  let i = byWeek.length - 1;
  if (i < 0) return Infinity;
  while (i > 0 && byWeek[i - 1].gamesTotal === byWeek[i].gamesTotal) i--;
  return byWeek[i].week;
}

type Row = Record<string, unknown>;
export type WidePoint = { x: number; value: number; rank?: number | null };

/**
 * Wide rows (one column per stat) → one series per team, points ordered by
 * x; series in order of first appearance. A null (or non-numeric) stat is
 * dropped, never charted as 0. With `rankCol`, each point carries that row's
 * own rank (null stays null).
 */
export function wideToSeries(
  rows: readonly Row[],
  xCol: string,
  teamCol: string,
  stat: string,
  rankCol?: string | null
): { team: string; points: WidePoint[] }[] {
  const byTeam = new Map<string, WidePoint[]>();
  for (const r of rows) {
    const raw = r[stat];
    if (raw == null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const team = String(r[teamCol]);
    const points = byTeam.get(team) ?? [];
    const point: WidePoint = { x: Number(r[xCol]), value };
    if (rankCol) point.rank = r[rankCol] == null ? null : Number(r[rankCol]);
    points.push(point);
    byTeam.set(team, points);
  }
  return [...byTeam].map(([team, points]) => ({ team, points: points.sort((a, b) => a.x - b.x) }));
}

const NUMERIC = /^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|FLOAT|DOUBLE|DECIMAL)\b/;

/** A wide source's stat picker: the numeric columns of a DuckDB DESCRIBE,
 *  minus the team, season and week columns, any id, and the `_n` sample
 *  sizes (the CFB summaries carry 144 of them). */
export function statColumns(described: readonly { name: string; type: string }[], cols: TrendSport["cols"]): string[] {
  const skip = new Set([cols.team, cols.season, cols.week]);
  return described
    .filter((d) => NUMERIC.test(d.type) && !skip.has(d.name) && !/(^|_)id$/i.test(d.name) && !/_n$/.test(d.name))
    .map((d) => d.name);
}

const STAT_GROUPS: [string, RegExp][] = [
  ["Offense", /_off$/],
  ["Defense", /_def$/],
  ["Offense pass/rush", /_off_(pass|rush)$/],
  ["Defense pass/rush", /_def_(pass|rush)$/],
  ["Margin", /_margin(_pass|_rush)?$/],
];
const lower = (a: string, b: string) => {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return x < y ? -1 : x > y ? 1 : 0;
};

/** A long stat list as picker groups: offense, defense, their pass/rush
 *  splits, margin, the rest, and every `_rank` column last. Each group is
 *  sorted ignoring case; empty groups are dropped. */
export function statGroups(stats: readonly string[]): { label: string; stats: string[] }[] {
  const groups = [...STAT_GROUPS.map(([label]) => label), "Other", "Ranks"].map((label) => ({ label, stats: [] as string[] }));
  for (const stat of stats) {
    const i = /_rank$/.test(stat) ? groups.length - 1 : STAT_GROUPS.findIndex(([, re]) => re.test(stat));
    groups[i < 0 ? groups.length - 2 : i].stats.push(stat);
  }
  return groups.filter((g) => g.stats.sort(lower).length);
}

/** A release team-key cell (DuckDB hands back strings) as the join key. A
 *  number key must be all digits: DuckDB's own BIGINT cast would also take
 *  '12.5', ' 12 ', '1e2', '0x1F' and '1_000'. */
export function releaseKey(cell: string, type: TeamNames["keyType"]): number | string {
  if (type === "string") return cell;
  if (!/^\d+$/.test(cell)) throw new Error(`release team id ${JSON.stringify(cell)} is not all digits`);
  return Number(cell);
}

function assertKeys(values: readonly unknown[], type: TeamNames["keyType"], where: string): void {
  for (const v of values) {
    const ok = type === "number" ? Number.isSafeInteger(v) : typeof v === "string" && v !== "";
    if (!ok) throw new Error(`${where}: expected ${type} team keys, got ${typeof v} ${JSON.stringify(v)}`);
  }
}

/**
 * Release team ids → names from a Data API team table. Both sides' keys are
 * asserted to be `names.keyType` first: a key-type mismatch throws rather than
 * silently matching nothing. An id the table lacks is named by itself, and a
 * name two ids share gets the id appended, so no team drops out of the picker.
 */
export function teamNameLookup(
  ids: readonly unknown[],
  rows: readonly Row[],
  names: TeamNames
): Map<number | string, string> {
  assertKeys(ids, names.keyType, "release team ids");
  assertKeys(rows.map((r) => r[names.key]), names.keyType, `${names.schema}.${names.table}.${names.key}`);
  const byKey = new Map(rows.map((r) => [r[names.key], String(r[names.name])]));
  const out = new Map<number | string, string>();
  const used = new Set<string>();
  for (const id of ids as (number | string)[]) {
    const name = byKey.get(id) ?? String(id);
    const unique = used.has(name) ? `${name} (${id})` : name;
    used.add(unique);
    out.set(id, unique);
  }
  return out;
}

/** One x of the league aggregate, as queried: every team in the file at that
 *  x, not just the picks. `sd` is null below 2 teams (DuckDB stddev_samp). */
export type BandRow = { x: number; mean: number; sd: number | null; n: number };
export type BandPoint = { x: number; mean: number; lo: number | null; hi: number | null; n: number };

/**
 * The league mean ± 1 sd per x, sorted by x: an aggregate over the same file
 * the lines come from, not a percentile. With no sd, or fewer than 2 teams,
 * the band is the mean alone (lo = hi = null). A mean that is not a number
 * throws, never charted.
 */
export function leagueBand(rows: readonly BandRow[]): BandPoint[] {
  return [...rows]
    .sort((a, b) => a.x - b.x)
    .map(({ x, mean, sd, n }) => {
      if (!Number.isFinite(mean)) throw new Error(`${x}: league mean is not a number`);
      const spread = sd !== null && n >= 2;
      return { x, mean, lo: spread ? mean - sd : null, hi: spread ? mean + sd : null, n };
    });
}

/** The band kept to the lines' x span (`xs`, the charted points' x): it never
 *  runs past a trimmed week or into a season no line has, and it shrinks when
 *  a removal shortens the lines. No lines, no band. */
export function bandWithin(band: readonly BandPoint[], xs: readonly number[]): BandPoint[] {
  const [first, last] = [Math.min(...xs), Math.max(...xs)];
  return band.filter((b) => b.x >= first && b.x <= last);
}

/**
 * The band's drawable stretches: runs of 2+ points, the fill (`filled`) or
 * the mean line. A charted x (`xs`) with no league value between two points
 * breaks a run rather than being bridged (a season with no D-I list has no
 * band); so does a point without a spread, for the fill (its mean is still on
 * the mean line).
 */
export function bandRuns(band: readonly BandPoint[], xs: readonly number[], filled = true): BandPoint[][] {
  const runs: BandPoint[][] = [];
  let last: BandPoint | null = null;
  for (const b of band) {
    if (filled && (b.lo === null || b.hi === null)) {
      last = null;
      continue;
    }
    const prev = last;
    if (prev && !xs.some((x) => x > prev.x && x < b.x)) runs[runs.length - 1].push(b);
    else runs.push([b]);
    last = b;
  }
  return runs.filter((r) => r.length > 1);
}

/** The league query's rows, the teams with a value per x (a rank's "of"), and
 *  the seasons a D-I source's groups file lists. */
export type LeagueRows = { rows: BandRow[]; of: Map<number, number>; seasons?: number[] };
export type League = { band: BandPoint[]; of: Map<number, number>; seasons?: number[]; failed?: string };

/** The league layer is auxiliary: a query that fails (DuckDB's stddev_samp is
 *  "out of range" on an inf) or a mean that is not a number leaves the chart
 *  with no band and no rank count, never without its lines. */
export async function loadLeague(query: () => Promise<LeagueRows>): Promise<League> {
  try {
    const { rows, of, seasons } = await query();
    return { band: leagueBand(rows), of, seasons };
  } catch (e) {
    return { band: [], of: new Map(), failed: e instanceof Error ? e.message : String(e) };
  }
}

const INTEGER = /^U?(TINYINT|SMALLINT|INTEGER|BIGINT)$/;

/** The D-I semi-join matches a release's integer ESPN team id, cast to text,
 *  to the groups file's text id, season to season. A float id would cast to
 *  "103.0" and match nothing, so any other key type throws before the join. */
export function assertGroupsJoin(t: { fileTeam: string; fileSeason: string; groupsTeam: string; groupsSeason: string }): void {
  if (!INTEGER.test(t.fileTeam) || t.groupsTeam !== "VARCHAR") {
    throw new Error(`D-I join: release team_id is ${t.fileTeam}, groups team_id is ${t.groupsTeam}; want an integer and VARCHAR`);
  }
  if (!INTEGER.test(t.fileSeason) || !INTEGER.test(t.groupsSeason)) {
    throw new Error(`D-I join: release season is ${t.fileSeason}, groups season is ${t.groupsSeason}; want integers`);
  }
}

/** "#12 of 136": a producer rank among the teams with a value at that x. A .5
 *  rank is a two-way average tie (the CFB summaries rank like R rank()) and
 *  reads "#T-7", anything else as an integer: GOP's formatRank
 *  (game-on-paper-app astro/src/utils/misc.ts), formatting the producer's
 *  value, never recomputing it. No rank, or no count, no label. */
export function rankLabel(rank: number | null | undefined, of: number | undefined): string | null {
  if (rank == null || !Number.isFinite(rank) || !of) return null;
  return `#${String(rank).includes(".5") ? `T-${Math.floor(rank)}` : Math.floor(rank)} of ${of}`;
}

const upTo3 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** A value as charted: at most 3 decimals, or exactly `decimals` to match a
 *  source's own display strings. One that rounds to zero reads 0, never -0
 *  (Intl's signDisplay "negative" does this too, but throws a RangeError on
 *  Firefox 111-115, ESR 115 among them). */
export function formatValue(v: number, decimals?: number): string {
  const nf =
    decimals === undefined
      ? upTo3
      : new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const s = nf.format(v);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

/** The decimals a source's display strings use ("46.9" → 1, "3,421" → 0), so
 *  a league mean reads at the teams' own precision. */
export function displayDecimals(displays: readonly string[]): number {
  return Math.max(0, ...displays.map((d) => /\.(\d+)/.exec(d)?.[1].length ?? 0));
}

/** The rank column for a stat in the same row, only when the file has it: the
 *  source's explicit map, else `<stat>_rank`. Never computed or guessed. */
export function rankColumn(
  stat: string,
  columns: readonly string[],
  ranks?: Readonly<Record<string, string>>
): string | null {
  const col = ranks?.[stat] ?? `${stat}_rank`;
  return columns.includes(col) ? col : null;
}
