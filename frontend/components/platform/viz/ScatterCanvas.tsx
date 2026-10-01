"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatValue } from "@lib/platform/trends";
import { resolveColor, sizeCanvas } from "@lib/platform/viz/canvas";
import { labelIndices } from "@lib/platform/viz/labels";
import { isBaseView, nearest, panView, zoomView, type ScatterPoint, type ZoomView } from "@lib/platform/viz/scatterMath";
import {
  drawScatter,
  drawScatterExport,
  EXPORT_AXIS,
  EXPORT_BOX,
  EXPORT_INSET,
  HL_TOKENS,
  PAD,
  scatterDomain,
  scatterGeo,
  TOKENS,
  type ScatterColors,
  type ScatterScene,
} from "@lib/platform/viz/scatterDraw";
import { canvasToPng, type SubtitleRun } from "@lib/platform/svgExport";

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
 *
 * The drawing itself is lib/platform/viz/scatterDraw.ts: `ref` exports the
 * view on screen, redrawn at the export's fixed size (ScatterExport).
 */

const HIT_PX = 20;
/** + / − zoom step, and the wheel's zoom per pixel of scroll. */
const STEP = 2;
const WHEEL = 0.002;
/** How long the "click to zoom" hint stays up after a wheel over an inactive chart. */
const HINT_MS = 2000;
/** Device px per CSS px in an export: crisp whatever the viewer's DPR. */
const EXPORT_SCALE = 2;

/** The page's hold on the chart, for the PNG export. */
export type ScatterExport = {
  /** Whether the view on screen is off its base view (zoomed or panned);
   *  zoomed in and back out, it is the base view again. */
  zoomed: () => boolean;
  /** The chart as it stands (view, highlight, labels, theme), redrawn at
   *  EXPORT_BOX × EXPORT_SCALE between the given header and footer. What the
   *  export drew lands in the box's `data-export`. */
  png: (text: { title: string; subtitle: SubtitleRun[]; footer: string }) => Promise<Blob>;
};

/** Every canvas colour and the font, read off the DOM in the active theme. */
function readStyle(host: HTMLElement): { colors: ScatterColors; font: string } {
  const c = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, resolveColor(host, v)]));
  return {
    colors: { ...(c as Record<keyof typeof TOKENS, string>), hl: HL_TOKENS.map((v) => resolveColor(host, v)) },
    font: getComputedStyle(host).fontFamily,
  };
}

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
  marks = "dot",
  sprites = null,
  onMarks,
  faceLabel = "Faces",
  facesOff = false,
  ref,
}: {
  points: readonly ScatterPoint[];
  xLabel: string;
  yLabel: string;
  /** Each mark's highlight slot (-1: not highlighted), or null with no highlight. */
  slots?: readonly number[] | null;
  /** Faces (or logos) for the marks with a frame, or dots for every mark. */
  marks?: ScatterScene["marks"];
  /** The round atlas and each mark's id into it; null until loaded (dots meanwhile). */
  sprites?: ScatterScene["sprites"];
  /** Shows the Dots | Faces control, which sets `marks` through it. */
  onMarks?: (marks: ScatterScene["marks"]) => void;
  /** The face option's text: "Logos" for a team source. */
  faceLabel?: string;
  /** The face option is off (too many marks for an atlas); the page's note says why. */
  facesOff?: boolean;
  ref?: React.Ref<ScatterExport>;
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
  const style = useRef<{ theme: number; colors: ScatterColors; font: string } | null>(null);
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

  // The base view and the medians depend on the marks alone (a resize keeps
  // the base view, by identity); the plot box on the size too.
  const domain = useMemo(() => scatterDomain(points), [points]);
  const geo = useMemo(() => scatterGeo(domain, points.length, W, H), [domain, points.length, W, H]);
  const labelled = useMemo(() => labelIndices(points, slots), [points, slots]);

  const view = useCallback(() => (zoom.current?.of === points ? zoom.current.v : geo.base), [points, geo]);
  /** What is drawn, at any size: the screen's canvas and the export share it. */
  const scene = useCallback(
    (hoverAt: number | null, look: { colors: ScatterColors; font: string }): ScatterScene => ({
      points,
      slots,
      view: view(),
      labels: showLabels,
      labelled,
      hover: hoverAt,
      sprites,
      marks,
      ...look,
    }),
    [points, slots, showLabels, labelled, view, sprites, marks]
  );
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
      if (style.current?.theme !== theme) style.current = { theme, ...readStyle(host) };
      const now = scene(hover?.i ?? null, style.current);
      const drawn = drawScatter(ctx, geo, now);
      drawnAt.current = drawn.at;
      const v = now.view;

      // The drawn state, for the walkthrough: the visible domain, its ticks,
      // the label boxes and this frame's draw time.
      host.dataset.plot = JSON.stringify({ ...PAD, x: v.x, y: v.y, k: v.k, xt: drawn.xTicks, yt: drawn.yTicks });
      host.dataset.labels = JSON.stringify(drawn.layout);
      host.dataset.faces = String(drawn.faces);
      host.dataset.frameMs = (performance.now() - t0).toFixed(2);
    };
    schedule();
  }, [geo, W, H, hover, theme, scene, schedule]);

  // The export: the same scene (never the hover), in the theme as it is now,
  // at the export's own size; its title, subtitle and footer are the page's.
  useImperativeHandle(
    ref,
    () => ({
      zoomed: () => !isBaseView(view(), domain.base),
      png: async (text) => {
        const host = box.current;
        if (!host) throw new Error("The chart is not on the page");
        const now = scene(null, readStyle(host));
        let drew: Record<string, unknown> = {};
        const blob = await canvasToPng(host, { ...EXPORT_BOX, scale: EXPORT_SCALE, ...text }, (ctx, top) => {
          const d = drawScatterExport(ctx, domain, now, { x: xLabel, y: yLabel });
          // where the plot landed in the PNG (CSS px), and what it drew
          drew = {
            top,
            box: EXPORT_BOX,
            plot: { ...PAD, x0: EXPORT_INSET, y0: top + EXPORT_AXIS, w: d.geo.W, h: d.geo.H },
            x: now.view.x,
            y: now.view.y,
            k: now.view.k,
            xt: d.xTicks,
            yt: d.yTicks,
            marks: d.marks,
            faces: d.faces,
            labels: d.layout.map(({ text, x, y, w, h }) => ({ text, x, y, w, h })),
          };
        });
        host.dataset.export = JSON.stringify({ ...text, scale: EXPORT_SCALE, ...drew });
        return blob;
      },
    }),
    [scene, domain, view, xLabel, yLabel]
  );

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
          {onMarks ? (
            // weight as well as fill: the chosen one reads without colour
            <div role="group" aria-label="Marks" className="flex h-7 items-center divide-x divide-border overflow-hidden rounded-md border border-border">
              {(["dot", "face"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={marks === m}
                  disabled={m === "face" && facesOff}
                  onClick={() => onMarks(m)}
                  className={`h-full px-2 font-inter text-sm transition-colors disabled:opacity-50 ${marks === m ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {m === "dot" ? "Dots" : faceLabel}
                </button>
              ))}
            </div>
          ) : null}
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
