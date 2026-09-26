/**
 * Chart colour slots for the platform's hand-rolled SVG/canvas charts.
 *
 * Values live in styles/globals.css (hex in :root/.dark, mixes in @theme
 * inline) and are documented in DESIGN.md; this module only names them and
 * maps data onto them. SVG uses Tailwind classes (`fill-chart-cat-1`) or
 * `chartVar(slot)`; canvas resolves the variable at draw time.
 *
 * - Categorical (identity): fixed order, never cycled. Six slots validated
 *   for adjacent pairs (line, bar); scatter and every other all-pairs form
 *   stops at ALL_PAIRS_CAP. Past the cap, fold into "Other" or facet.
 * - Diverging (vs a baseline): SDV blue = above, destructive red = below,
 *   neutral slate midpoint, three steps per arm.
 * - Sequential (magnitude): one hue (primary), five steps away from the card.
 */

export const CATEGORICAL = ["cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6"] as const;
export const DIVERGING = [
  "div-neg-3", "div-neg-2", "div-neg-1", "div-mid", "div-pos-1", "div-pos-2", "div-pos-3",
] as const;
export const SEQUENTIAL = ["seq-1", "seq-2", "seq-3", "seq-4", "seq-5"] as const;

export type CategoricalSlot = (typeof CATEGORICAL)[number];
export type DivergingSlot = (typeof DIVERGING)[number];
export type SequentialSlot = (typeof SEQUENTIAL)[number];
export type ChartSlot = CategoricalSlot | DivergingSlot | SequentialSlot;

/** Series cap for scatter / bubble / small multiples (every pair on screen). */
export const ALL_PAIRS_CAP = 3;

export const chartVar = (slot: ChartSlot): string => `var(--color-chart-${slot})`;

/** Series i → its slot, or null past the cap (never cycle a hue). */
export function categoricalSlot(i: number, cap: number = CATEGORICAL.length): CategoricalSlot | null {
  return i >= 0 && i < Math.min(cap, CATEGORICAL.length) ? CATEGORICAL[i] : null;
}

/**
 * A signed delta from a baseline → diverging step. `cuts` are the |delta|
 * thresholds for steps 1, 2 and 3, and must be strictly ascending positive
 * numbers (unsorted cuts mis-bin: step 2's own threshold would read as step
 * 1) — an invalid `cuts` returns null rather than a wrong step. Below
 * cuts[0] reads as "normal" (mid); a cut boundary itself is INCLUSIVE (`>=`),
 * unlike `scales.ts` `tintFor`'s exclusive `>`. polarity −1 flips the side
 * for a lower-is-better metric, never the size — pass `scales.ts`
 * `polarity(name)` rather than re-deriving it here.
 *
 * `div-*` slots are for chart marks (a line, a bar, a diverging-scale dot);
 * `chart-div-pos-3`/`chart-div-neg-3` are the same tokens as `primary`/
 * `destructive`, saturated enough that text drawn on top of them can fail
 * contrast — `tintFor`'s table-cell tints stay lighter for exactly that
 * reason and are not interchangeable with these.
 */
export function divergingSlot(
  delta: number,
  cuts: readonly [number, number, number],
  polarity: 1 | -1 = 1
): DivergingSlot | null {
  if (!Number.isFinite(delta)) return null;
  if (!(cuts[0] > 0 && cuts[0] < cuts[1] && cuts[1] < cuts[2])) return null;
  const d = delta * polarity;
  const mag = Math.abs(d);
  const step = mag >= cuts[2] ? 3 : mag >= cuts[1] ? 2 : mag >= cuts[0] ? 1 : 0;
  if (step === 0) return "div-mid";
  return `div-${d > 0 ? "pos" : "neg"}-${step}` as DivergingSlot;
}

/** t in [0, 1] → one of five sequential steps (clamped); non-finite → null. */
export function sequentialSlot(t: number): SequentialSlot | null {
  if (!Number.isFinite(t)) return null;
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.floor(t * SEQUENTIAL.length)));
  return SEQUENTIAL[i];
}
