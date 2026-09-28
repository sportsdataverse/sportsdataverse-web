"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceTicks } from "@lib/platform/scales";
import { formatValue } from "@lib/platform/trends";
import { ALL_PAIRS_CAP, CATEGORICAL } from "@lib/platform/chartTokens";
import { resolveColor, sizeCanvas } from "@lib/platform/viz/canvas";
import { labelIndices, placeLabels } from "@lib/platform/viz/labels";
import {
  baseView,
  median,
  nearest,
  paddedDomain,
  panView,
  zoomView,
  type ScatterPoint,
  type ZoomView,
} from "@lib/platform/viz/scatterMath";

/**
 * One canvas of dots (a scatter often holds thousands of marks): CSS px ×
 * devicePixelRatio, redrawn in a requestAnimationFrame whenever the marks,
 * the box width, the hover, the highlight, the zoom or the theme change.
 * Colours come from the theme tokens at draw time (`resolveColor`). Tick
 * labels, the median captions and the outlier labels are canvas text at
 * device-pixel scale; the hover label is HTML.
 *
 * Zoom and pan live in refs (never the URL) and reset with the marks (an
 * axis, source or season switch). The wheel zooms about the pointer only once
 * the chart is active (clicked, or focused from the keyboard); otherwise it
 * scrolls the page and a hint says to click. Ctrl/⌘ + wheel is always the
 * browser's page zoom. A mouse drag pans; + / − / Reset are the touch and
 * keyboard path. A finger drag scrolls the page, and so does a pen drag
 * wherever the browser treats a pen as touch (it sends pointercancel).
 * ponytail: no pen panning; it would need touch-action: none, which takes
 * one-finger page scroll away from phones too.
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
/** While a highlight is on, every other mark is context: muted, faint, no ring. */
const FADED_ALPHA = 0.15;
const HIT_PX = 20;
/** + / − zoom step, and the wheel's zoom per pixel of scroll. */
const STEP = 2;
const WHEEL = 0.002;
const LABEL_FONT = 11;
/** How long the "click to zoom" hint stays up after a wheel over an inactive chart. */
const HINT_MS = 2000;

/** Canvas colours: theme tokens, resolved once per theme. */
const TOKENS = {
  mark: "--color-chart-cat-1",
  surface: "--color-card",
  grid: "--color-border",
  axis: "--color-muted-foreground",
  ink: "--color-foreground",
  median: "--color-score",
} as const;
/** Highlight chip i draws in categorical slot i (colour follows the chip). */
const HL_TOKENS = CATEGORICAL.slice(0, ALL_PAIRS_CAP).map((s) => `--color-chart-${s}`);

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

const toolClass =
  "inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border px-2 font-inter text-sm hover:bg-muted aria-pressed:bg-muted";

export default function ScatterCanvas({
  points,
  xLabel,
  yLabel,
  slots = null,
}: {
  points: readonly ScatterPoint[];
  xLabel: string;
  yLabel: string;
  /** Each mark's highlight slot (-1: not highlighted), or null with no highlight. */
  slots?: readonly number[] | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const W = useBoxWidth(box);
  const H = Math.round(Math.min(560, Math.max(300, W * 0.68)));
  const theme = useThemeTick();
  const [showLabels, setShowLabels] = useState(true);
  // The hovered mark (and where it was drawn), tied to the marks it indexes:
  // a new set of marks (source, season or axis switch) drops it without an effect.
  const [hovered, setHovered] = useState<{ of: readonly ScatterPoint[]; i: number; px: number; py: number } | null>(null);
  const hover = hovered?.of === points ? hovered : null;
  // Token colours and the font, read off the DOM once per theme, not per frame.
  const style = useRef<{ theme: number; c: Record<keyof typeof TOKENS, string>; hl: string[]; font: string } | null>(null);
  // The zoom, tied to its marks the same way: new marks start unzoomed.
  const zoom = useRef<{ of: readonly ScatterPoint[]; v: ZoomView } | null>(null);
  // Where each mark was last drawn (NaN off the plot), for the hit test.
  const drawnAt = useRef<{ px: number; py: number }[]>([]);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const draw = useRef<() => void>(() => {});
  const frame = useRef(0);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef(0);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const geo = useMemo(() => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const plotW = Math.max(1, W - PAD.l - PAD.r);
    const plotH = Math.max(1, H - PAD.t - PAD.b);
    return {
      base: baseView(paddedDomain(xs, 0.05), paddedDomain(ys, 0.05)),
      plotW,
      plotH,
      // the medians of every plotted mark, whatever the zoom shows
      mx: median(xs),
      my: median(ys),
      dense: (points.length * Math.PI * (R + RING) ** 2) / (plotW * plotH) > DENSE,
    };
  }, [points, W, H]);
  const labelled = useMemo(() => labelIndices(points, slots), [points, slots]);

  const view = useCallback(() => (zoom.current?.of === points ? zoom.current.v : geo.base), [points, geo]);
  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw.current();
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** A new view: redraw, and drop the hover label (it would float off its mark). */
  const setView = useCallback(
    (v: ZoomView) => {
      zoom.current = { of: points, v };
      setHovered(null);
      schedule();
    },
    [points, schedule]
  );
  const zoomBy = (factor: number, fx = 0.5, fy = 0.5) => setView(zoomView(view(), geo.base, fx, fy, factor));

  useEffect(() => {
    const host = box.current;
    const el = canvas.current;
    if (!host || !el || W <= 0) return;
    draw.current = () => {
      const t0 = performance.now();
      const ctx = sizeCanvas(el, W, H);
      if (style.current?.theme !== theme) {
        const c = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, resolveColor(host, v)]));
        style.current = {
          theme,
          c: c as Record<keyof typeof TOKENS, string>,
          hl: HL_TOKENS.map((v) => resolveColor(host, v)),
          font: getComputedStyle(host).fontFamily,
        };
      }
      const { c, hl, font } = style.current;
      const v = view();
      const { plotW, plotH } = geo;
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
      drawnAt.current = at;

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
      // One path per mark: a single path would fill its overlaps once.
      const translucent = (keep: (i: number) => boolean, alpha: number, fill: string) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        for (let i = 0; i < at.length; i++) {
          if (Number.isNaN(at[i].px) || !keep(i)) continue;
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
          if (slots[i] >= 0 && !Number.isNaN(at[i].px)) dot(at[i].px, at[i].py, 1, hl[slots[i]]);
        }
      } else if (geo.dense) translucent(() => true, DENSE_ALPHA, c.mark);
      else for (const p of at) if (!Number.isNaN(p.px)) dot(p.px, p.py, RING_ALPHA, c.mark);

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
      if (showLabels && v === geo.base) shown = labelled.filter(inPlot);
      else if (showLabels) {
        const seen = at.flatMap((_, i) => (inPlot(i) ? [i] : []));
        shown = labelIndices(seen.map((i) => points[i]), slots ? seen.map((i) => slots[i]) : null).map((j) => seen[j]);
      }
      const dotBox = (i: number) => ({ x: at[i].px - R - 1, y: at[i].py - R - 1, w: 2 * R + 2, h: 2 * R + 2 });
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
      const layout: { i: number; text: string; x: number; y: number; w: number; h: number; leader: boolean }[] = [];
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
        ctx.beginPath();
        ctx.moveTo(px + ((nx - px) / d) * (R + 1), py + ((ny - py) / d) * (R + 1));
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
      if (hover && !Number.isNaN(at[hover.i]?.px)) {
        const p = at[hover.i];
        dot(p.px, p.py, 1, slots ? (slots[hover.i] >= 0 ? hl[slots[hover.i]] : c.axis) : c.mark);
        ctx.beginPath();
        ctx.arc(p.px, p.py, R + RING + 1.5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.ink;
        ctx.stroke();
      }

      // The drawn state, for the walkthrough: the visible domain, its ticks,
      // the label boxes and this frame's draw time.
      host.dataset.plot = JSON.stringify({ ...PAD, x: v.x, y: v.y, k: v.k, xt: xTicks, yt: yTicks });
      host.dataset.labels = JSON.stringify(layout);
      host.dataset.frameMs = (performance.now() - t0).toFixed(2);
    };
    schedule();
  }, [geo, W, H, hover, theme, slots, showLabels, labelled, points, view, schedule]);

  // The wheel zooms about the pointer, but only over an active (focused)
  // chart: a page scrolled past the chart keeps scrolling, and the hint says
  // to click. Ctrl/⌘ + wheel is the browser's page zoom, never handled.
  // React's wheel listener is passive, so this one is native: preventDefault
  // only when it zooms.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (el.ownerDocument.activeElement !== el) {
        setHint(true);
        clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(false), HINT_MS);
        return;
      }
      setHint(false);
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      zoomBy(Math.exp(-e.deltaY * px * WHEEL), (e.clientX - r.left - PAD.l) / geo.plotW, 1 - (e.clientY - r.top - PAD.t) / geo.plotH);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function onPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(drawnAt.current, e.clientX - r.left, e.clientY - r.top, HIT_PX);
    if (i !== (hover?.i ?? -1)) setHovered(i < 0 ? null : { of: points, i, ...drawnAt.current[i] });
  }

  // A mouse drag pans (a pen too, where the browser lets it); a finger drag,
  // and a pen treated as touch (pointercancel), are left to scroll the page.
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType !== "touch" && e.button === 0) {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    onPointer(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return onPointer(e);
    const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
    if (!d.moved && Math.hypot(dx, dy) < 3) return; // a click, not a drag yet
    drag.current = { ...d, x: e.clientX, y: e.clientY, moved: true };
    setView(panView(view(), dx / geo.plotW, -dy / geo.plotH));
  }
  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  const hp = hover ? points[hover.i] : null;
  const flip = hover ? hover.px > W - 200 : false;
  const highlighted = slots ? slots.filter((s) => s >= 0).length : 0;
  // Per-mark draw state, in mark order: "-" faded, "0"-"2" a chip's slot; empty with no highlight.
  const states = useMemo(() => (slots ? slots.map((s) => (s < 0 ? "-" : s)).join("") : ""), [slots]);

  return (
    <div className="font-inter">
      <div className="mb-1 flex flex-wrap items-end gap-1">
        <p className="mr-auto text-xs text-muted-foreground" aria-hidden="true">
          ↑ {yLabel}
        </p>
        <div className="flex gap-1" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels((s) => !s)} className={toolClass}>
            Labels
          </button>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(STEP)} className={toolClass}>
            +
          </button>
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / STEP)} className={toolClass}>
            −
          </button>
          <button type="button" aria-label="Reset zoom" onClick={() => setView(geo.base)} className={toolClass}>
            Reset
          </button>
        </div>
      </div>
      <div
        ref={box}
        data-testid="scatter-canvas"
        data-marks={points.length}
        data-dense={geo.dense ? "true" : "false"}
        data-median-x={geo.mx ?? ""}
        data-median-y={geo.my ?? ""}
        data-hl={states}
        className="relative w-full"
      >
        {/* Focusable, so a click (focus) or Tab makes the chart active for
            the wheel; blur or a click elsewhere makes it inactive again. */}
        <canvas
          ref={canvas}
          role="img"
          tabIndex={0}
          aria-label={`${yLabel} against ${xLabel}: ${points.length} marks${slots ? `, ${highlighted} highlighted` : ""} with median lines. Focused, the mouse wheel zooms; the buttons above zoom too. The table view lists every value.`}
          className="block cursor-grab active:cursor-grabbing"
          style={{ width: W, height: H }}
          onPointerMove={onMove}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          // A finger lift fires pointerleave too: only a mouse leaving clears
          // the label. A tap on empty space clears it (onPointer, no mark).
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse" && !drag.current) setHovered(null);
          }}
        />
        <p
          data-testid="scatter-wheel-hint"
          data-shown={hint ? "true" : "false"}
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm transition-opacity duration-300 ${hint ? "opacity-100" : "opacity-0"}`}
        >
          Click to zoom with the wheel
        </p>
        {hp && hover ? (
          <div
            data-testid="scatter-hover"
            className="pointer-events-none absolute z-10 max-w-[14rem] rounded-md border border-border bg-card px-2.5 py-1.5 font-inter text-xs shadow-sm"
            style={{
              top: Math.max(0, hover.py - 14),
              ...(flip ? { right: W - hover.px + 12 } : { left: hover.px + 12 }),
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
    </div>
  );
}
