"use client";

import { useMemo, useRef, useState } from "react";
import { Court } from "./Court";
import { Rink } from "./Rink";
import type { ShotsSurface } from "@content/shots";
import { chartVar, DIVERGING, SEQUENTIAL } from "@lib/platform/chartTokens";
import { binKey, binSlot, HEX_RADIUS, hexPoints, hexSize, LEAGUE_CUTS, nearestBin, pct, readoutText, signed, XG_CUTS, type CurveRow, type HexBin, type MadeKind } from "@lib/platform/viz/hexbin";
import { DIST_STEP, distBin, SMOOTH_SIGMA, ZONE_LABELS, type ZoneStat } from "@lib/platform/viz/shotStats";
import type { ShotsView } from "@lib/platform/viewState";

/** The surfaces' default feet→px scales (Court 8, Rink 4): a 1 px dot in the viewBox is 1/scale ft. */
const SCALE = { court: 8, rink: 4 } as const;

/** Arrow keys walk the marks: +y is down the screen on both surfaces. */
const ARROWS: Record<string, readonly [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

/** A zone's in-fill label: its FG% (or goals − xG) and its shots; "—" for none. */
const zoneLabel = (z: ZoneStat, kind: MadeKind) => (z.n === 0 ? "—" : `${kind === "FG" ? pct(z.made / z.n) : signed(z.made - z.sumXg)} · ${z.n.toLocaleString("en-US")}`);

/**
 * A player's shots as hexagons on a court or rink: every bin a hex sized by
 * volume (lib/platform/viz/hexbin.ts `hexSize`, against the busiest bin in
 * `all`) and coloured by `binSlot` — against the league's FG% at the bin's
 * distance when a `curve` is given — a lone shot a 2 px dot. One mark per
 * bin, at most ~300 (the radii are chosen for it), all SVG. In the
 * `smoothed` mode the page hands in bins whose rates are already smoothed
 * (`smoothBins`): the same marks, recoloured, and the readout says so. In
 * the `zones` mode the marks are the `zones` instead — a region fill per
 * zone (evenodd paths, outermost first) with its FG% and shots lettered on
 * it — hovered, focused, coloured and read exactly as bins (a zone IS a bin
 * with a path and an anchor). Hovering or focusing a mark outlines it and
 * fills the readout box in the chart's bottom-left corner — a fixed box,
 * not a tooltip, so it never covers the mark it describes and reads the
 * same on a phone — and hands the companions the distance bin holding the
 * mark's mean distance (`onHoverDistance`); a distance hovered on a
 * companion (`hoverDistance`) draws a translucent band over the court or
 * rink at that distance, one bin wide, while no mark is hovered here. The
 * marks are in reading order (top to bottom, left to right) with a roving
 * tabindex: Tab reaches the hovered mark (else the first), the arrow keys
 * move to the nearest mark in that direction, Home/End to the first/last,
 * and each mark's aria-label is its readout. The legend names the ramp and
 * the size (or label) rule.
 */
export default function ShotMap({ bins, all, surface, kind, curve = null, mode = "raw", zones = [], hoverDistance = null, onHoverDistance }: {
  /** The bins drawn (those at or above the page's min-n); smoothed already in the smoothed mode. */
  bins: readonly HexBin[];
  /** Every bin, for the size scale: the min-n slider never rescales the marks. */
  all: readonly HexBin[];
  surface: ShotsSurface;
  kind: MadeKind;
  /** The league's F4 FG% by distance for the season (hoops): the marks and
   *  legend turn diverging, FG% vs the league at that distance. */
  curve?: readonly CurveRow[] | null;
  mode?: ShotsView["mode"];
  /** The surface's zones with their stats (`zoneStats`), drawn in the zones mode. */
  zones?: readonly ZoneStat[];
  /** The distance bin (its lower edge, feet) hovered on a companion, or null. */
  hoverDistance?: number | null;
  /** Called with the distance bin of the hovered mark, null on leave. */
  onHoverDistance?: (lo: number | null) => void;
}) {
  // the hovered or focused bin by its lattice centre, so a min-n or player
  // change mid-hover can never point at another bin
  const [hovered, setHovered] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGElement>());
  const radius = HEX_RADIUS[surface.kind];
  const dot = 1 / SCALE[surface.kind];
  const step = DIST_STEP[surface.kind];
  const max = all.reduce((m, b) => Math.max(m, b.n), 0);
  const items: readonly HexBin[] = mode === "zones" ? zones : bins;
  const ordered = useMemo(() => [...items].sort((a, b) => a.cy - b.cy || a.cx - b.cx), [items]);
  const hover = hovered === null ? undefined : ordered.find((b) => binKey(b) === hovered);
  const tabKey = hover ? hovered : ordered.length ? binKey(ordered[0]) : null;
  const enter = (b: HexBin) => {
    setHovered(binKey(b));
    onHoverDistance?.(b.n ? distBin(b, step) : null);
  };
  const leave = () => {
    setHovered(null);
    onHoverDistance?.(null);
  };
  const onKey = (e: React.KeyboardEvent, b: HexBin) => {
    const dir = ARROWS[e.key];
    const next = e.key === "Home" ? ordered[0] : e.key === "End" ? ordered[ordered.length - 1] : dir ? nearestBin(ordered, b, dir) : null;
    if (!next) return;
    e.preventDefault();
    refs.current.get(binKey(next))?.focus();
  };
  const label = (b: HexBin) => {
    const zone = mode === "zones" ? `${ZONE_LABELS[(b as ZoneStat).zone]} · ` : "";
    if (b.n === 0) return `${zone}no shots`;
    return `${zone}${readoutText(b, kind)}${mode === "smoothed" ? " · smoothed" : ""}`;
  };
  const marks = (
    <g data-testid="shots-marks" data-marks={items.length} data-mode={mode} onPointerLeave={leave}>
      {ordered.map((b) => {
        const key = binKey(b);
        const slot = binSlot(b, kind, curve);
        const shared = {
          "data-n": b.n,
          "data-made": b.made,
          "data-dist": b.n ? b.sumDist / b.n : undefined,
          "data-slot": slot ?? undefined,
          fill: slot ? chartVar(slot) : undefined,
          className: `focus:outline-none ${slot ? "" : "fill-muted-foreground/40 "}${key === hovered ? "stroke-foreground" : "stroke-none"}`,
          strokeWidth: 1.5,
          vectorEffect: "non-scaling-stroke" as const,
          tabIndex: key === tabKey ? 0 : -1,
          role: "img",
          "aria-label": label(b),
          onPointerEnter: () => enter(b),
          onFocus: () => enter(b),
          onBlur: () => {
            if (hovered === key) leave();
          },
          onKeyDown: (e: React.KeyboardEvent) => onKey(e, b),
          ref: (el: SVGElement | null) => {
            if (el) refs.current.set(key, el);
            else refs.current.delete(key);
          },
        };
        if (mode === "zones") {
          const z = b as ZoneStat;
          return (
            <g key={key}>
              <path d={z.path} fillRule="evenodd" data-zone={z.zone} fillOpacity={0.75} {...shared} />
              {/* lettered on the fill with a card-coloured halo, so it reads on the saturated ends of either ramp; on both strips of a mirrored zone */}
              {(z.mirror ? [z.cx, -z.cx] : [z.cx]).map((cx) => (
                <text
                  key={cx}
                  transform={`translate(${cx} ${z.cy})${z.rotate ? " rotate(-90)" : ""}`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={1.5}
                  paintOrder="stroke"
                  strokeWidth={0.4}
                  className="pointer-events-none select-none fill-foreground stroke-card font-inter font-semibold tabular-nums"
                  aria-hidden="true"
                >
                  {zoneLabel(z, kind)}
                </text>
              ))}
            </g>
          );
        }
        const size = hexSize(b.n, max);
        return size === 0 ? (
          <circle key={key} cx={b.cx} cy={b.cy} r={dot} {...shared} />
        ) : (
          <polygon key={key} points={hexPoints(b.cx, b.cy, radius * size)} {...shared} />
        );
      })}
    </g>
  );
  // the companions' hovered distance as a band one bin wide: a circle whose stroke is the bin
  const band =
    hoverDistance !== null && !hover ? (
      <circle data-testid="shots-hover-arc" data-lo={hoverDistance} cx={0} cy={0} r={hoverDistance + step / 2} fill="none" strokeWidth={step} className="pointer-events-none stroke-foreground/25" />
    ) : null;
  return (
    <div data-testid="shot-map">
      <div className="relative">
        {surface.kind === "court" ? (
          <Court court={surface.court} scale={SCALE.court} className="w-full">
            {marks}
            {band}
          </Court>
        ) : (
          <Rink scale={SCALE.rink} className="w-full">
            {marks}
            {band}
          </Rink>
        )}
        {/* bottom-left: the far corner of the half court or the neutral zone, where shots are rarest */}
        <p
          data-testid="shots-readout"
          data-bin={hovered ?? ""}
          aria-live="polite"
          className="absolute bottom-2 left-2 z-10 rounded-md border border-border bg-card px-2.5 py-1.5 font-inter text-xs tabular-nums shadow-sm"
        >
          {hover ? <span className="text-foreground">{label(hover)}</span> : <span className="text-muted-foreground">{mode === "zones" ? "Hover a zone" : "Hover a hexagon"}</span>}
        </p>
      </div>
      <Legend ramp={kind === "goals" ? "xg" : curve ? "league" : "fg"} mode={mode} sigma={SMOOTH_SIGMA[surface.kind]} />
    </div>
  );
}

/** The colour ramp, each swatch labelled at its left edge with the cut it
 *  starts at, then the size rule (or, for zones, the label rule). */
function Legend({ ramp, mode, sigma }: { ramp: "fg" | "league" | "xg"; mode: ShotsView["mode"]; sigma: number }) {
  const slots = ramp === "fg" ? SEQUENTIAL : DIVERGING;
  const cut = (c: number) => c.toFixed(2).slice(1); // 0.05 → ".05"
  const pp = (c: number) => String(Math.round(100 * c)); // 0.03 → "3"
  const diverging = (cuts: readonly number[], f: (c: number) => string) => ["", ...[...cuts].reverse().map((c) => `−${f(c)}`), ...cuts.map((c) => `+${f(c)}`)];
  const left = ramp === "fg" ? SEQUENTIAL.map((_, i) => String(20 * i)) : ramp === "league" ? diverging(LEAGUE_CUTS, pp) : diverging(XG_CUTS, cut);
  const unit = ramp === "fg" ? "100" : ramp === "league" ? "pp" : null;
  return (
    <div data-testid="shots-legend" data-ramp={ramp} className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-inter text-xs text-muted-foreground">
      <span>
        {ramp === "fg" ? "FG%" : ramp === "league" ? "FG% vs league at that distance" : "goals − xG per shot"}
        {mode === "smoothed" ? `, smoothed (σ ${sigma} ft)` : ""}
      </span>
      <span className="flex items-start">
        {slots.map((s, i) => (
          <span key={s} className="flex w-8 flex-col">
            <span aria-hidden="true" className="block h-2.5 w-full" style={{ background: chartVar(s) }} />
            <span className="tabular-nums">{left[i]}</span>
          </span>
        ))}
        {unit ? <span className="self-end tabular-nums">{unit}</span> : null}
      </span>
      <span>{mode === "zones" ? `label = ${ramp === "xg" ? "goals − xG" : "FG%"} · shots` : "hex size = shots · dot = 1 shot"}</span>
    </div>
  );
}
