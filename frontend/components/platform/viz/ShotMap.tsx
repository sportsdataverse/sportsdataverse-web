"use client";

import { useMemo, useRef, useState } from "react";
import { Court } from "./Court";
import { Rink } from "./Rink";
import type { ShotsSurface } from "@content/shots";
import { chartVar, DIVERGING, SEQUENTIAL } from "@lib/platform/chartTokens";
import { binKey, binSlot, HEX_RADIUS, hexPoints, hexSize, nearestBin, readoutText, XG_CUTS, type HexBin, type MadeKind } from "@lib/platform/viz/hexbin";

/** The surfaces' default feet→px scales (Court 8, Rink 4): a 1 px dot in the viewBox is 1/scale ft. */
const SCALE = { court: 8, rink: 4 } as const;

/** Arrow keys walk the marks: +y is down the screen on both surfaces. */
const ARROWS: Record<string, readonly [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

/**
 * A player's shots as hexagons on a court or rink: every bin a hex sized by
 * volume (lib/platform/viz/hexbin.ts `hexSize`, against the busiest bin in
 * `all`) and coloured by `binSlot`, a lone shot a 2 px dot. One mark per
 * bin, at most ~300 (the radii are chosen for it), all SVG. Hovering or
 * focusing a mark outlines it and fills the readout box in the chart's
 * bottom-left corner — a fixed box, not a tooltip, so it never covers the
 * mark it describes and reads the same on a phone. The marks are in reading
 * order (top to bottom, left to right) with a roving tabindex: Tab reaches
 * the hovered mark (else the first), the arrow keys move to the nearest
 * mark in that direction, Home/End to the first/last, and each mark's
 * aria-label is its readout. The legend names the ramp and the size rule.
 */
export default function ShotMap({ bins, all, surface, kind }: {
  /** The bins drawn (those at or above the page's min-n). */
  bins: readonly HexBin[];
  /** Every bin, for the size scale: the min-n slider never rescales the marks. */
  all: readonly HexBin[];
  surface: ShotsSurface;
  kind: MadeKind;
}) {
  // the hovered or focused bin by its lattice centre, so a min-n or player
  // change mid-hover can never point at another bin
  const [hovered, setHovered] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGElement>());
  const radius = HEX_RADIUS[surface.kind];
  const dot = 1 / SCALE[surface.kind];
  const max = all.reduce((m, b) => Math.max(m, b.n), 0);
  const ordered = useMemo(() => [...bins].sort((a, b) => a.cy - b.cy || a.cx - b.cx), [bins]);
  const hover = hovered === null ? undefined : ordered.find((b) => binKey(b) === hovered);
  const tabKey = hover ? hovered : ordered.length ? binKey(ordered[0]) : null;
  const onKey = (e: React.KeyboardEvent, b: HexBin) => {
    const dir = ARROWS[e.key];
    const next = e.key === "Home" ? ordered[0] : e.key === "End" ? ordered[ordered.length - 1] : dir ? nearestBin(ordered, b, dir) : null;
    if (!next) return;
    e.preventDefault();
    refs.current.get(binKey(next))?.focus();
  };
  const marks = (
    <g data-testid="shots-marks" data-marks={bins.length} onPointerLeave={() => setHovered(null)}>
      {ordered.map((b) => {
        const key = binKey(b);
        const slot = binSlot(b, kind);
        const size = hexSize(b.n, max);
        const shared = {
          "data-n": b.n,
          "data-made": b.made,
          fill: slot ? chartVar(slot) : undefined,
          className: `focus:outline-none ${slot ? "" : "fill-muted-foreground/40 "}${key === hovered ? "stroke-foreground" : "stroke-none"}`,
          strokeWidth: 1.5,
          vectorEffect: "non-scaling-stroke" as const,
          tabIndex: key === tabKey ? 0 : -1,
          role: "img",
          "aria-label": readoutText(b, kind),
          onPointerEnter: () => setHovered(key),
          onFocus: () => setHovered(key),
          onBlur: () => setHovered((h) => (h === key ? null : h)),
          onKeyDown: (e: React.KeyboardEvent) => onKey(e, b),
          ref: (el: SVGElement | null) => {
            if (el) refs.current.set(key, el);
            else refs.current.delete(key);
          },
        };
        return size === 0 ? (
          <circle key={key} cx={b.cx} cy={b.cy} r={dot} {...shared} />
        ) : (
          <polygon key={key} points={hexPoints(b.cx, b.cy, radius * size)} {...shared} />
        );
      })}
    </g>
  );
  return (
    <div data-testid="shot-map">
      <div className="relative">
        {surface.kind === "court" ? (
          <Court court={surface.court} scale={SCALE.court} className="w-full">
            {marks}
          </Court>
        ) : (
          <Rink scale={SCALE.rink} className="w-full">
            {marks}
          </Rink>
        )}
        {/* bottom-left: the far corner of the half court or the neutral zone, where shots are rarest */}
        <p
          data-testid="shots-readout"
          data-bin={hovered ?? ""}
          aria-live="polite"
          className="absolute bottom-2 left-2 z-10 rounded-md border border-border bg-card px-2.5 py-1.5 font-inter text-xs tabular-nums shadow-sm"
        >
          {hover ? <span className="text-foreground">{readoutText(hover, kind)}</span> : <span className="text-muted-foreground">Hover a hexagon</span>}
        </p>
      </div>
      <Legend kind={kind} />
    </div>
  );
}

/** The colour ramp, each swatch labelled at its left edge with the cut it
 *  starts at, then the size rule. */
function Legend({ kind }: { kind: MadeKind }) {
  const slots = kind === "FG" ? SEQUENTIAL : DIVERGING;
  const cut = (c: number) => c.toFixed(2).slice(1); // 0.05 → ".05"
  const left =
    kind === "FG"
      ? SEQUENTIAL.map((_, i) => String(20 * i))
      : ["", ...[...XG_CUTS].reverse().map((c) => `−${cut(c)}`), ...XG_CUTS.map((c) => `+${cut(c)}`)];
  return (
    <div data-testid="shots-legend" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-inter text-xs text-muted-foreground">
      <span>{kind === "FG" ? "FG%" : "goals − xG per shot"}</span>
      <span className="flex items-start">
        {slots.map((s, i) => (
          <span key={s} className="flex w-8 flex-col">
            <span aria-hidden="true" className="block h-2.5 w-full" style={{ background: chartVar(s) }} />
            <span className="tabular-nums">{left[i]}</span>
          </span>
        ))}
        {kind === "FG" ? <span className="self-end tabular-nums">100</span> : null}
      </span>
      <span>hex size = shots · dot = 1 shot</span>
    </div>
  );
}
