/**
 * Pure logic for /platform/trends: the multi-team overlay's picks and the
 * end-label layout. Relative `.ts` imports so `node --test` loads it.
 */
import { CATEGORICAL, categoricalSlot, type CategoricalSlot } from "./chartTokens.ts";

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
