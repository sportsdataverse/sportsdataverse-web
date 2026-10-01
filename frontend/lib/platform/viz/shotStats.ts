/**
 * The Smoothed and Zones modes of /platform/shots and its two companions,
 * as pure helpers over `Shot`s in feet (hoop or goal at the origin, y toward
 * centre court / centre ice, as `normalizeShot` returns them):
 *
 * - `kernelSmooth`: the attempt-weighted Gaussian smoother ported from the
 *   Blazing the Nets clone (sdv-next-clone/src/components/blazingthenets/
 *   lib.ts), d3-free, for the by-distance curve (σ 0.9 bins);
 * - `smoothBins`: the same idea over the hex lattice — a bin's rate becomes
 *   the attempt-weighted Gaussian average of the bins around it, σ
 *   `SMOOTH_SIGMA` feet, on the SAME lattice (same bins, same sizes, same
 *   mark count; a lone shot stays a dot);
 * - `zoneOf` / `rinkZoneOf` and `zoneStats`: the zone partition and its
 *   fills (five on a court, four on a rink);
 * - `byDistance` and `butterfly`: the distance bins behind DistanceCurves
 *   and SideButterfly, which share one hovered distance with the map.
 *
 * Every helper here is pinned by test/shotStats.test.ts.
 */
import type { ShotsSurface } from "../../../content/shots.ts";
import { pct, type BinStats, type HexBin, type MadeKind } from "./hexbin.ts";
import { arcCornerY, boards, circle, COURT, COURTS, rect, RINK, RINK_GOAL_Y, threeLine, type Court, type CourtKey, type Shot } from "./surfaces.ts";

// --- Smoothing ----------------------------------------------------------------------

/**
 * Gaussian kernel smoothing along an array (the by-distance bins), σ in
 * bins, the window cut at 3σ. With `weights` the result is the weighted
 * local average: FG% weighted by attempts, so an empty distance does not
 * drag the curve to zero; a bin with no weight in reach reads 0.
 */
export function kernelSmooth(values: readonly number[], weights: readonly number[] | null, sigma: number): number[] {
  const n = values.length;
  const half = Math.ceil(sigma * 3);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let num = 0;
    let den = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      const k = Math.exp(-((i - j) * (i - j)) / (2 * sigma * sigma)) * (weights ? weights[j] : 1);
      num += k * values[j];
      den += k;
    }
    out[i] = den > 0 ? num / den : 0;
  }
  return out;
}

/** The Smoothed mode's kernel bandwidth, σ in feet, per surface: ~0.94 of
 *  the lattice spacing (√3 × the hex radius), so a neighbouring bin weighs
 *  0.57 of the bin itself and the second ring 0.13–0.19; the window is cut
 *  at 3σ. The rink's is double the court's, as its radius is. */
export const SMOOTH_SIGMA = { court: 3, rink: 6 } as const;

/**
 * The bins with each one's makes (and summed xG) replaced by its
 * attempt-weighted Gaussian average over the bins within 3σ of its centre,
 * scaled back to its own attempts: `made' = n × Σ K·made / Σ K·n`, so
 * `made'/n` is the smoothed rate and `binSlot`, `readoutText` and `hexSize`
 * read the result unchanged. Centres, counts and distances are untouched —
 * the same marks at the same sizes, a lone shot still a dot. Smooth every
 * bin BEFORE the page's min-n filter, so a hidden bin still informs its
 * neighbours. ponytail: O(bins²); a surface holds ≤ 300 bins, so ≤ 90,000
 * pairs.
 */
export function smoothBins(bins: readonly HexBin[], sigma: number): HexBin[] {
  const reach = 3 * sigma;
  return bins.map((b) => {
    let made = 0;
    let xg = 0;
    let n = 0;
    for (const o of bins) {
      const d = Math.hypot(o.cx - b.cx, o.cy - b.cy);
      if (d > reach) continue;
      const k = Math.exp(-(d * d) / (2 * sigma * sigma));
      made += k * o.made;
      xg += k * o.sumXg;
      n += k * o.n;
    }
    return { ...b, made: (b.n * made) / n, sumXg: (b.n * xg) / n };
  });
}

// --- Zones ----------------------------------------------------------------------------

/**
 * The court's five zones, the NBA's own shot-zone names: the restricted
 * area (within 4 ft of the hoop, the arc's radius — a full circle, so a
 * reverse layup from behind the backboard is one), the paint (the rest of
 * the lane, baseline to free-throw line), mid-range (the rest of the inside
 * of the three-point line), the corner three (beyond the straight corner
 * lines, below where they meet the arc — 8.95 ft above the hoop on an NBA
 * court) and above-the-break three (beyond the arc). A boundary belongs to
 * the farther zone, everywhere: ON the restricted arc is the paint, ON a
 * lane line or the free-throw line is mid-range, ON the three-point line
 * is a three. The two corners are one zone, lettered on both strips.
 */
export const COURT_ZONES = ["restricted", "paint", "mid", "corner3", "atb3"] as const;
export type CourtZone = (typeof COURT_ZONES)[number];

/**
 * The rink's four zones, from the rink's own lines (goal at the origin, y
 * toward centre ice): the slot — between the end-zone faceoff dots (|x| ≤
 * 22 ft) from the goal line up to the dots (y ≤ 20); the high slot — the
 * same width from the dots up to the top of the circles (y ≤ 35); the point
 * — everything above the circle tops, to centre ice (shots from beyond the
 * blue line are rare and read with the point); the perimeter — the rest:
 * outside the dots below the circle tops, and behind the goal line. A
 * boundary belongs to the farther zone, as on the court: ON the dots' line
 * is the high slot, ON the circle tops is the point, ON a dot's x is the
 * perimeter — except the goal line itself, which reads with the slot (the
 * zone behind it is nearer, not farther).
 */
export const RINK_ZONES = ["slot", "highSlot", "point", "perimeter"] as const;
export type RinkZone = (typeof RINK_ZONES)[number];

export type ZoneKey = CourtZone | RinkZone;

export const ZONE_LABELS: Record<ZoneKey, string> = {
  restricted: "restricted area",
  paint: "paint",
  mid: "mid-range",
  corner3: "corner 3",
  atb3: "above-the-break 3",
  slot: "slot",
  highSlot: "high slot",
  point: "point",
  perimeter: "perimeter",
};

export function zoneOf(x: number, y: number, c: Court): CourtZone {
  if (Math.hypot(x, y) < COURT.restricted) return "restricted";
  const corner = y <= arcCornerY(c);
  if (corner ? Math.abs(x) >= c.corner : Math.hypot(x, y) >= c.three) return corner ? "corner3" : "atb3";
  return Math.abs(x) < c.key / 2 && y < COURT.ftLine ? "paint" : "mid";
}

export function rinkZoneOf(x: number, y: number): RinkZone {
  if (y >= RINK.dotY + RINK.circle) return "point";
  if (Math.abs(x) < RINK.dotX && y >= 0) return y < RINK.dotY ? "slot" : "highSlot";
  return "perimeter";
}

/** A zone's fill as path data in feet (non-overlapping with `fillRule="evenodd"`:
 *  an outer boundary and the zones it encloses as holes), and its anchor —
 *  where its label sits and what the arrow keys walk between (as a hex's
 *  centre); `rotate` turns the label along a narrow corner strip, `mirror`
 *  letters it at (−cx, cy) as well — the corners are one zone, two strips. */
export type ZoneShape = { zone: ZoneKey; path: string; cx: number; cy: number; rotate?: boolean; mirror?: boolean };

export function courtZones(court: CourtKey): ZoneShape[] {
  const c = COURTS[court];
  const { width, half, hoop, ftLine, restricted } = COURT;
  const w2 = width / 2;
  const yi = arcCornerY(c);
  const inside = `${threeLine(c)} Z`;
  const lane = rect(-c.key / 2, -hoop, c.key, hoop + ftLine);
  const ra = circle(0, 0, restricted);
  const corners = `${rect(-w2, -hoop, w2 - c.corner, hoop + yi)} ${rect(c.corner, -hoop, w2 - c.corner, hoop + yi)}`;
  return [
    { zone: "atb3", path: `${rect(-w2, -hoop, width, half)} ${inside} ${corners}`, cx: 0, cy: 30 },
    { zone: "corner3", path: corners, cx: -(w2 + c.corner) / 2, cy: 2, rotate: true, mirror: true },
    { zone: "mid", path: `${inside} ${lane}`, cx: 0, cy: 19 },
    { zone: "paint", path: `${lane} ${ra}`, cx: 0, cy: 9 },
    { zone: "restricted", path: ra, cx: 0, cy: 2 },
  ];
}

export function rinkZones(): ZoneShape[] {
  const { width, dotX, dotY, circle: r } = RINK;
  const top = dotY + r;
  const point = rect(-width / 2, top, width, RINK_GOAL_Y - top);
  return [
    { zone: "perimeter", path: `${boards()} ${rect(-dotX, 0, 2 * dotX, top)} ${point}`, cx: -32, cy: 15 },
    { zone: "point", path: point, cx: 0, cy: 50 },
    { zone: "highSlot", path: rect(-dotX, dotY, 2 * dotX, top - dotY), cx: 0, cy: 27 },
    { zone: "slot", path: rect(-dotX, 0, 2 * dotX, dotY), cx: 0, cy: 10 },
  ];
}

/** A zone with its shots' stats: a HexBin (its anchor as the centre) so the
 *  map hovers, colours and reads it as a bin. ponytail: with a league curve,
 *  `binSlot` compares a zone to the league rate at the zone's MEAN distance,
 *  as a hex's; Σ leagueRateAt(dᵢ)/n would weight it by the zone's own
 *  distance mix. */
export type ZoneStat = HexBin & ZoneShape;

const stats = (): BinStats => ({ n: 0, made: 0, sumDist: 0, sumXg: 0 });
const add = (a: BinStats, s: Shot) => {
  a.n += 1;
  if (s.made) a.made += 1;
  a.sumDist += s.dist;
  if (s.xg !== undefined) a.sumXg += s.xg;
};

/** Every zone of the surface, in draw order (the outermost first, so each
 *  fill lies over the one enclosing it), with the shots in it; a zone with
 *  none has n = 0. */
export function zoneStats(shots: readonly Shot[], surface: ShotsSurface): ZoneStat[] {
  const shapes = surface.kind === "court" ? courtZones(surface.court) : rinkZones();
  const by = new Map(shapes.map((z) => [z.zone, { ...z, ...stats() }]));
  const of = surface.kind === "court" ? (s: Shot) => zoneOf(s.x, s.y, COURTS[surface.court]) : (s: Shot) => rinkZoneOf(s.x, s.y);
  for (const s of shots) add(by.get(of(s))!, s);
  return [...by.values()];
}

// --- By distance ------------------------------------------------------------------------

/** The companions' distance bin, feet: 1 on a court, 2 on a rink (its
 *  shots run to ~100 ft) — at most ~50 bins either way. */
export const DIST_STEP = { court: 1, rink: 2 } as const;

/** A distance bin [lo, lo + step) and its shots' stats. */
export type DistRow = BinStats & { lo: number };

/** The distance bins from 0 to the farthest shot, every bin in between
 *  (empty ones too, as the curve's x axis), each holding the shots at
 *  lo ≤ dist < lo + step; none for no shots. */
export function byDistance(shots: readonly Shot[], step: number): DistRow[] {
  const max = shots.reduce((m, s) => Math.max(m, s.dist), -1);
  const rows: DistRow[] = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => ({ lo: i * step, ...stats() }));
  for (const s of shots) add(rows[Math.floor(s.dist / step)], s);
  return rows;
}

/** A distance bin split by side: `left` is x < 0 (the left of the drawing,
 *  the shooter's left), `right` is x ≥ 0 — a shot on the centre line (NBA
 *  Stats logs many rim attempts at exactly (0, 0)) counts right, so the two
 *  sides always sum to the bin. */
export type SideRow = { lo: number; left: BinStats; right: BinStats };

export function butterfly(shots: readonly Shot[], step: number): SideRow[] {
  const max = shots.reduce((m, s) => Math.max(m, s.dist), -1);
  const rows: SideRow[] = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => ({ lo: i * step, left: stats(), right: stats() }));
  for (const s of shots) {
    const row = rows[Math.floor(s.dist / step)];
    add(s.x < 0 ? row.left : row.right, s);
  }
  return rows;
}

/** A butterfly side's totals line: "867 shots · 52% FG", on a rink "284 shots ·
 *  38 goals" — "1 shot", "1 goal" in the singular, as `readoutText` — or "no shots". */
export function sideTotals(s: BinStats, kind: MadeKind): string {
  if (!s.n) return "no shots";
  const shots = `${s.n.toLocaleString("en-US")} ${s.n === 1 ? "shot" : "shots"}`;
  return `${shots} · ${kind === "FG" ? `${pct(s.made / s.n)} FG` : `${s.made} ${s.made === 1 ? "goal" : "goals"}`}`;
}

/** The distance bin holding a bin's mean distance: what hovering a hex or a
 *  zone hands the companions. */
export const distBin = (b: BinStats, step: number) => Math.floor(b.sumDist / b.n / step) * step;
