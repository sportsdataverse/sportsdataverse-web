import type { ReactNode } from "react";
import { COURT, COURTS, courtPaths, type CourtKey } from "@lib/platform/viz/surfaces";

/**
 * A half court in SVG: the hoop at the top, centre court at the bottom.
 * One feet→px scale (the group's transform) draws the lines and whatever
 * `children` plot — marks in feet, hoop at the origin, y toward centre
 * court, as `normalizeShot` returns them. Lines are `stroke-border` only,
 * 1 px at any size (non-scaling-stroke), no fills, so both themes draw
 * them from the border token. The SVG fills its container's width.
 */
export function Court({ court, scale = 8, className, children }: { court: CourtKey; scale?: number; className?: string; children?: ReactNode }) {
  const w = COURT.width * scale;
  const h = COURT.half * scale;
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${h + 2}`} className={className} role="img" aria-label={`${court.toUpperCase()} half court`}>
      <g transform={`scale(${scale}) translate(${COURT.width / 2} ${COURT.hoop})`}>
        {courtPaths(COURTS[court]).map((d, i) => (
          <path key={i} d={d} className="stroke-border" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {children}
      </g>
    </svg>
  );
}
