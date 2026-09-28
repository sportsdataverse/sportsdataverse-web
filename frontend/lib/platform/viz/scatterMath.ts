/**
 * Pure pieces of /platform/scatter: the medians, the padded axis domain, the
 * hover hit test, and Data API rows → plotted points.
 */
import type { ScatterSource } from "../../../content/scatter.ts";

type Row = Record<string, unknown>;

/** The median of the values; the mean of the middle two at an even length. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** [min, max] widened by `pad` of the span on each side. One value, or all
 *  equal, still spans: |value| (1 at zero) stands in for the span. */
export function paddedDomain(values: readonly number[], pad = 0.05): [number, number] {
  if (!values.length) return [0, 1];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * pad, hi + span * pad];
}

/** The mark nearest (px, py) within `maxPx`, else -1; a tie goes to the lower
 *  index. Points are in the same pixel space as the pointer. */
export function nearest(points: readonly { px: number; py: number }[], px: number, py: number, maxPx = 20): number {
  let best = -1;
  let bestD = maxPx * maxPx;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].px - px;
    const dy = points[i].py - py;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best === -1)) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

const NUMERIC = new Set(["smallint", "integer", "bigint", "numeric", "real", "double precision"]);
const ID_OR_SEASON = /(^|_)id$|^season$/;

const RANK = /_rank$/;

/** A source's axes: the catalog's numeric columns (`/v1/{schema}/tables`)
 *  less ids and the season, A–Z, every `_rank` column last (as Trends' stat
 *  picker). Fixed-filter columns are text in every source, so never here. */
export function numericColumns(catalog: Readonly<Record<string, string>>): string[] {
  return Object.entries(catalog)
    .filter(([c, type]) => NUMERIC.has(type) && !ID_OR_SEASON.test(c))
    .map(([c]) => c)
    .sort((a, b) => Number(RANK.test(a)) - Number(RANK.test(b)) || a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** A cell as a number: JSON numbers as they are, and Postgres `numeric`,
 *  which the Data API sends as a string ("12.50"); NaN for anything else
 *  (null, "", text), so the finite check drops it. */
export function cellNumber(v: unknown): number {
  if (typeof v === "number") return v;
  return typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
}

const finite = (v: unknown) => Number.isFinite(cellNumber(v));

/** The columns with at least one finite value in the rows: a measure-type
 *  slice (nba_stats) leaves the others' columns empty. */
export function filledColumns(columns: readonly string[], rows: readonly Row[]): string[] {
  return columns.filter((c) => rows.some((r) => finite(r[c])));
}

/**
 * Rows whose `col` is in `listed` (a season's D-I team list), and how many
 * were left out. An empty list (no list for that season) filters nothing and
 * says so: `listed: false`, never an empty chart.
 */
export function keepListed<R extends Row>(
  rows: readonly R[],
  col: string,
  listed: ReadonlySet<unknown>
): { rows: R[]; left: number; listed: boolean } {
  if (!listed.size) return { rows: [...rows], left: 0, listed: false };
  const kept = rows.filter((r) => listed.has(r[col]));
  return { rows: kept, left: rows.length - kept.length, listed: true };
}

/** A kept x/y: a numeric column of the source, else the first two columns
 *  (the other axis's pick is kept when it is valid). */
export function scatterAxes(x: string, y: string, numeric: readonly string[]): { x: string; y: string } {
  const okX = numeric.includes(x);
  const okY = numeric.includes(y);
  const rest = numeric.filter((c) => c !== (okX ? x : y));
  return {
    x: okX ? x : okY ? rest[0] ?? y : numeric[0] ?? "",
    y: okY ? y : okX ? rest[0] ?? x : numeric[1] ?? numeric[0] ?? "",
  };
}

export type ScatterPoint = { label: string; team: string; x: number; y: number };

/**
 * Rows → points: a row whose x or y is null or not finite (after
 * `cellNumber`) is not plotted and is counted per axis. `nameOf` renames `source.names.col` (a team id).
 */
export function scatterPoints(
  rows: readonly Row[],
  source: ScatterSource,
  x: string,
  y: string,
  nameOf?: ReadonlyMap<unknown, string>
): { points: ScatterPoint[]; missingX: number; missingY: number } {
  const text = (r: Row, c: string | undefined) => {
    if (!c) return "";
    const v = r[c];
    return (source.names?.col === c ? nameOf?.get(v) : undefined) ?? (v == null ? "" : String(v));
  };
  const points: ScatterPoint[] = [];
  let missingX = 0;
  let missingY = 0;
  for (const r of rows) {
    const [vx, vy] = [cellNumber(r[x]), cellNumber(r[y])];
    if (!Number.isFinite(vx)) missingX++;
    if (!Number.isFinite(vy)) missingY++;
    if (Number.isFinite(vx) && Number.isFinite(vy)) points.push({ label: text(r, source.labelCol), team: text(r, source.teamCol), x: vx, y: vy });
  }
  return { points, missingX, missingY };
}

/** "12 players have no value for o_rapm." per axis with any missing. */
export function missingNote(noun: string, missing: readonly [string, number][]): string {
  return missing
    .filter(([, n]) => n > 0)
    .map(([col, n]) => `${n.toLocaleString("en-US")} ${n === 1 ? noun.replace(/s$/, "") : noun} ${n === 1 ? "has" : "have"} no value for ${col}.`)
    .join(" ");
}
