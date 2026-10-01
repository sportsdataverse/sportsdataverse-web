/**
 * Pure pieces of /platform/scatter: the medians, the padded axis domain, the
 * hover hit test, Data API rows → plotted points, the highlight chips, the
 * zoom and pan transform, RANDOM's axis pick, and the PNG export's text.
 */
import type { ScatterNames, ScatterSource } from "../../../content/scatter.ts";
import { chartVar } from "../chartTokens.ts";
import { pickSlots, teamNameLookup } from "../trends.ts";

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

/**
 * Rows with a team-id column (`names.col`) and that id's team table
 * (`nameRows`), as Scatter and Ratings show them: every id named
 * (teamNameLookup, which throws unless both sides' keys are `names.keyType`;
 * an id the table lacks is named by itself), rows outside `names.only` left
 * out (keepListed), and `unnamed`, how many kept ids the table lacks.
 */
export function joinNames<R extends Row>(
  rows: readonly R[],
  nameRows: readonly Row[],
  names: ScatterNames
): { rows: R[]; nameOf: Map<number | string, string>; unnamed: number; left: number; unlisted: boolean } {
  const nameOf = teamNameLookup([...new Set(rows.map((r) => r[names.col]).filter((v) => v != null))], nameRows, names);
  const known = new Set(nameRows.map((r) => r[names.key]));
  const d1 = names.only ? keepListed(rows, names.col, known) : { rows: [...rows], left: 0, listed: true };
  const unnamed = new Set(d1.rows.map((r) => r[names.col]).filter((v) => v != null && !known.has(v))).size;
  return { rows: d1.rows, nameOf, unnamed, left: d1.left, unlisted: !d1.listed };
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

/** `teamName`: the team's full name where `team` is an abbreviation
 *  (`source.teamNameCol`), else "". */
/** `id`: the row's `source.idCol` as it came (a player or team id; the faces'
 *  key, lib/platform/viz/sprites.ts `espnIds`). */
export type ScatterPoint = { label: string; team: string; teamName: string; x: number; y: number; id?: unknown };

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
    if (Number.isFinite(vx) && Number.isFinite(vy))
      points.push({ label: text(r, source.labelCol), team: text(r, source.teamCol), teamName: text(r, source.teamNameCol), x: vx, y: vy, id: r[source.idCol] });
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

// --- Highlight -----------------------------------------------------------------

/** The strings a mark answers to: its name, its team and the team's full
 *  name (NBA's "BOS" and "Boston Celtics"), each once. */
function names(p: ScatterPoint): string[] {
  return [...new Set([p.label, p.team, p.teamName].filter(Boolean))];
}

/** A chip matches a mark whose name, team or team name equals it, ignoring
 *  case: "bos" matches every Celtics player. */
export function chipMatches(p: ScatterPoint, chip: string): boolean {
  const c = chip.toLowerCase();
  return names(p).some((n) => n.toLowerCase() === c);
}

/**
 * Each mark's highlight slot: the position (= colour slot) of the first chip
 * it matches, so a mark matching two chips takes the earlier chip's colour;
 * -1 for none. `picks` keeps gaps (null) where a chip was removed, so every
 * surviving chip keeps its slot. Null — the plain chart — with no chip, or
 * when no mark matches any chip (a "BOS" chip carried over to WNBA must not
 * fade every mark).
 */
export function highlightSlots(points: readonly ScatterPoint[], picks: readonly (string | null)[]): number[] | null {
  const chips = picks.flatMap((c, i) => (c === null ? [] : [[c.toLowerCase(), i] as const]));
  if (!chips.length) return null;
  const slots = points.map((p) => {
    const own = names(p).map((n) => n.toLowerCase());
    return chips.find(([c]) => own.includes(c))?.[1] ?? -1;
  });
  return slots.some((s) => s >= 0) ? slots : null;
}

/** Every string a chip can be, with how many marks it matches: one entry
 *  per case-folded string, keeping the first spelling seen. */
export function highlightOptions(points: readonly ScatterPoint[]): Map<string, { text: string; n: number }> {
  const out = new Map<string, { text: string; n: number }>();
  for (const p of points) {
    for (const text of new Set(names(p).map((n) => n.toLowerCase()))) {
      const o = out.get(text);
      if (o) o.n++;
      else out.set(text, { text: names(p).find((n) => n.toLowerCase() === text)!, n: 1 });
    }
  }
  return out;
}

/** Up to `limit` options containing the query (any case), the exact match
 *  first, then prefixes, then the rest, A–Z within each; chips already on
 *  are left out. */
export function suggest(
  options: ReadonlyMap<string, { text: string; n: number }>,
  query: string,
  picks: readonly (string | null)[],
  limit = 8
): { text: string; n: number }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const on = new Set(picks.filter((c): c is string => c !== null).map((c) => c.toLowerCase()));
  const rank = (k: string) => (k === q ? 0 : k.startsWith(q) ? 1 : 2);
  return [...options]
    .filter(([k]) => k.includes(q) && !on.has(k))
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, limit)
    .map(([, o]) => o);
}

// --- Zoom and pan ----------------------------------------------------------------

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 32;

/** The visible domain of each axis and the zoom `k` it is at (the base
 *  domain's span over the visible span; 1 = unzoomed). */
export type ZoomView = { k: number; x: [number, number]; y: [number, number] };

export const baseView = (x: [number, number], y: [number, number]): ZoomView => ({ k: 1, x, y });

/**
 * Zoom by `factor` about the point at fractions (fx, fy) of the visible
 * domains (0 = the domain's low end): that point stays where it is on
 * screen, and the total zoom is kept to [ZOOM_MIN, ZOOM_MAX] of `base`.
 */
export function zoomView(v: ZoomView, base: ZoomView, fx: number, fy: number, factor: number): ZoomView {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
  const axis = ([a, b]: [number, number], [a0, b0]: [number, number], f: number): [number, number] => {
    const at = a + f * (b - a); // the anchored value
    const span = (b0 - a0) / k;
    return [at - f * span, at - f * span + span];
  };
  return { k, x: axis(v.x, base.x, fx), y: axis(v.y, base.y, fy) };
}

/**
 * Whether `v` shows the base view: `base` itself, or a view back at it after
 * zooming in and out (zoomView returns a new object every time, and its
 * arithmetic lands within ~1e-16 of a span). `eps` is relative to each axis's
 * base span, since columns differ by orders of magnitude.
 */
export function isBaseView(v: ZoomView, base: ZoomView, eps = 1e-9): boolean {
  if (v === base) return true;
  const near = (a: [number, number], b: [number, number]) => {
    const tol = eps * Math.abs(b[1] - b[0]);
    return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  };
  return Math.abs(v.k - base.k) <= eps && near(v.x, base.x) && near(v.y, base.y);
}

/** Slide the visible domains by fractions of their span (a drag right by a
 *  tenth of the plot is dfx = 0.1, and shows lower x values). */
export function panView(v: ZoomView, dfx: number, dfy: number): ZoomView {
  const dx = dfx * (v.x[1] - v.x[0]);
  const dy = dfy * (v.y[1] - v.y[0]);
  return { k: v.k, x: [v.x[0] - dx, v.x[1] - dx], y: [v.y[0] - dy, v.y[1] - dy] };
}

// --- RANDOM ----------------------------------------------------------------------

/**
 * Two distinct columns, uniformly among every ordered pair except the
 * current one and its swap (both would redraw the same chart). Null when no
 * other pair exists. `rng` returns [0, 1), Math.random's contract.
 */
export function pickRandomAxes(
  columns: readonly string[],
  current: { x: string; y: string },
  rng: () => number = Math.random
): { x: string; y: string } | null {
  const n = columns.length;
  const [i, j] = [columns.indexOf(current.x), columns.indexOf(current.y)];
  // ordered pair (a, b), a != b, as one index: a * (n - 1) + (b > a ? b - 1 : b)
  const at = (a: number, b: number) => a * (n - 1) + (b > a ? b - 1 : b);
  const skip = i >= 0 && j >= 0 && i !== j ? [at(i, j), at(j, i)].sort((a, b) => a - b) : [];
  const m = n * (n - 1) - skip.length;
  if (n < 2 || m <= 0) return null;
  let p = Math.min(m - 1, Math.floor(rng() * m));
  for (const s of skip) if (p >= s) p++;
  const a = Math.floor(p / (n - 1));
  const r = p % (n - 1);
  return { x: columns[a], y: columns[r >= a ? r + 1 : r] };
}

// --- Export ----------------------------------------------------------------------

/** `{schema}_{table}_{y}_vs_{x}_{season}.png`: lower case, every other
 *  character outside [a-z0-9_] an underscore, runs of them one, none at
 *  either end. The season keeps two seasons of one pair apart. */
export function exportFilename(v: { schema: string; table: string; season: string; x: string; y: string }): string {
  const stem = [v.schema, v.table, v.y, "vs", v.x, v.season]
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${stem}.png`; // never empty: "vs" is always there
}

/** An ISO timestamp as "2026-08-02 06:49 UTC"; "" when missing or not a date. */
export function utcMinute(iso?: string | null): string {
  const d = new Date(iso ?? "");
  return iso && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "";
}

/**
 * The PNG export's text: the page's title; a subtitle of the source, the
 * season, each highlight chip in its slot's colour (a removed chip's gap is
 * skipped and the others keep their slots, as on the page) and "zoomed" off
 * the base view; a footer linking the view (`query`, the page's URL state)
 * and, when known, when the data last changed.
 */
export function scatterExportText(
  v: { season: string; x: string; y: string; hl: readonly (string | null)[] },
  o: { label: string; query: string; asOf?: string | null; zoomed: boolean }
): { title: string; subtitle: { text: string; color?: string }[]; footer: string } {
  const asOf = utcMinute(o.asOf);
  return {
    title: `${v.y} vs ${v.x} · ${v.season}`,
    subtitle: [
      { text: o.label },
      { text: v.season },
      ...pickSlots(v.hl).map(({ team, slot }) => ({ text: team, color: chartVar(slot) })),
      ...(o.zoomed ? [{ text: "zoomed" }] : []),
    ],
    footer: [`sportsdataverse.org/platform/scatter${o.query ? `?${o.query}` : ""}`, asOf ? `data as of ${asOf}` : ""]
      .filter(Boolean)
      .join(" · "),
  };
}
