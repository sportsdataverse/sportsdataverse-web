/**
 * Value→color encoding for the platform's dense data surfaces.
 *
 * Two rules, both borrowed from the sites this platform is chasing:
 *
 * 1. **Color the delta, not the value.** A raw rate shaded min→max says only
 *    "big number". Shading a value's distance from a baseline — zero for signed
 *    metrics like EPA, the column median otherwise — says "unusual", which is
 *    what a scanner is actually looking for.
 * 2. **Quantize.** Six buckets at fixed cut points read as categories at a
 *    glance; a continuous ramp reads as mush. (buckets.peterbeshai.com uses
 *    ±3%/±9% thresholds on FG% vs league average; same principle, generalized.)
 *
 * Every stop is a `color-mix()` against the THEME TOKENS rather than baked hex,
 * so a shaded cell re-derives itself in light and dark mode and no new colors
 * enter the palette (DESIGN.md: extend the token table first). Scoreboard amber
 * stays reserved for its accent slots — encoding uses SDV blue for above-
 * baseline and destructive red for below, the most colorblind-tolerable
 * diverging pair already in the tokens.
 */

/** Percentile fields arrive as 0–1 from some producers and 0–100 from others.
 *  The scale belongs to the COLUMN (see pctScale): judged per value, the
 *  0–100 producer's worst qualifiers (0.66 of 150) would read as 66th. */
export function asPercentile(p: number | null, scale: 1 | 100 = 100): number | null {
  if (p == null || Number.isNaN(p)) return null;
  return Math.round(scale === 1 ? p * 100 : p);
}

/** 100 when any value in the column exceeds 1, else 1.
 *  ponytail: a 0–100 column whose visible rows are all ≤ 1 (only the bottom
 *  1% on screen) reads as 0–1; the F13 registry's `format` removes the guess. */
export function pctScale(values: (string | null)[]): 1 | 100 {
  let seen = false;
  for (const v of values) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (n > 1) return 100;
    if (Number.isFinite(n)) seen = true;
  }
  return seen ? 1 : 100;
}

/**
 * Producer percentiles: `X_pct` beside `X` (cfbfastR-cfb-data leaderboards —
 * among qualifiers, already direction-adjusted, null = unknown). A `_pct`
 * without its `X` is a plain rate (fg_pct), not a percentile. Maps each tinted
 * column index → the index of the percentile column that colours it.
 */
export function pctSiblings(columns: string[]): Map<number, number> {
  const at = new Map(columns.map((c, i) => [c, i] as const));
  const out = new Map<number, number>();
  columns.forEach((c, i) => {
    if (!c.endsWith("_pct")) return;
    const base = at.get(c.slice(0, -4));
    if (base === undefined) return;
    out.set(base, i);
    out.set(i, i);
  });
  return out;
}

const PCT_DOMAIN: Domain = { min: 0, max: 100, base: 50, signed: false, polarity: 1 };

/** Tint from a producer percentile. Polarity stays +1: the producer's `_rank`
 *  already encodes direction, so polarity() here would invert fumbles/ints. */
export function pctTint(raw: string | null, scale: 1 | 100): string | undefined {
  if (raw == null || raw === "") return undefined;
  const p = asPercentile(Number(raw), scale);
  return p == null ? undefined : tintFor(p, PCT_DOMAIN);
}

/** Where a column's pct-mode shade comes from: its producer `_pct` column and
 *  that column's scale, read over EVERY row of the result. */
export type PctSource = { col: number; scale: 1 | 100 };

export function pctSources(columns: string[], rows: (string | null)[][]): Map<number, PctSource> {
  return new Map(
    [...pctSiblings(columns)].map(([ci, pc]) => [ci, { col: pc, scale: pctScale(rows.map((r) => r[pc])) }])
  );
}

export type TintMode = "delta" | "pct" | "off";

/** One grid cell's shade: `delta` by its column's own domain, `pct` by the
 *  producer percentile (X and X_pct share a shade), `off` none. */
export function gridShade(
  mode: TintMode,
  cells: (string | null)[],
  ci: number,
  domain: Domain | null,
  pct: PctSource | undefined
): string | undefined {
  if (mode === "delta") return cellTint(cells[ci], domain);
  return mode === "pct" && pct ? pctTint(cells[pct.col], pct.scale) : undefined;
}

/** The mode actually drawn: percentile mode on a result with no percentile
 *  columns shades by heat instead of showing an inert mode. The stored mode
 *  keeps the intent, so the next result with percentiles gets them. */
export function effectiveTint(mode: TintMode, hasPct: boolean): TintMode {
  return mode === "pct" && !hasPct ? "delta" : mode;
}

/** The `h` key: delta → pct → off, skipping pct when nothing has percentiles. */
export function nextTint(mode: TintMode, hasPct: boolean): TintMode {
  if (mode === "delta") return hasPct ? "pct" : "off";
  return mode === "pct" ? "off" : "delta";
}

/** Tint strength per bucket. Capped where cell text starts losing contrast. */
const BUCKET_TINT = [0, 7, 14, 24] as const;

/** |z|-style cut points in units of "share of the half-domain". */
const CUTS = [0.12, 0.38, 0.7] as const;

export type Domain = {
  min: number;
  max: number;
  /** The value that reads as "normal" — 0 for signed metrics, else the median. */
  base: number;
  /** True when the column straddles zero (EPA-like) rather than being a rate. */
  signed: boolean;
  /** +1 when higher is better, −1 when lower is better (see `polarity`). */
  polarity: 1 | -1;
};

/**
 * Which direction is "good" for a column.
 *
 * Readers decode color as good-vs-bad, not as positive-vs-negative, so a scale
 * keyed on sign lies about every metric where lower is better: a defense
 * allowing −0.37 EPA/play is elite and must not read as the reddest cell in the
 * table. Names are matched against the vocabulary the warehouse actually uses.
 */
const LOWER_IS_BETTER =
  /(^|_)(def|defensive|allowed|against|opp|opponent)(_|$)|(^|_)(turnovers?|tov|interceptions?|ints?|fumbles?|sacks_allowed|penalt(y|ies)|losses|errors?|era|whip|rank|adj_d|raw_d)(_|$)/i;

/** Metrics whose name contains a "good" noun that would otherwise match above,
 *  and the possession counts, no one's good or bad (def_poss reads like off_poss).
 *  Only the bare counts: a per-possession rate (tov_per_poss) keeps its sense. */
const OVERRIDE_HIGHER_IS_BETTER = /(^|_)(havoc|takeaways?|forced|def_epa_added|stops)(_|$)|(^|_)(off|def)_poss$/i;

export function polarity(name?: string): 1 | -1 {
  if (!name) return 1;
  if (OVERRIDE_HIGHER_IS_BETTER.test(name)) return 1;
  return LOWER_IS_BETTER.test(name) ? -1 : 1;
}

/**
 * Bucketed diverging tint around `base`. Returns undefined inside the dead zone
 * so a table of unremarkable values stays clean rather than uniformly washed.
 */
export function tintFor(value: number, domain: Domain): string | undefined {
  const span = Math.max(Math.abs(domain.max - domain.base), Math.abs(domain.base - domain.min));
  if (!span) return undefined;
  // Polarity flips the hue, never the magnitude: an elite defensive number
  // stays as far from the baseline as it was, it just reads as good.
  const t = ((value - domain.base) / span) * domain.polarity; // −1 … +1
  const mag = Math.min(1, Math.abs(t));
  let bucket = 0;
  for (let i = 0; i < CUTS.length; i++) if (mag > CUTS[i]) bucket = i + 1;
  const strength = BUCKET_TINT[bucket];
  if (!strength) return undefined;
  const token = t > 0 ? "var(--color-primary)" : "var(--color-destructive)";
  return `color-mix(in oklab, ${token} ${strength}%, transparent)`;
}

/** Text emphasis for an elite percentile — databallr's gold sub-value idea,
 *  re-pointed at the scoreboard token so it stays on-palette. */
export function percentileClass(pct: number | null, scale: 1 | 100 = 100): string {
  const p = asPercentile(pct, scale);
  if (p == null) return "text-muted-foreground";
  if (p >= 90) return "text-score-ink dark:text-score font-semibold";
  if (p >= 75) return "text-foreground";
  return "text-muted-foreground";
}

/** Identifier-ish columns (ids, seasons, years, weeks): numbers, but keys rather than measures. */
export const KEY_COLUMN = /(^|_)(id|ids|season|year|week|game_id|play_id)$/i;

/**
 * Derive a column's encoding domain from its visible values. Returns null for
 * non-numeric columns, constant columns, and identifier-ish columns (ids, years,
 * counts of one) where shading would be noise rather than signal.
 */
export function columnDomain(values: (string | null)[], name?: string): Domain | null {
  if (name && KEY_COLUMN.test(name)) return null;
  const nums: number[] = [];
  for (const v of values) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isNaN(n)) return null; // any non-numeric ⇒ not an encodable column
    nums.push(n);
  }
  if (nums.length < 4) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const signed = min < 0 && max > 0;
  return { min, max, base: signed ? 0 : mid, signed, polarity: polarity(name) };
}

/** The tint for one cell given its column domain; undefined = leave it clean. */
export function cellTint(value: string | null, domain: Domain | null): string | undefined {
  if (!domain || value == null || value === "") return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) return undefined;
  return tintFor(n, domain);
}

/** 1-2-5 "nice" tick generator — d3-array's algorithm without the dependency. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    out.push(Number(t.toFixed(10)));
  }
  return out;
}

/** Sign-aware delta formatting: `+0.42` / `−0.13`, with a direction glyph. */
export function formatDelta(value: number, digits = 2): { text: string; glyph: string; tone: string } {
  const glyph = value > 0 ? "▲" : value < 0 ? "▼" : "–";
  const tone =
    value > 0
      ? "text-status-success-ink dark:text-status-success"
      : value < 0
        ? "text-status-failed-ink dark:text-status-failed"
        : "text-muted-foreground";
  return { text: `${value > 0 ? "+" : ""}${value.toFixed(digits)}`, glyph, tone };
}
