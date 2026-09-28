"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceTicks } from "@lib/platform/scales";
import { formatValue } from "@lib/platform/trends";
import { resolveColor, sizeCanvas } from "@lib/platform/viz/canvas";
import { median, nearest, paddedDomain, type ScatterPoint } from "@lib/platform/viz/scatterMath";

/**
 * One canvas of dots (a scatter often holds thousands of marks): CSS px ×
 * devicePixelRatio, redrawn in a requestAnimationFrame whenever the marks,
 * the box width, the hover or the theme change. Colours come from the theme
 * tokens at draw time (`resolveColor`). Tick labels and the median captions
 * are canvas text at device-pixel scale; the hover label is HTML.
 */

/** The right gutter holds the Y median's caption, clear of every mark. */
const PAD = { l: 52, r: 52, t: 34, b: 26 };
const R = 4; // dot radius: an 8 px marker
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
const HIT_PX = 20;

/** Canvas colours: theme tokens, resolved once per theme. */
const TOKENS = {
  mark: "--color-chart-cat-1",
  surface: "--color-card",
  grid: "--color-border",
  axis: "--color-muted-foreground",
  ink: "--color-foreground",
  median: "--color-score",
} as const;

/** Keeps the canvas as wide as its box, in CSS px. */
function useBoxWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Bumps on every theme switch (next-themes flips `class` on <html>). */
function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, []);
  return tick;
}

export default function ScatterCanvas({
  points,
  xLabel,
  yLabel,
}: {
  points: readonly ScatterPoint[];
  xLabel: string;
  yLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = useBoxWidth(box);
  const H = Math.round(Math.min(560, Math.max(300, W * 0.68)));
  const theme = useThemeTick();
  // The hovered mark's index, tied to the marks it indexes: a new set of
  // marks (source, season or axis switch) drops it without an effect.
  const [hovered, setHovered] = useState<{ of: readonly ScatterPoint[]; i: number } | null>(null);
  const hover = hovered?.of === points ? hovered.i : null;
  // Token colours and the font, read off the DOM once per theme, not per hover.
  const style = useRef<{ theme: number; c: Record<keyof typeof TOKENS, string>; font: string } | null>(null);

  const geo = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [x0, x1] = paddedDomain(xs, 0.05);
    const [y0, y1] = paddedDomain(ys, 0.05);
    const plotW = Math.max(1, W - PAD.l - PAD.r);
    const plotH = Math.max(1, H - PAD.t - PAD.b);
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * plotW;
    const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * plotH;
    return {
      x0, x1, y0, y1, sx, sy,
      px: points.map((p) => ({ px: sx(p.x), py: sy(p.y) })),
      xTicks: niceTicks(x0, x1, W < 520 ? 4 : 7),
      yTicks: niceTicks(y0, y1, H < 400 ? 4 : 6),
      mx: median(xs),
      my: median(ys),
      dense: (points.length * Math.PI * (R + RING) ** 2) / (plotW * plotH) > DENSE,
    };
  }, [points, W, H]);

  useEffect(() => {
    const host = box.current;
    const el = canvas.current;
    if (!host || !el || W <= 0) return;
    const frame = requestAnimationFrame(() => {
      const ctx = sizeCanvas(el, W, H);
      if (style.current?.theme !== theme) {
        const c = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, resolveColor(host, v)]));
        style.current = { theme, c: c as Record<keyof typeof TOKENS, string>, font: getComputedStyle(host).fontFamily };
      }
      const { c, font } = style.current;
      const crisp = (v: number) => Math.round(v) + 0.5;
      const [left, right, top, bottom] = [PAD.l, W - PAD.r, PAD.t, H - PAD.b];

      // Recessive grid and tick labels.
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.grid;
      ctx.fillStyle = c.axis;
      ctx.font = `11px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const t of geo.xTicks) {
        const x = crisp(geo.sx(t));
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.fillText(formatValue(t), x, bottom + 6);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const t of geo.yTicks) {
        const y = crisp(geo.sy(t));
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(formatValue(t), left - 6, y);
      }

      // Dots, each in a 2 px surface ring so overlaps stay countable, or, past
      // DENSE, translucent and ringless. Every hover change repaints them all.
      // ponytail: ~10k marks (MBB player value) repaint in one frame; cache
      // the base layer offscreen if faces (T3) push a frame past 16 ms.
      const dot = (x: number, y: number, ringAlpha: number) => {
        ctx.beginPath();
        ctx.arc(x, y, R + RING / 2, 0, Math.PI * 2);
        ctx.globalAlpha = ringAlpha;
        ctx.lineWidth = RING;
        ctx.strokeStyle = c.surface;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = c.mark;
        ctx.fill();
      };
      if (geo.dense) {
        // One path per mark: a single path would fill its overlaps once.
        ctx.globalAlpha = DENSE_ALPHA;
        ctx.fillStyle = c.mark;
        for (const p of geo.px) {
          ctx.beginPath();
          ctx.arc(p.px, p.py, R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else for (const p of geo.px) dot(p.px, p.py, RING_ALPHA);

      // The median crosshair, each line captioned MEDIAN over its bold value.
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
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = c.median;
      if (geo.mx != null) {
        const x = crisp(geo.sx(geo.mx));
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
      if (geo.my != null) {
        const y = crisp(geo.sy(geo.my));
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (geo.mx != null) {
        const x = geo.sx(geo.mx);
        const flip = x > right - 70;
        caption("MEDIAN", formatValue(geo.mx), flip ? x - 5 : x + 5, top - 4, flip ? "right" : "left");
      }
      if (geo.my != null) caption("MEDIAN", formatValue(geo.my), W - 2, geo.sy(geo.my) - 5, "right");

      // The hovered mark, redrawn on top inside a ring of text ink.
      if (hover != null && geo.px[hover]) {
        const p = geo.px[hover];
        dot(p.px, p.py, 1);
        ctx.beginPath();
        ctx.arc(p.px, p.py, R + RING + 1.5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.ink;
        ctx.stroke();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [geo, W, H, hover, theme]);

  function onPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(geo.px, e.clientX - r.left, e.clientY - r.top, HIT_PX);
    if (i !== (hover ?? -1)) setHovered(i < 0 ? null : { of: points, i });
  }

  const hp = hover != null ? points[hover] : null;
  const at = hover != null ? geo.px[hover] : null;
  const flip = at ? at.px > W - 200 : false;

  return (
    <div
      ref={box}
      data-testid="scatter-canvas"
      data-marks={points.length}
      data-dense={geo.dense ? "true" : "false"}
      data-median-x={geo.mx ?? ""}
      data-median-y={geo.my ?? ""}
      data-plot={JSON.stringify({ l: PAD.l, r: PAD.r, t: PAD.t, b: PAD.b, x: [geo.x0, geo.x1], y: [geo.y0, geo.y1] })}
      className="relative w-full font-inter"
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${yLabel} against ${xLabel}: ${points.length} marks with median lines. The table view lists every value.`}
        className="block"
        style={{ width: W, height: H }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        // A finger lift fires pointerleave too: only a mouse leaving clears
        // the label. A tap on empty space clears it (onPointer, no mark).
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHovered(null);
        }}
      />
      {hp && at ? (
        <div
          data-testid="scatter-hover"
          className="pointer-events-none absolute z-10 max-w-[14rem] rounded-md border border-border bg-card px-2.5 py-1.5 font-inter text-xs shadow-sm"
          style={{
            top: Math.max(0, at.py - 14),
            ...(flip ? { right: W - at.px + 12 } : { left: at.px + 12 }),
          }}
        >
          <p className="font-semibold text-foreground">{hp.label}</p>
          {hp.team ? <p className="text-muted-foreground">{hp.team}</p> : null}
          <p className="tabular-nums text-muted-foreground">
            {xLabel} <span className="text-foreground">{formatValue(hp.x)}</span> · {yLabel}{" "}
            <span className="text-foreground">{formatValue(hp.y)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
