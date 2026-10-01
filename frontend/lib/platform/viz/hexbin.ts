/**
 * Hexagon binning for /platform/shots, in feet with the hoop or goal at the
 * origin (as `normalizeShot` returns shots). Ported from the Blazing the
 * Nets clone (sdv-next-clone/src/components/blazingthenets/lib.ts), d3-free:
 * pointy-top hexes on axial coordinates with cube rounding.
 *
 * The radius bounds the mark count (the 300-mark SVG rule, DESIGN.md): a
 * surface touches at most as many cells as fit it, boundary partials
 * included. On the whole half court (50 × 47 ft) that is 332 cells at
 * 1.75 ft and 297 at 1.85; on the attacking half of the rink (85 × 100 ft)
 * 310 at 3.5 and 290 at 3.6 — so the radii are the smallest 0.05 ft steps
 * that keep every cell a surface can hold under 300 (test/hexbin.test.ts
 * counts them over an exhaustive grid and 50,000 uniform points).
 */
import { divergingSlot, sequentialSlot, type ChartSlot } from "../chartTokens.ts";
import { COURT, RINK, RINK_GOAL_Y, type Shot } from "./surfaces.ts";

/** Hex radius (centre to vertex), in feet, per surface kind. */
export const HEX_RADIUS = { court: 1.85, rink: 3.6 } as const;

/** One bin: its centre in feet, how many shots fell in it, how many were
 *  made (goals, on a rink), and the sums behind the readout's mean distance
 *  and the hockey colouring (a shot without `xg` adds 0). */
export type HexBin = { cx: number; cy: number; n: number; made: number; sumDist: number; sumXg: number };

/** What `binSlot` and `readoutText` read: a hex bin, a zone, a distance bin or
 *  a butterfly side (shotStats.ts) all carry these four. */
export type BinStats = Pick<HexBin, "n" | "made" | "sumDist" | "sumXg">;

const S3 = Math.sqrt(3);

/** The shots binned onto a hex grid of `radius` feet; a bin per cell that
 *  holds at least one shot, in first-seen order. */
export function hexbin(shots: readonly Shot[], radius: number): HexBin[] {
  const bins = new Map<string, HexBin>();
  for (const s of shots) {
    const q = ((S3 / 3) * s.x - s.y / 3) / radius;
    const r = ((2 / 3) * s.y) / radius;
    // cube rounding: the axis with the largest rounding error is derived from the other two
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(-q - r);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - (-q - r));
    if (dq > dr && dq > ds) rq = -rs - rr;
    else if (dr > ds) rr = -rq - rs;
    const key = `${rq},${rr}`;
    let bin = bins.get(key);
    if (!bin) {
      bin = { cx: radius * S3 * (rq + rr / 2), cy: radius * 1.5 * rr, n: 0, made: 0, sumDist: 0, sumXg: 0 };
      bins.set(key, bin);
    }
    bin.n += 1;
    if (s.made) bin.made += 1;
    bin.sumDist += s.dist;
    if (s.xg !== undefined) bin.sumXg += s.xg;
  }
  return [...bins.values()];
}

/** SVG `points` for a pointy-top hexagon of radius `rad` about (cx, cy). */
export function hexPoints(cx: number, cy: number, rad: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** A bin's mark as a share of the hex radius: √((n − 1)/(max − 1)) between
 *  30% and 100%, so volume reads as area; a lone shot (n = 1) is 0 — drawn
 *  as a dot, not a hex. */
export function hexSize(n: number, max: number): number {
  if (n < 2) return 0;
  if (max < 2) return 1;
  return 0.3 + 0.7 * Math.sqrt((n - 1) / (max - 1));
}

/** What a made shot is: a field goal (hoops) or a goal (hockey). */
export type MadeKind = "FG" | "goals";

/** |goals − xG| per shot at which a rink bin reads one, two or three steps from expected. */
export const XG_CUTS = [0.02, 0.05, 0.1] as const;

/** |FG% − the league's FG% at that distance| at which a court bin reads one,
 *  two or three steps from the league: ±3, ±6, ±9 percentage points. */
export const LEAGUE_CUTS = [0.03, 0.06, 0.09] as const;

/** One bucket of a league's F4 `fg_pct_by_shot_distance` curve
 *  (`/v1/{schema}/metric_curves?entity_type=league`): feet [x_lo, x_hi)
 *  and the league's made rate there. */
export type CurveRow = { x_lo: number; x_hi: number; rate: number };

/** The league's FG% at `dist` feet: the rate of the bucket holding it —
 *  x_lo inclusive, x_hi EXCLUSIVE, since the buckets abut (a shot at
 *  exactly 3 ft is the 3–4 ft bucket's, as the producer floors the
 *  distance) — or null when no bucket does (past the last one, a negative
 *  distance, an empty curve). */
export function leagueRateAt(curve: readonly CurveRow[], dist: number): number | null {
  const row = curve.find((r) => dist >= r.x_lo && dist < r.x_hi);
  return row && Number.isFinite(row.rate) ? row.rate : null;
}

/** A bin's colour: goals above or below the shots' summed xG, per shot, on
 *  the diverging ramp for hockey; for hoops, FG% minus the league's FG% at
 *  the bin's mean distance on the diverging ramp when a `curve` is given,
 *  else FG% on the sequential ramp. With a curve, a bin whose distance no
 *  bucket holds is null (no baseline, no colour): the two ramps never mix
 *  on one chart. */
export function binSlot(b: BinStats, kind: MadeKind, curve: readonly CurveRow[] | null = null): ChartSlot | null {
  if (kind === "goals") return divergingSlot((b.made - b.sumXg) / b.n, XG_CUTS);
  if (!curve) return sequentialSlot(b.made / b.n);
  const league = leagueRateAt(curve, b.sumDist / b.n);
  return league === null ? null : divergingSlot(b.made / b.n - league, LEAGUE_CUTS);
}

export const pct = (x: number) => `${Math.round(100 * x)}%`;
/** Signed to one decimal, the sign taken AFTER rounding so −0.04 reads "+0.0", never "−0.0". */
export const signed = (x: number) => {
  const r = Number(x.toFixed(1));
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}`;
};

/** The readout for a bin: "23 shots · 48% FG · 12 ft", or on a rink
 *  "23 shots · 3 goals · +0.9 vs xG · 31 ft" (a smoothed bin's goals are
 *  fractional: "3.1 goals"). */
export function readoutText(b: BinStats, kind: MadeKind): string {
  const shots = `${b.n.toLocaleString("en-US")} ${b.n === 1 ? "shot" : "shots"}`;
  const ft = `${Math.round(b.sumDist / b.n)} ft`;
  if (kind === "FG") return `${shots} · ${pct(b.made / b.n)} FG · ${ft}`;
  const goals = Number.isInteger(b.made) ? b.made : b.made.toFixed(1);
  return `${shots} · ${goals} ${b.made === 1 ? "goal" : "goals"} · ${signed(b.made - b.sumXg)} vs xG · ${ft}`;
}

/** The surface a shot must lie on to be binned: the half court (±25 ft,
 *  the baseline to centre court) or the attacking half of the rink (±42.5
 *  ft, the end boards to centre ice). Anything else — a heave from the
 *  backcourt, an own-zone empty-net shot, a sentinel coordinate — would
 *  bin off the viewBox: drawn unseen, counted as a mark, and the busiest
 *  such bin would shrink every visible hex through `hexSize`'s max. The
 *  page drops them before `hexbin` and counts them in its note. */
export function onSurface(s: Shot, kind: "court" | "rink"): boolean {
  return kind === "court"
    ? Math.abs(s.x) <= COURT.width / 2 && s.y >= -COURT.hoop && s.y <= COURT.half - COURT.hoop
    : Math.abs(s.x) <= RINK.width / 2 && s.y >= -RINK.goalLine && s.y <= RINK_GOAL_Y;
}

/** The nearest bin from `from` in direction `[dx, dy]` (unit axis; +y is
 *  down the screen, as the surfaces draw): among the bins ahead within a
 *  90° cone (the component along the direction at least the one across
 *  it), the closest; null when none. Arrow keys walk the marks with it. */
export function nearestBin(bins: readonly HexBin[], from: HexBin, [dx, dy]: readonly [number, number]): HexBin | null {
  let best: HexBin | null = null;
  let bestD = Infinity;
  for (const b of bins) {
    if (b === from) continue;
    const [ex, ey] = [b.cx - from.cx, b.cy - from.cy];
    const along = ex * dx + ey * dy;
    if (along <= 0 || along < Math.abs(ex * -dy + ey * dx)) continue;
    const d = Math.hypot(ex, ey);
    if (d < bestD) [best, bestD] = [b, d];
  }
  return best;
}

/** A bin's identity across renders: its lattice centre, which a min-n or
 *  player change never moves (an index would). */
export const binKey = (b: HexBin) => `${b.cx},${b.cy}`;
