/**
 * Pure logic for /platform/trends: the multi-team overlay's cap and pick rule,
 * and the end-label layout. Relative `.ts` imports so `node --test` loads it.
 */
import { CATEGORICAL } from "./chartTokens.ts";

/** One team per categorical slot: `categoricalSlot(i)` never cycles a hue. */
export const MAX_TRENDS_TEAMS = CATEGORICAL.length;

/** Add a pick to the overlay. A team already on is a no-op; past the cap the
 *  pick is refused (the page says so), never folded onto a used colour. */
export function addTeam(
  teams: readonly string[],
  team: string,
  max: number = MAX_TRENDS_TEAMS
): { teams: string[]; refused: boolean } {
  if (teams.includes(team)) return { teams: [...teams], refused: false };
  if (teams.length >= max) return { teams: [...teams], refused: true };
  return { teams: [...teams, team], refused: false };
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
