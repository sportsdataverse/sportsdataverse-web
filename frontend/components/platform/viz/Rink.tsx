import type { ReactNode } from "react";
import { rinkFrame } from "@lib/platform/viz/surfaces";

/**
 * The attacking half of a rink in SVG: the goal at the top, centre ice at
 * the bottom. `rinkFrame` is the one feet→px scale (the group's transform)
 * that draws the lines and whatever `children` plot — marks in feet, goal
 * at the origin, y toward centre ice, as `normalizeShot` returns them.
 * Lines are `stroke-border` only, 1 px at any size (non-scaling-stroke), no
 * fills, so both themes draw them from the border token
 * (test/surfaces.test.ts scans this file for that). The SVG fills its
 * container's width.
 */
export function Rink({ scale, className, children }: { scale?: number; className?: string; children?: ReactNode }) {
  const f = rinkFrame(scale);
  return (
    <svg viewBox={f.viewBox} className={className} role="img" aria-label="Attacking half of the rink">
      <g transform={f.transform}>
        {f.paths.map((d, i) => (
          <path key={i} d={d} className="stroke-border" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {children}
      </g>
    </svg>
  );
}
