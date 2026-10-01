"use client";

import { useRef } from "react";
import { chartVar } from "@lib/platform/chartTokens";
import { binSlot, readoutText, type BinStats, type CurveRow, type MadeKind } from "@lib/platform/viz/hexbin";
import { sideTotals, type SideRow } from "@lib/platform/viz/shotStats";

const W = 400;
const L = 30;
const R = 8;
const TOP = 8;
const MID = 90; // the axis: left bars rise from it, right bars hang from it
const BOTTOM = 172;
const H = 184;

/** A side's numbers for the label: "12 shots · 42% FG · 24 ft" or "none". */
const side = (s: BinStats, kind: MadeKind) => (s.n ? readoutText(s, kind) : "none");

/**
 * The shots by distance split by side — x < 0, the left of the drawing (the
 * shooter's left), against x ≥ 0 — as mirrored bars on the curve's x axis:
 * the left side's attempts rise from the axis, the right's hang from it,
 * each bar coloured as the map colours a bin (`binSlot`: FG% vs the league
 * at that distance, or FG%, or goals − xG per shot). The hit rect per bin
 * is the same hovered distance as the map's band and the curve's column
 * (`hover`, `onHover`), with the same roving tabindex and arrow keys; each
 * rect's aria-label is its two sides, and the hovered bin's two sides are
 * written above the chart too (the readout), so a side's rate is never bar
 * colour alone. The totals line above sums the halves. Marks: two bars and
 * a rect per bin — under 150 for ≤ 50 bins.
 */
export default function SideButterfly({ rows, step, kind, curve = null, hover, onHover }: {
  rows: readonly SideRow[];
  step: number;
  kind: MadeKind;
  curve?: readonly CurveRow[] | null;
  hover: number | null;
  onHover: (lo: number | null) => void;
}) {
  const refs = useRef(new Map<number, SVGRectElement>());
  const maxFt = rows.length * step;
  const x = (ft: number) => L + ((W - L - R) * ft) / maxFt;
  const maxN = rows.reduce((m, r) => Math.max(m, r.left.n, r.right.n), 0) || 1;
  const sum = (pick: (r: SideRow) => BinStats) => rows.reduce((a, r) => ({ n: a.n + pick(r).n, made: a.made + pick(r).made, sumDist: a.sumDist + pick(r).sumDist, sumXg: a.sumXg + pick(r).sumXg }), { n: 0, made: 0, sumDist: 0, sumXg: 0 });
  const left = sum((r) => r.left);
  const right = sum((r) => r.right);
  const first = rows.find((r) => r.left.n + r.right.n > 0)?.lo ?? null;
  const tabLo = hover !== null && rows.some((r) => r.lo === hover) ? hover : first;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : -1;
    if (j < 0 || j >= rows.length) return;
    e.preventDefault();
    refs.current.get(rows[j].lo)?.focus();
  };
  const ticks = Array.from({ length: Math.floor((maxFt - 1) / (step * 5)) + 1 }, (_, i) => i * step * 5);
  const bar = (s: BinStats, lo: number, up: boolean) => {
    if (!s.n) return null;
    const h = ((up ? MID - TOP : BOTTOM - MID) * s.n) / maxN;
    const slot = binSlot(s, kind, curve);
    return <rect x={x(lo) + 0.5} y={up ? MID - h : MID} width={Math.max(0, x(lo + step) - x(lo) - 1)} height={h} data-n={s.n} data-slot={slot ?? undefined} fill={slot ? chartVar(slot) : undefined} className={slot ? undefined : "fill-muted-foreground/40"} />;
  };
  const ft = (r: SideRow) => (step === 1 ? `${r.lo} ft` : `${r.lo}–${r.lo + step} ft`);
  const label = (r: SideRow) => `${ft(r)} · left ${side(r.left, kind)} · right ${side(r.right, kind)}`;
  const at = hover === null ? undefined : rows.find((r) => r.lo === hover);
  return (
    <div data-testid="shots-butterfly">
      <p data-testid="shots-butterfly-totals" data-left={left.n} data-right={right.n} className="mb-1 flex flex-wrap items-center gap-x-3 font-inter text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Left vs right</span>
        <span>left {sideTotals(left, kind)}</span>
        <span>right {sideTotals(right, kind)}</span>
      </p>
      <p data-testid="shots-butterfly-readout" aria-live="polite" className="mb-1 min-h-5 font-inter text-xs tabular-nums text-foreground">
        {at ? label(at) : <span className="text-muted-foreground">Hover a column</span>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Shots by distance, left side above the axis and right side below" data-marks={3 * rows.length} onPointerLeave={() => onHover(null)}>
        <line x1={L} x2={W - R} y1={MID} y2={MID} className="stroke-border" />
        <text x={L - 4} y={(TOP + MID) / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} className="fill-muted-foreground font-inter">
          left
        </text>
        <text x={L - 4} y={(MID + BOTTOM) / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} className="fill-muted-foreground font-inter">
          right
        </text>
        {ticks.map((ft) => (
          <text key={ft} x={x(ft)} y={H - 4} textAnchor="middle" fontSize={9} className="fill-muted-foreground font-inter tabular-nums">
            {ft}{ft === 0 ? " ft" : ""}
          </text>
        ))}
        <g data-testid="shots-butterfly-bars">
          {rows.map((r) => (
            <g key={r.lo} data-lo={r.lo} data-left-n={r.left.n} data-right-n={r.right.n}>
              {bar(r.left, r.lo, true)}
              {bar(r.right, r.lo, false)}
            </g>
          ))}
        </g>
        <g data-testid="shots-butterfly-bins">
          {rows.map((r, i) => (
            <rect
              key={r.lo}
              ref={(el) => {
                if (el) refs.current.set(r.lo, el);
                else refs.current.delete(r.lo);
              }}
              x={x(r.lo)}
              y={TOP}
              width={x(r.lo + step) - x(r.lo)}
              height={BOTTOM - TOP}
              data-lo={r.lo}
              data-hover={r.lo === hover ? "" : undefined}
              className={`focus:outline-none ${r.lo === hover ? "fill-foreground/10" : "fill-transparent"}`}
              tabIndex={r.lo === tabLo ? 0 : -1}
              role="img"
              aria-label={label(r)}
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
