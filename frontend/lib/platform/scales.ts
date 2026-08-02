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

/** Percentile fields arrive as 0–1 from some producers and 0–100 from others. */
export function asPercentile(p: number | null): number | null {
  if (p == null || Number.isNaN(p)) return null;
  return Math.round(p > 1 ? p : p * 100);
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
  /(^|_)(def|defensive|allowed|against|opp|opponent)(_|$)|(^|_)(turnovers?|tov|interceptions?|ints?|fumbles?|sacks_allowed|penalt(y|ies)|losses|errors?|era|whip|rank)(_|$)/i;

/** Metrics whose name contains a "good" noun that would otherwise match above. */
const OVERRIDE_HIGHER_IS_BETTER = /(^|_)(havoc|takeaways?|forced|def_epa_added|stops)(_|$)/i;

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
export function percentileClass(pct: number | null): string {
  const p = asPercentile(pct);
  if (p == null) return "text-muted-foreground";
  if (p >= 90) return "text-score-ink dark:text-score font-semibold";
  if (p >= 75) return "text-foreground";
  return "text-muted-foreground";
}

/**
 * Derive a column's encoding domain from its visible values. Returns null for
 * non-numeric columns, constant columns, and identifier-ish columns (ids, years,
 * counts of one) where shading would be noise rather than signal.
 */
export function columnDomain(values: (string | null)[], name?: string): Domain | null {
  if (name && /(^|_)(id|ids|season|year|week|game_id|play_id)$/i.test(name)) return null;
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
