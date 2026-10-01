"use client";

import { useRef } from "react";
import { chartVar } from "@lib/platform/chartTokens";
import { leagueRateAt, pct, signed, type CurveRow, type MadeKind } from "@lib/platform/viz/hexbin";
import { kernelSmooth, type DistRow } from "@lib/platform/viz/shotStats";

/** The by-distance smoother: σ 0.9 bins, weighted by attempts. */
export const CURVE_SIGMA = 0.9;

const W = 400;
const L = 30; // room for the % labels
const R = 8;
const RATE = { top: 8, h: 100 } as const; // the rate band, 0–100%
const FREQ = { top: 118, h: 44 } as const; // the share-of-shots band
const H = 180; // the x labels sit at 176

/** The companion's bin label, the hovered one's aria-label: "24 ft · 31 shots (8%) · 42% FG · league 38%". */
export function curveLabel(r: DistRow, step: number, share: number, kind: MadeKind, league: number | null): string {
  const ft = step === 1 ? `${r.lo} ft` : `${r.lo}–${r.lo + step} ft`;
  const shots = `${r.n.toLocaleString("en-US")} ${r.n === 1 ? "shot" : "shots"} (${pct(share)})`;
  if (r.n === 0) return `${ft} · no shots`;
  if (kind === "FG") return `${ft} · ${shots} · ${pct(r.made / r.n)} FG${league === null ? "" : ` · league ${pct(league)}`}`;
  return `${ft} · ${shots} · ${r.made} ${r.made === 1 ? "goal" : "goals"} · ${signed(r.made - r.sumXg)} vs xG`;
}

/**
 * The player's rate by distance against the league's, and the share of
 * shots at each distance, in one SVG: the rate band on top (the player's
 * FG% smoothed by `kernelSmooth` at σ 0.9 bins weighted by attempts, the
 * league's F4 rate at each bin's centre; on a rink the player's shooting %
 * and their shots' xG per shot, the same expectation the map colours
 * against), the share band below as bars. Every bin has an invisible hit
 * rect spanning both bands: hovering or focusing it is the ONE hovered
 * distance the map, this curve and the butterfly share (`hover`,
 * `onHover`) — a dot marks the two rates there and the column tints. The
 * rects carry a roving tabindex (the hovered bin, else the first with
 * shots), the arrow keys step a bin, Home/End to the ends, and each one's
 * aria-label is its numbers. Marks: two lines, a bar and a rect per bin, two
 * dots — under 110 for ≤ 50 bins.
 */
export default function DistanceCurves({ rows, step, kind, curve = null, hover, onHover }: {
  rows: readonly DistRow[];
  step: number;
  kind: MadeKind;
  curve?: readonly CurveRow[] | null;
  hover: number | null;
  onHover: (lo: number | null) => void;
}) {
  const refs = useRef(new Map<number, SVGRectElement>());
  const total = rows.reduce((s, r) => s + r.n, 0);
  const maxFt = rows.length * step;
  const x = (ft: number) => L + ((W - L - R) * ft) / maxFt;
  const yRate = (t: number) => RATE.top + RATE.h * (1 - t);
  const player = kernelSmooth(rows.map((r) => (r.n ? r.made / r.n : 0)), rows.map((r) => r.n), CURVE_SIGMA);
  // the smoother reads 0 where no attempt is within its 3σ window; the line breaks there rather than drawing a 0%
  const half = Math.ceil(3 * CURVE_SIGMA);
  const supported = rows.map((_, i) => rows.slice(Math.max(0, i - half), i + half + 1).some((r) => r.n > 0));
  const base: (number | null)[] = kind === "FG" ? rows.map((r) => (curve ? leagueRateAt(curve, r.lo + step / 2) : null)) : kernelSmooth(rows.map((r) => (r.n ? r.sumXg / r.n : 0)), rows.map((r) => r.n), CURVE_SIGMA);
  const maxShare = rows.reduce((m, r) => Math.max(m, r.n), 0) / (total || 1);
  // a line through the bin centres; a null (no league bucket) breaks it
  const line = (ys: readonly (number | null)[]) =>
    ys.map((y, i) => (y === null ? "" : `${i === 0 || ys[i - 1] === null ? "M" : "L"}${x(rows[i].lo + step / 2).toFixed(1)} ${yRate(y).toFixed(1)}`)).filter(Boolean).join(" ");
  const first = rows.find((r) => r.n > 0)?.lo ?? null;
  const tabLo = hover !== null && rows.some((r) => r.lo === hover) ? hover : first;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : -1;
    if (j < 0 || j >= rows.length) return;
    e.preventDefault();
    refs.current.get(rows[j].lo)?.focus();
  };
  const ticks = Array.from({ length: Math.floor((maxFt - 1) / (step * 5)) + 1 }, (_, i) => i * step * 5);
  const at = hover === null ? -1 : rows.findIndex((r) => r.lo === hover);
  const baseName = kind === "FG" ? "league" : "xG per shot";
  return (
    <div data-testid="shots-curves">
      <p className="mb-1 flex flex-wrap items-center gap-x-3 font-inter text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{kind === "FG" ? "FG%" : "Shooting %"} by distance</span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: chartVar("cat-1") }} /> player, smoothed (σ {CURVE_SIGMA} bins)
        </span>
        {kind === "FG" && !curve ? null : (
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: chartVar("cat-2") }} /> {baseName}
          </span>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${kind === "FG" ? "FG%" : "Shooting %"} and share of shots by distance`} data-marks={2 + 2 * rows.length + 2} onPointerLeave={() => onHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={yRate(t)} y2={yRate(t)} className="stroke-border" strokeDasharray={t === 0.5 ? "2 3" : undefined} />
            <text x={L - 4} y={yRate(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} className="fill-muted-foreground font-inter tabular-nums">
              {pct(t)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={FREQ.top + FREQ.h} y2={FREQ.top + FREQ.h} className="stroke-border" />
        <text x={L - 4} y={FREQ.top + FREQ.h / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} className="fill-muted-foreground font-inter">
          share
        </text>
        {ticks.map((ft) => (
          <text key={ft} x={x(ft)} y={H - 4} textAnchor="middle" fontSize={9} className="fill-muted-foreground font-inter tabular-nums">
            {ft}{ft === 0 ? " ft" : ""}
          </text>
        ))}
        {/* the share bars */}
        {rows.map((r) => {
          const h = total ? (FREQ.h * (r.n / total)) / maxShare : 0;
          return <rect key={r.lo} x={x(r.lo) + 0.5} y={FREQ.top + FREQ.h - h} width={Math.max(0, x(r.lo + step) - x(r.lo) - 1)} height={h} className="fill-muted-foreground/50" />;
        })}
        <path data-testid="shots-curve-player" d={line(player.map((v, i) => (supported[i] ? v : null)))} fill="none" stroke={chartVar("cat-1")} strokeWidth={1.5} />
        <path data-testid="shots-curve-base" d={line(base.map((v, i) => (kind === "FG" || supported[i] ? v : null)))} fill="none" stroke={chartVar("cat-2")} strokeWidth={1.5} strokeDasharray={kind === "FG" ? undefined : "3 2"} />
        {at >= 0 ? (
          <>
            <circle cx={x(rows[at].lo + step / 2)} cy={yRate(player[at])} r={3} fill={chartVar("cat-1")} />
            {base[at] === null ? null : <circle cx={x(rows[at].lo + step / 2)} cy={yRate(base[at])} r={3} fill={chartVar("cat-2")} />}
          </>
        ) : null}
        {/* the hit rects: one hovered distance for the map, this curve and the butterfly */}
        <g data-testid="shots-curve-bins">
          {rows.map((r, i) => (
            <rect
              key={r.lo}
              ref={(el) => {
                if (el) refs.current.set(r.lo, el);
                else refs.current.delete(r.lo);
              }}
              x={x(r.lo)}
              y={RATE.top}
              width={x(r.lo + step) - x(r.lo)}
              height={FREQ.top + FREQ.h - RATE.top}
              data-lo={r.lo}
              data-n={r.n}
              data-hover={r.lo === hover ? "" : undefined}
              className={`focus:outline-none ${r.lo === hover ? "fill-foreground/10" : "fill-transparent"}`}
              tabIndex={r.lo === tabLo ? 0 : -1}
              role="img"
              aria-label={curveLabel(r, step, total ? r.n / total : 0, kind, base[i])}
              onPointerEnter={() => onHover(r.lo)}
              onFocus={() => onHover(r.lo)}
              onBlur={() => onHover(null)}
              onKeyDown={(e) => onKey(e, i)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
