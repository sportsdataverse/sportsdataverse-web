/**
 * Sprite atlas for canvas scatters (roadmap F14): pack 130+ team logos or
 * ~500 headshots into one canvas so a scatter draws from a single image
 * instead of hundreds of `<img>`s. `a.espncdn.com` serves logos, headshots
 * and its `combiner/i?img=…&w=&h=` resizer with `access-control-allow-origin:
 * *`, so images loaded with `crossOrigin="anonymous"` draw without tainting
 * the canvas (PNG export keeps working), and a combiner-sized URL is 12–30×
 * smaller than the 500 px original (logo 64 px: 2.6 KB vs 32 KB; headshot
 * 96×70: 8.9 KB vs 263 KB). The atlas lives in the viewer's browser, so no
 * ESPN pixels are republished — the same posture as today's hotlinked `<img>`.
 *
 * Twin of game-on-paper-app `astro/src/utils/spriteAtlas.ts` with identical
 * signatures for the leagues both know (cfb, nfl); this copy takes a `league`
 * and has no special-images map, and is a superset: the platform scatter
 * also draws college hoops, NBA and WNBA faces (P4 T3).
 * Only `buildAtlas` touches the DOM, so the module imports under `node --test`.
 */

export type League = "cfb" | "nfl" | "mbb" | "wbb" | "nba" | "wnba";
/** Leagues with a logo path here: the NFL under `nfl/`, the college leagues under the shared `ncaa/`. */
export type LogoLeague = "cfb" | "nfl" | "mbb";
export type Frame = { x: number; y: number; w: number; h: number };

/** ESPN's headshot directory per league. */
const HEADSHOT_DIR: Record<League, string> = {
  cfb: "college-football",
  nfl: "nfl",
  mbb: "mens-college-basketball",
  wbb: "womens-college-basketball",
  nba: "nba",
  wnba: "wnba",
};

const ESPN = "https://a.espncdn.com";

/**
 * ESPN serves NFL dark-mode logos only under the team ABBREVIATION
 * (`nfl/500-dark/8.png` is a 404; `nfl/500-dark/det.png` exists). ESPN team
 * id → logo abbreviation, copied from game-on-paper-app
 * `astro/src/utils/league.ts` (`NFL_LOGO_ABBR`, PR #249), where all 32 were
 * verified against `500-dark` on 2026-09-14.
 */
export const NFL_LOGO_ABBR: Record<string, string> = {
  "1": "atl", "2": "buf", "3": "chi", "4": "cin", "5": "cle", "6": "dal", "7": "den", "8": "det",
  "9": "gb", "10": "ten", "11": "ind", "12": "kc", "13": "lv", "14": "lar", "15": "mia", "16": "min",
  "17": "ne", "18": "no", "19": "nyg", "20": "nyj", "21": "phi", "22": "ari", "23": "pit", "24": "lac",
  "25": "sf", "26": "sea", "27": "tb", "28": "wsh", "29": "car", "30": "jax", "33": "bal", "34": "hou",
};

/** Row-major grid of `cell`-px squares, `cols` wide; a duplicate id keeps its first slot.
 *  `cols` below 1 would give NaN/Infinity frames silently, so it throws. */
export function packFrames(ids: string[], cell: number, cols: number): Record<string, Frame> {
  if (!(cols >= 1)) throw new RangeError("packFrames: cols must be >= 1");
  const frames: Record<string, Frame> = {};
  let i = 0;
  for (const id of ids) {
    if (Object.hasOwn(frames, id)) continue;
    // defineProperty: a plain `frames[id] =` with id "__proto__" would set the prototype, not a frame
    Object.defineProperty(frames, id, {
      value: { x: (i % cols) * cell, y: Math.floor(i / cols) * cell, w: cell, h: cell },
      enumerable: true, writable: true, configurable: true,
    });
    i++;
  }
  return frames;
}

const combiner = (path: string, w: number, h: number) => `${ESPN}/combiner/i?img=${path}&w=${w}&h=${h}`;

/**
 * ESPN logo URL for a team, light or dark, sized through the combiner when
 * `size` is given. Dark NFL logos go through the abbreviation path; an NFL id
 * missing from the map falls back to the light logo rather than a 404.
 */
export function teamLogoSrc(league: LogoLeague, teamId: string | number, dark: boolean, size?: number): string {
  const id = String(teamId);
  const dir = league === "nfl" ? "nfl" : "ncaa";
  const darkName = league === "nfl" ? NFL_LOGO_ABBR[id] : id;
  const path = dark && darkName ? `/i/teamlogos/${dir}/500-dark/${darkName}.png` : `/i/teamlogos/${dir}/500/${id}.png`;
  return size ? combiner(path, size, size) : ESPN + path;
}

/** ESPN headshot URL for an athlete, sized through the combiner. */
export function headshotSrc(league: League, athleteId: string | number, size: { w: number; h: number }): string {
  return combiner(`/i/headshots/${HEADSHOT_DIR[league]}/players/full/${athleteId}.png`, size.w, size.h);
}

/**
 * Browser-only. Loads every `src` with `crossOrigin="anonymous"`, draws them
 * into a `packFrames` grid (`cols = ceil(sqrt(n))`) on one canvas and returns
 * it with the frame map. Each image is drawn at its natural size, scaled down
 * uniformly only if it overflows the cell, so a 96×70 headshot in a 96 cell
 * is padded, not stretched. An image that fails to load is dropped from
 * `frames`, so the consumer draws a dot for it; its cell stays an empty hole
 * (the survivors keep their slots, the canvas is not repacked).
 */
export async function buildAtlas(
  entries: { id: string; src: string }[],
  cell: number,
): Promise<{ canvas: HTMLCanvasElement; frames: Record<string, Frame> }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const frames = packFrames(entries.map((e) => e.id), cell, cols);
  const n = Object.keys(frames).length;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(n, cols) * cell;
  canvas.height = Math.ceil(n / cols) * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");

  const load = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const seen = new Set<string>();
  await Promise.all(
    entries.map(async ({ id, src }) => {
      if (seen.has(id)) return; // a duplicate id keeps its first entry, as packFrames keeps its first slot
      seen.add(id);
      const img = await load(src);
      const f = frames[id];
      if (!img) {
        delete frames[id];
        return;
      }
      const s = Math.min(1, cell / img.width, cell / img.height);
      ctx.drawImage(img, f.x, f.y, img.width * s, img.height * s);
    }),
  );
  return { canvas, frames };
}
