/**
 * Faces and logos on the scatter (P4 T3, F14 v1): each row's ESPN id, the
 * combiner-sized image per distinct id, and the round atlas the canvas draws
 * a mark from with one `drawImage`. The atlas is built in the viewer's
 * browser from `a.espncdn.com` (CORS `*`, so the canvas stays untainted and
 * the PNG export works); nothing is published. `roundAtlas` is browser-only;
 * everything else is pure.
 */
import type { ScatterSource } from "../../../content/scatter.ts";
import { headshotSrc, teamLogoSrc, type Frame, type League, type LogoLeague } from "../spriteAtlas.ts";

/** The combiner request size: a 22 px face at DPR 2 needs 44 px. */
export const CELL = 48;
/** A face or logo's diameter on the canvas, in CSS px. */
export const FACE = 22;

/** One crosswalk row: a source id (`key`) and its ESPN id (`value`), both as text. */
export type Xwalk = { key: string; value: string };
/** What the canvas draws from: the round atlas and its frames by ESPN id. */
export type Sprites = { canvas: CanvasImageSource; frames: Record<string, Frame> };

const LEAGUES: readonly League[] = ["cfb", "nfl", "mbb", "wbb", "nba", "wnba"];

/** An id as a frame key: a string, number or bigint as text; null and
 *  undefined are "no id"; anything else (an object, a boolean) is not an id,
 *  and `String()` would hide that as "[object Object]". */
export function idText(v: unknown): string | null {
  if (v == null) return null;
  const t = typeof v;
  if (t !== "string" && t !== "number" && t !== "bigint") throw new TypeError(`an id must be a string, number or bigint, not ${t}`);
  return String(v);
}

/** Per row, the crosswalk `value` whose `key` is the row's `idCol` as text
 *  (`1629029` matches `"1629029"`: ids are compared as text, never by `===`
 *  across types); null when unmatched. A repeated key keeps its first value. */
export function joinOnStringId(rows: readonly Record<string, unknown>[], idCol: string, xwalk: readonly Xwalk[]): (string | null)[] {
  const by = new Map<string, string>();
  for (const { key, value } of xwalk) if (!by.has(key)) by.set(key, value);
  return rows.map((r) => {
    const k = idText(r[idCol]);
    return k == null ? null : (by.get(k) ?? null);
  });
}

/** Each row's ESPN id: its own `idCol` for an ESPN-keyed source, else
 *  bridged through the source's crosswalk (none loaded: no ids). */
export function espnIds(
  source: ScatterSource,
  rows: readonly Record<string, unknown>[],
  idCol: string,
  xwalk: readonly Xwalk[] | null
): (string | null)[] {
  return source.xwalk ? joinOnStringId(rows, idCol, xwalk ?? []) : rows.map((r) => idText(r[idCol]));
}

/** The ESPN league a source's images live under: `nba_stats` rows are NBA players; otherwise the schema. */
export function spriteLeague(schema: string): League | null {
  const l = schema === "nba_stats" ? "nba" : schema;
  return LEAGUES.find((x) => x === l) ?? null;
}

/** One combiner-sized image per distinct ESPN id, in first-seen order: a
 *  headshot for a player source, a light or dark logo for a team source. */
export function spriteEntries(source: ScatterSource, ids: readonly (string | null)[], dark: boolean): { id: string; src: string }[] {
  const league = spriteLeague(source.schema);
  const logo: LogoLeague | null = league === "cfb" || league === "nfl" || league === "mbb" ? league : null;
  if (!league || (source.noun === "teams" && !logo)) return [];
  const out: { id: string; src: string }[] = [];
  for (const id of new Set(ids)) {
    if (id == null) continue;
    out.push({ id, src: logo && source.noun === "teams" ? teamLogoSrc(logo, id, dark, CELL) : headshotSrc(league, id, { w: CELL, h: CELL }) });
  }
  return out;
}

/**
 * Browser-only. Every frame of `atlas` redrawn once as a `d`-px circle on a
 * second canvas (a circular clip, the frame cover-fit and centred in it), so
 * the scatter draws a mark with one plain `drawImage` and no per-mark clip.
 * The grid keeps its layout, each cell scaled from its size to `d`.
 * ponytail: the frame is the whole cell (the combiner returns exactly w×h,
 * 48×48 here); an image buildAtlas had to pad sits top-left in its cell and
 * would need its drawn size to centre. Pass `d = FACE * devicePixelRatio`.
 */
export function roundAtlas(atlas: { canvas: HTMLCanvasElement; frames: Record<string, Frame> }, d: number): { canvas: HTMLCanvasElement; frames: Record<string, Frame> } {
  const entries = Object.entries(atlas.frames);
  const cell = entries[0]?.[1].w ?? d;
  const k = d / cell;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(atlas.canvas.width * k);
  canvas.height = Math.round(atlas.canvas.height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  const frames: Record<string, Frame> = {};
  for (const [id, f] of entries) {
    const g = { x: Math.round((f.x / cell) * d), y: Math.round((f.y / cell) * d), w: d, h: d };
    const s = Math.max(d / f.w, d / f.h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.x + d / 2, g.y + d / 2, d / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, g.x + (d - f.w * s) / 2, g.y + (d - f.h * s) / 2, f.w * s, f.h * s);
    ctx.restore();
    // defineProperty: as packFrames, an id "__proto__" must be a frame, not the prototype
    Object.defineProperty(frames, id, { value: g, enumerable: true, writable: true, configurable: true });
  }
  return { canvas, frames };
}
