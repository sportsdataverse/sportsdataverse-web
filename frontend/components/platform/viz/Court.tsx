import type { ReactNode } from "react";
import { courtFrame, type CourtKey } from "@lib/platform/viz/surfaces";

/**
 * A half court in SVG: the hoop at the top, centre court at the bottom.
 * `courtFrame` is the one feet→px scale (the group's transform) that draws
 * the lines and whatever `children` plot — marks in feet, hoop at the
 * origin, y toward centre court, as `normalizeShot` returns them. Lines are
 * `stroke-border` only, 1 px at any size (non-scaling-stroke), no fills, so
 * both themes draw them from the border token (test/surfaces.test.ts scans
 * this file for that). The SVG fills its container's width.
 */
export function Court({ court, scale, className, children }: { court: CourtKey; scale?: number; className?: string; children?: ReactNode }) {
  const f = courtFrame(court, scale);
  return (
    <svg viewBox={f.viewBox} className={className} role="img" aria-label={`${court.toUpperCase()} half court`}>
      <g transform={f.transform}>
        {f.paths.map((d, i) => (
          <path key={i} d={d} className="stroke-border" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {children}
      </g>
    </svg>
  );
}
