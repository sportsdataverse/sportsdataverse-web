/**
 * The scatter's drawing: one routine over a 2D context in CSS px, shared by
 * the page's canvas (ScatterCanvas) and the PNG export, so both draw the same
 * view (domain, zoom, highlight, labels) the same way, each at its own size.
 * Colours are theme tokens the caller resolved (TOKENS, HL_TOKENS).
 */
import { niceTicks } from "../scales.ts";
import { formatValue } from "../trends.ts";
import { ALL_PAIRS_CAP, CATEGORICAL } from "../chartTokens.ts";
import { labelIndices, placeLabels } from "./labels.ts";
import { baseView, median, paddedDomain, type ScatterPoint, type ZoomView } from "./scatterMath.ts";
import { FACE } from "./sprites.ts";
import type { Frame } from "../spriteAtlas.ts";

/** The right gutter holds the Y median's caption, clear of every mark. */
export const PAD = { l: 52, r: 52, t: 34, b: 26 };
export const R = 4; // dot radius: an 8 px marker
const RING = 2; // the surface ring around every dot
/** The ring is a subtle stroke, drawn per mark while marks are countable. */
const RING_ALPHA = 0.5;
/** Marks' ring discs over this share of the plot area are too dense to count
 *  (MBB player value, ~10k marks; NBA on a phone, 1.14): per-mark rings stack
 *  into surface and paint the densest band as empty. Past it, no rings, and
 *  every mark at DENSE_ALPHA so overlaps build up: 1 mark 55%, 2 80%, 3 91%,
 *  4 96%. 0.55 keeps an isolated mark at 2.13:1 (light) / 2.33:1 (dark) on
 *  card, over DESIGN.md's floor for a mark told apart by eye (chart-seq-2,
 *  2.08 / 2.14); 0.5 fell short in light (1.97:1). The table view carries the
 *  values.
 *  ponytail: opacity saturates about 4 marks deep, so a core of dozens reads
 *  as one flat block; a hexbin or density grid is the upgrade. */
const DENSE = 0.5;
const DENSE_ALPHA = 0.55;
/** While a highlight is on, every other mark is context: muted, faint, no ring. */
const FADED_ALPHA = 0.15;
const LABEL_FONT = 11;

/** Canvas colours: theme tokens, resolved once per theme. */
export const TOKENS = {
  mark: "--color-chart-cat-1",
  surface: "--color-card",
  grid: "--color-border",
  axis: "--color-muted-foreground",
  ink: "--color-foreground",
  median: "--color-score",
} as const;
/** Highlight chip i draws in categorical slot i (colour follows the chip). */
export const HL_TOKENS = CATEGORICAL.slice(0, ALL_PAIRS_CAP).map((s) => `--color-chart-${s}`);

/** The export's plot in CSS px, inset from the box's sides as the page's card
 *  pads its canvas (and the export's title and footer), with a row above and
 *  below it for the axis names: fixed, so a PNG never depends on the viewer's
 *  layout. */
export const EXPORT_PLOT = { w: 928, h: 600 };
export const EXPORT_INSET = 16;
export const EXPORT_AXIS = 18;
export const EXPORT_BOX = { w: EXPORT_PLOT.w + 2 * EXPORT_INSET, h: EXPORT_PLOT.h + 2 * EXPORT_AXIS };

/** What the marks fix whatever the size: the base (unzoomed) view and the
 *  medians of every mark. */
export type ScatterDomain = { base: ZoomView; mx: number | null; my: number | null };

export function scatterDomain(points: readonly ScatterPoint[]): ScatterDomain {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { base: baseView(paddedDomain(xs, 0.05), paddedDomain(ys, 0.05)), mx: median(xs), my: median(ys) };
}

/** A domain at one size (CSS px): the plot box, and whether the marks are too
 *  dense for rings there. */
export type ScatterGeo = ScatterDomain & { W: number; H: number; plotW: number; plotH: number; dense: boolean };

export function scatterGeo(domain: ScatterDomain, marks: number, W: number, H: number): ScatterGeo {
  const plotW = Math.max(1, W - PAD.l - PAD.r);
  const plotH = Math.max(1, H - PAD.t - PAD.b);
  return { ...domain, W, H, plotW, plotH, dense: (marks * Math.PI * (R + RING) ** 2) / (plotW * plotH) > DENSE };
}

export type ScatterColors = Record<keyof typeof TOKENS, string> & { hl: string[] };

/** One view of the marks, drawn the same at any size. */
export type ScatterScene = {
  points: readonly ScatterPoint[];
  /** Each mark's highlight slot (-1: not highlighted), or null with no highlight. */
  slots: readonly number[] | null;
  /** The visible domain: the geo's `base` when unzoomed (by identity). */
  view: ZoomView;
  /** The Labels toggle. */
  labels: boolean;
  /** labelIndices(points, slots): the base view's labels, computed once. */
  labelled: readonly number[];
  /** The hovered mark, ringed in ink; null for none (always, in an export). */
  hover: number | null;
  colors: ScatterColors;
  font: string;
  /** The round atlas (lib/platform/viz/sprites.ts) and each mark's ESPN id
   *  into its frames (null: no id); null while none is loaded. */
  sprites: { canvas: CanvasImageSource; frames: Record<string, Frame>; ids: readonly (string | null)[] } | null;
  /** Faces: a mark with a frame draws its face (or logo) on a 2 px ring; one
   *  without draws the dot. Dots: every mark a dot, whatever `sprites` holds. */
  marks: "dot" | "face";
};

export type ScatterLabel = { i: number; text: string; x: number; y: number; w: number; h: number; leader: boolean };

/** Where each mark landed (NaN off the plot), how many were drawn, the ticks
 *  and the placed labels. */
export type ScatterDrawn = {
  at: { px: number; py: number }[];
  marks: number;
  /** How many of them drew a face or logo. */
  faces: number;
  xTicks: number[];
  yTicks: number[];
  layout: ScatterLabel[];
};

/**
 * Draws `scene` into `ctx` (CSS px, origin at the chart's top-left) at the
 * geo's size: grid and ticks for the visible domain, the marks (faded
 * context and ringed highlights, or ringed dots, or translucent past DENSE;
 * in face mode a framed mark is its face on a ring where its dot would be),
 * the median crosshair, the outlier (or highlighted) labels, the MEDIAN
 * captions and the hovered mark.
 */
export function drawScatter(ctx: CanvasRenderingContext2D, geo: ScatterGeo, scene: ScatterScene): ScatterDrawn {
  const { points, slots, view: v, hover, font } = scene;
  const { hl, ...c } = scene.colors;
  const { W, H, plotW, plotH } = geo;
  const sx = (x: number) => PAD.l + ((x - v.x[0]) / (v.x[1] - v.x[0])) * plotW;
  const sy = (y: number) => PAD.t + (1 - (y - v.y[0]) / (v.y[1] - v.y[0])) * plotH;
  const crisp = (n: number) => Math.round(n) + 0.5;
  const [left, right, top, bottom] = [PAD.l, W - PAD.r, PAD.t, H - PAD.b];
  const inX = (x: number) => x >= left - R - RING && x <= right + R + RING;
  const inY = (y: number) => y >= top - R - RING && y <= bottom + R + RING;
  // Ticks for the visible domain: zooming re-ticks the axes.
  const xTicks = niceTicks(v.x[0], v.x[1], W < 520 ? 4 : 7);
  const yTicks = niceTicks(v.y[0], v.y[1], H < 400 ? 4 : 6);

  // Recessive grid and tick labels.
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.grid;
  ctx.fillStyle = c.axis;
  ctx.font = `11px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of xTicks) {
    const x = crisp(sx(t));
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillText(formatValue(t), x, bottom + 6);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of yTicks) {
    const y = crisp(sy(t));
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(formatValue(t), left - 6, y);
  }

  // Everything data-driven stays inside the plot once zoomed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  // Where each mark lands; off the plot it is not drawn, nor hit.
  const at = points.map((p) => {
    const [px, py] = [sx(p.x), sy(p.y)];
    return inX(px) && inY(py) ? { px, py } : { px: NaN, py: NaN };
  });
  // In face mode, the frame a mark draws (none: it draws the dot).
  const sprites = scene.marks === "face" ? scene.sprites : null;
  const frameOf = (i: number): Frame | undefined => {
    if (!sprites) return undefined;
    const id = sprites.ids[i];
    return id != null && Object.hasOwn(sprites.frames, id) ? sprites.frames[id] : undefined;
  };

  // Dots, each in a 2 px surface ring so overlaps stay countable, or, past
  // DENSE, translucent and ringless. Every hover change repaints them all.
  // ponytail: ~10k marks (MBB player value) repaint in one frame; cache
  // the base layer offscreen if faces (T3) push a frame past 16 ms.
  const dot = (x: number, y: number, ringAlpha: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, y, R + RING / 2, 0, Math.PI * 2);
    ctx.globalAlpha = ringAlpha;
    ctx.lineWidth = RING;
    ctx.strokeStyle = c.surface;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // A face: its round frame where the dot would be, on a 2 px ring in the
  // mark's colour (the dot's fill), both at `alpha` (faded context, dense).
  const face = (x: number, y: number, f: Frame, ring: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprites!.canvas, f.x, f.y, f.w, f.h, x - FACE / 2, y - FACE / 2, FACE, FACE);
    ctx.beginPath();
    ctx.arc(x, y, FACE / 2 + RING / 2, 0, Math.PI * 2);
    ctx.lineWidth = RING;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  const mark = (i: number, ringAlpha: number, fill: string) => {
    const f = frameOf(i);
    if (f) face(at[i].px, at[i].py, f, fill, 1);
    else dot(at[i].px, at[i].py, ringAlpha, fill);
  };
  // One path per mark: a single path would fill its overlaps once.
  const translucent = (keep: (i: number) => boolean, alpha: number, fill: string) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    for (let i = 0; i < at.length; i++) {
      if (Number.isNaN(at[i].px) || !keep(i)) continue;
      const f = frameOf(i);
      if (f) {
        face(at[i].px, at[i].py, f, fill, alpha);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        continue;
      }
      ctx.beginPath();
      ctx.arc(at[i].px, at[i].py, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  if (slots) {
    // A highlight: the rest faint and muted, the matches on top in their
    // chip's colour at full opacity, ringed.
    translucent((i) => slots[i] < 0, FADED_ALPHA, c.axis);
    for (let i = 0; i < at.length; i++) {
      if (slots[i] >= 0 && !Number.isNaN(at[i].px)) mark(i, 1, hl[slots[i]]);
    }
  } else if (geo.dense) translucent(() => true, DENSE_ALPHA, c.mark);
  else for (let i = 0; i < at.length; i++) if (!Number.isNaN(at[i].px)) mark(i, RING_ALPHA, c.mark);

  // The median crosshair: the medians of every mark, placed in the view.
  const mX = geo.mx != null ? sx(geo.mx) : NaN;
  const mY = geo.my != null ? sy(geo.my) : NaN;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = c.median;
  if (mX >= left && mX <= right) {
    ctx.beginPath();
    ctx.moveTo(crisp(mX), top);
    ctx.lineTo(crisp(mX), bottom);
    ctx.stroke();
  }
  if (mY >= top && mY <= bottom) {
    ctx.beginPath();
    ctx.moveTo(left, crisp(mY));
    ctx.lineTo(right, crisp(mY));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Outlier labels (or the highlighted ones): names in text ink on a
  // surface halo, kept apart, inside the plot and off the marks that
  // matter (every highlighted dot, or the labelled dots); a pushed name
  // gets a thin leader back to its mark. Zoomed, the outliers are those
  // of the marks in view, so labels follow the zoom.
  const inPlot = (i: number) => at[i].px >= left && at[i].px <= right && at[i].py >= top && at[i].py <= bottom;
  let shown: number[] = [];
  if (scene.labels && v === geo.base) shown = scene.labelled.filter(inPlot);
  else if (scene.labels) {
    const seen = at.flatMap((_, i) => (inPlot(i) ? [i] : []));
    shown = labelIndices(seen.map((i) => points[i]), slots ? seen.map((i) => slots[i]) : null).map((j) => seen[j]);
  }
  const dotBox = (i: number) => {
    const r = frameOf(i) ? FACE / 2 : R;
    return { x: at[i].px - r - 1, y: at[i].py - r - 1, w: 2 * r + 2, h: 2 * r + 2 };
  };
  const obstacles = (slots ? at.flatMap((_, i) => (slots[i] >= 0 && inPlot(i) ? [i] : [])) : shown).map(dotBox);
  ctx.font = `600 ${LABEL_FONT}px ${font}`;
  const boxes = shown.map((i) => ({ w: Math.ceil(ctx.measureText(points[i].label).width) + 4, h: LABEL_FONT + 4 }));
  const placed = placeLabels(
    shown.map((i) => ({ x: at[i].px, y: at[i].py })),
    boxes,
    { l: left, t: top, r: right, b: bottom },
    R + 3,
    obstacles
  );
  const layout: ScatterLabel[] = [];
  placed.forEach((p, j) => {
    if (p) layout.push({ i: shown[j], text: points[shown[j]].label, ...p, ...boxes[j] });
  });
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.axis;
  for (const l of layout) {
    if (!l.leader) continue;
    const { px, py } = at[l.i];
    const [nx, ny] = [Math.min(Math.max(px, l.x), l.x + l.w), Math.min(Math.max(py, l.y), l.y + l.h)];
    const d = Math.hypot(nx - px, ny - py) || 1;
    const edge = (frameOf(l.i) ? FACE / 2 : R) + 1; // a leader starts just off the mark, dot or face
    ctx.beginPath();
    ctx.moveTo(px + ((nx - px) / d) * edge, py + ((ny - py) / d) * edge);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.surface;
  ctx.fillStyle = c.ink;
  for (const l of layout) {
    ctx.strokeText(l.text, l.x + 2, l.y + l.h / 2);
    ctx.fillText(l.text, l.x + 2, l.y + l.h / 2);
  }
  ctx.restore();

  // Each median line captioned MEDIAN over its bold value, in the gutters.
  const caption = (text: string, value: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.surface;
    ctx.font = `600 9px ${font}`;
    ctx.fillStyle = c.axis;
    ctx.strokeText(text, x, y - 13);
    ctx.fillText(text, x, y - 13);
    ctx.font = `700 12px ${font}`;
    ctx.fillStyle = c.ink;
    ctx.strokeText(value, x, y);
    ctx.fillText(value, x, y);
  };
  if (mX >= left && mX <= right) {
    const flip = mX > right - 70;
    caption("MEDIAN", formatValue(geo.mx!), flip ? mX - 5 : mX + 5, top - 4, flip ? "right" : "left");
  }
  if (mY >= top && mY <= bottom) caption("MEDIAN", formatValue(geo.my!), W - 2, mY - 5, "right");

  // The hovered mark, redrawn on top inside a ring of text ink.
  if (hover != null && at[hover] && !Number.isNaN(at[hover].px)) {
    const p = at[hover];
    mark(hover, 1, slots ? (slots[hover] >= 0 ? hl[slots[hover]] : c.axis) : c.mark);
    ctx.beginPath();
    ctx.arc(p.px, p.py, (frameOf(hover) ? FACE / 2 : R) + RING + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.ink;
    ctx.stroke();
  }

  return {
    at,
    marks: at.filter((p) => !Number.isNaN(p.px)).length,
    faces: at.filter((p, i) => !Number.isNaN(p.px) && frameOf(i)).length,
    xTicks,
    yTicks,
    layout,
  };
}

/**
 * The export's chart, framed as the page frames it: "↑ Y" above the plot and
 * "X →" below it, the plot itself drawScatter's at EXPORT_PLOT (the domain's
 * geometry at the export's size, never the on-screen canvas's).
 */
export function drawScatterExport(
  ctx: CanvasRenderingContext2D,
  domain: ScatterDomain,
  scene: ScatterScene,
  axes: { x: string; y: string }
): ScatterDrawn & { geo: ScatterGeo } {
  const geo = scatterGeo(domain, scene.points.length, EXPORT_PLOT.w, EXPORT_PLOT.h);
  ctx.fillStyle = scene.colors.axis;
  ctx.font = `12px ${scene.font}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(`↑ ${axes.y}`, EXPORT_INSET, EXPORT_AXIS - 5);
  ctx.save();
  ctx.translate(EXPORT_INSET, EXPORT_AXIS);
  const drawn = drawScatter(ctx, geo, scene);
  ctx.restore(); // back to the axis names' paint and font
  ctx.textAlign = "right";
  ctx.fillText(`${axes.x} →`, EXPORT_INSET + EXPORT_PLOT.w, EXPORT_BOX.h - 4);
  return { ...drawn, geo };
}
