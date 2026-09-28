/**
 * Pure logic for /platform/trends: the multi-team overlay's picks, the
 * end-label layout, and the wide (CFB/NFL weekly) sources' series, stat list
 * and team-name join. Relative `.ts` imports so `node --test` loads it.
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
export type WidePoint = { x: number; value: number };

/**
 * Wide rows (one column per stat) → one series per team, points ordered by
 * x; series in order of first appearance. A null (or non-numeric) stat is
 * dropped, never charted as 0.
 */
export function wideToSeries(
  rows: readonly Row[],
  xCol: string,
  teamCol: string,
  stat: string
): { team: string; points: WidePoint[] }[] {
  const byTeam = new Map<string, WidePoint[]>();
  for (const r of rows) {
    const raw = r[stat];
    if (raw == null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const team = String(r[teamCol]);
    const points = byTeam.get(team) ?? [];
    points.push({ x: Number(r[xCol]), value });
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
