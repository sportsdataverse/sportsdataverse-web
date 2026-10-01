/**
 * Surfaces and coordinate normalizers for /platform/shots: each source's
 * rows → feet with the hoop or goal at the origin and y toward centre court
 * or centre ice ("attacking up": the hoop sits at the top of the drawing, a
 * shot's y grows down the screen), and the court and rink geometry drawn in
 * that same frame. Every constant is pinned by test/surfaces.test.ts on real
 * fixtures (test/fixtures/shots/README.md).
 */
import { cellNumber } from "./scatterMath.ts";

export type ShotSource = "nba_stats" | "wnba_stats" | "nba" | "wnba" | "mbb" | "wbb" | "nhl" | "pwhl";

/** One shot in feet: hoop or goal at the origin, `dist` from it; `xg` where the source scores it (hockey). */
export type Shot = { x: number; y: number; made: boolean; dist: number; xg?: number };

// --- Courts -----------------------------------------------------------------------

/** What every half court shares, in feet: 50 × 47, the hoop centre 5.25 ft
 *  from the baseline (4 ft to the backboard + 15 in), the free-throw line
 *  15 ft from the backboard (13.75 ft from the hoop), a 6 ft FT circle, a
 *  4 ft restricted arc, a 6 ft backboard 1.25 ft behind the hoop. */
export const COURT = { width: 50, half: 47, hoop: 5.25, ftLine: 13.75, ftRadius: 6, restricted: 4, backboard: 6, backboardY: -1.25, rim: 0.75 } as const;

/** `three`: the arc's radius; `corner`: the straight corner line's distance
 *  from the hoop (laterally); `key`: the lane's width. */
export type Court = { three: number; corner: number; key: number };

/** FIBA corner geometry (NCAA men 2019 / women 2021): the arc is 6.75 m and
 *  straightens 0.9 m from the sideline, 6.6 m = 21.65 ft from the hoop,
 *  meeting the arc 4.66 ft above it. The WNBA shares the 22.146 ft arc but
 *  its straight corner segments sit 36 in from the sideline of a 50 ft court,
 *  so its corner is 22 ft and the arc joins only 2.54 ft above the hoop. */
const FIBA = { three: 22.146, corner: 21.65 };
const WNBA = { three: 22.146, corner: 22 };

export const COURTS = {
  nba: { three: 23.75, corner: 22, key: 16 },
  wnba: { ...WNBA, key: 16 },
  mbb: { ...FIBA, key: 12 },
  wbb: { ...FIBA, key: 12 },
} as const satisfies Record<string, Court>;

export type CourtKey = keyof typeof COURTS;

/** Where the three-point arc meets the straight corner line, in feet above the hoop (NBA: 8.95). */
export const arcCornerY = (c: Court) => Math.sqrt(c.three ** 2 - c.corner ** 2);

/** A circle as path data (every surface line is one `<path>`). */
const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
const rect = (x: number, y: number, w: number, h: number) => `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;

/**
 * A half court's lines as SVG path data in feet, hoop at the origin, y
 * toward centre court: outline, lane, FT circle, backboard, rim, restricted
 * arc, three-point line (two corner lines and the arc between them), and
 * the centre circle's near half. Arcs bulge away from the hoop (sweep 0:
 * the screen's y axis points the same way as this frame's).
 */
export function courtPaths(c: Court): string[] {
  const { width, half, hoop, ftLine, ftRadius, restricted, backboard, backboardY, rim } = COURT;
  const w2 = width / 2;
  const yi = arcCornerY(c);
  return [
    rect(-w2, -hoop, width, half),
    rect(-c.key / 2, -hoop, c.key, hoop + ftLine),
    circle(0, ftLine, ftRadius),
    line(-backboard / 2, backboardY, backboard / 2, backboardY),
    circle(0, 0, rim),
    `M ${-restricted} 0 A ${restricted} ${restricted} 0 0 0 ${restricted} 0`,
    `M ${-c.corner} ${-hoop} L ${-c.corner} ${yi} A ${c.three} ${c.three} 0 0 0 ${c.corner} ${yi} L ${c.corner} ${-hoop}`,
    circle(0, half - hoop, ftRadius),
  ];
}

// --- Rink -------------------------------------------------------------------------

/** An NHL rink in feet: 200 × 85, the goal line 11 ft from the end boards
 *  (89 ft from centre ice), blue lines 25 ft from centre, 28 ft corners,
 *  end-zone faceoff dots 20 ft from the goal line and 44 ft apart, 15 ft
 *  circles, an 8 ft wide crease of radius 6, a 6 × 3.33 ft goal frame. */
export const RINK = { length: 200, width: 85, goalLine: 11, blueLine: 25, corner: 28, dotY: 20, dotX: 22, circle: 15, creaseW: 8, creaseR: 6, goalW: 6, goalD: 3.33 } as const;

/** The goal line's distance from centre ice (89 ft): the normalizers' goal. */
export const RINK_GOAL_Y = RINK.length / 2 - RINK.goalLine;

/**
 * The attacking half of the rink as SVG path data in feet, goal at the
 * origin, y toward centre ice: boards (rounded end corners, closed by the
 * centre line), goal line (to where the corners begin), blue line, crease,
 * goal frame, the two end-zone circles and dots, the neutral-zone dots, the
 * centre circle's near half.
 */
export function rinkPaths(): string[] {
  const { width, goalLine, blueLine, corner, dotY, dotX, circle: r, creaseW, creaseR, goalW, goalD } = RINK;
  const w2 = width / 2;
  const top = -goalLine; // the end boards
  const centre = RINK_GOAL_Y;
  const goalLineX = w2 - corner + Math.sqrt(corner ** 2 - (corner - goalLine) ** 2); // where the goal line meets the curved boards
  const cx = creaseW / 2;
  const cy = Math.sqrt(creaseR ** 2 - cx ** 2);
  return [
    `M ${-w2} ${centre} L ${-w2} ${top + corner} A ${corner} ${corner} 0 0 1 ${-w2 + corner} ${top} L ${w2 - corner} ${top} A ${corner} ${corner} 0 0 1 ${w2} ${top + corner} L ${w2} ${centre} Z`,
    line(-goalLineX, 0, goalLineX, 0),
    line(-w2, centre - blueLine, w2, centre - blueLine),
    `M ${-cx} 0 L ${-cx} ${cy} A ${creaseR} ${creaseR} 0 0 0 ${cx} ${cy} L ${cx} 0`,
    rect(-goalW / 2, -goalD, goalW, goalD),
    circle(-dotX, dotY, r),
    circle(dotX, dotY, r),
    circle(-dotX, dotY, 1),
    circle(dotX, dotY, 1),
    circle(-dotX, centre - blueLine + 5, 1),
    circle(dotX, centre - blueLine + 5, 1),
    circle(0, centre, r),
  ];
}

// --- Frames -----------------------------------------------------------------------

/** One feet→px frame for an SVG surface: the viewBox (1 px of slack so the
 *  outline's stroke is not clipped), the group transform that maps feet
 *  with the hoop or goal at the origin onto it (so children plot in feet),
 *  and the lines to draw. */
export type Frame = { viewBox: string; transform: string; paths: string[] };

const frame = (w: number, h: number, ox: number, oy: number, scale: number, paths: string[]): Frame => ({
  viewBox: `-1 -1 ${w * scale + 2} ${h * scale + 2}`,
  transform: `scale(${scale}) translate(${ox} ${oy})`,
  paths,
});

/** A half court at `scale` px per foot, the hoop at the top. */
export const courtFrame = (court: CourtKey, scale = 8): Frame =>
  frame(COURT.width, COURT.half, COURT.width / 2, COURT.hoop, scale, courtPaths(COURTS[court]));

/** The attacking half of the rink at `scale` px per foot, the goal at the top. */
export const rinkFrame = (scale = 4): Frame =>
  frame(RINK.width, RINK_GOAL_Y + RINK.goalLine, RINK.width / 2, RINK.goalLine, scale, rinkPaths());

// --- Normalizers --------------------------------------------------------------------

/**
 * ESPN's raw shot frame is a half court 50 × 47 with the hoop at (25, 0):
 * `coordinate_x_raw` runs 0–50 across the court and `coordinate_y_raw` is
 * feet from the hoop toward centre court (a free throw sits at (25, 13.75),
 * a shot behind the backboard below 0). The only documentation is
 * "hoop ≈ (25, 0)"; the fixtures pin it: ≥ 90% of made layups and dunks
 * land within 5 ft of (25, 0) in all four fixtures (test/surfaces.test.ts),
 * where the baseline-origin alternative (25, 5.25) fails.
 * (`coordinate_x`/`coordinate_y` are the same points moved to a full-court
 * frame, `(y_raw − 41.75, x_raw − 25)` with one team's sign flipped; the
 * raw pair needs no unflipping.)
 */
export const ESPN_HOOP = { x: 25, y: 0 } as const;

/** NHL rows that are shots at the goal. A BLOCKED_SHOT is located where it
 *  was blocked and carries no xg, so it is not one. */
const NHL_SHOTS = new Set(["GOAL", "SHOT", "MISSED_SHOT"]);

/** A row's free throws are not field-goal attempts (ESPN lists them: "Free Throw - 1 of 2", NCAA's "MadeFreeThrow"). */
const FREE_THROW = /free\s?throw/i;

/** A shot from finite feet, else null (a missing or non-numeric cell is never NaN downstream). */
function shot(x: number, y: number, made: boolean, xg?: number): Shot | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const s: Shot = { x, y, made, dist: Math.hypot(x, y) };
  if (xg !== undefined && Number.isFinite(xg)) s.xg = xg;
  return s;
}

/**
 * A row of `source` as a Shot in feet, hoop or goal at the origin, y toward
 * centre court / centre ice; null for a row that is not a shot (a free
 * throw, a faceoff) or has no usable coordinates.
 *
 * - stats.nba / stats.wnba: `x_legacy`, `y_legacy` are tenths of a foot
 *   from the hoop already.
 * - ESPN hoops: `coordinate_*_raw` less ESPN_HOOP.
 * - NHL: `x_fixed`/`y_fixed` put the home team attacking +x all game and the
 *   away team −x (pinned by the fixture: every home shot has x_fixed > 0,
 *   every away shot < 0, and the distances reproduce the table's
 *   `shot_distance`), so the attacked goal is at ±89 by `event_team_type`.
 *   Handedness contract (the T4 butterfly splits on the sign of x): at the
 *   home end x = +y_fixed, y = 89 − x_fixed; the away end is the half turn,
 *   x = −y_fixed, y = 89 + x_fixed, so one spot on the ice draws at one x
 *   whichever end it is. Against a top-down rink (+x right, +y up) turned so
 *   the goal is at the top, that is the MIRROR image: the +y_fixed side
 *   draws on the right. Pinned by deepEqual tests at both ends.
 * - PWHL: `x_coord`/`y_coord` are centre-ice feet with each team attacking
 *   one end all game and no home/away column, so the end is the sign of x
 *   (x = 0 attacks +x), with the NHL's handedness. The `shot_distance`
 *   parity test pins the 89 ft goal and the y convention, not the end: the
 *   table's distance is to the nearer goal as well, so a shot from behind
 *   centre ice folds the same way in both and the parity cannot tell.
 *   ponytail: nearer-goal fold; the fixture has no such row. If the page
 *   ever shows one, resolve the end per team from the game's majority side.
 */
export function normalizeShot(source: ShotSource, row: Record<string, unknown>): Shot | null {
  switch (source) {
    case "nba_stats":
    case "wnba_stats":
      return shot(cellNumber(row.x_legacy) / 10, cellNumber(row.y_legacy) / 10, row.shot_result === "Made");
    case "nba":
    case "wnba":
    case "mbb":
    case "wbb":
      if (FREE_THROW.test(String(row.type_text ?? ""))) return null;
      return shot(cellNumber(row.coordinate_x_raw) - ESPN_HOOP.x, cellNumber(row.coordinate_y_raw) - ESPN_HOOP.y, row.scoring_play === true);
    case "nhl": {
      if (!NHL_SHOTS.has(String(row.event_type))) return null;
      const side = row.event_team_type === "home" ? 1 : row.event_team_type === "away" ? -1 : NaN;
      return shot(side * cellNumber(row.y_fixed), RINK_GOAL_Y - side * cellNumber(row.x_fixed), row.event_type === "GOAL", cellNumber(row.xg));
    }
    case "pwhl": {
      const x = cellNumber(row.x_coord);
      const side = Math.sign(x) || 1;
      return shot(side * cellNumber(row.y_coord), RINK_GOAL_Y - side * x, row.goal === true, cellNumber(row.xg));
    }
  }
}
