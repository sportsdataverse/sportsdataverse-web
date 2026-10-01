import type { ReactNode } from "react";
import { RINK, RINK_GOAL_Y, rinkPaths } from "@lib/platform/viz/surfaces";

/**
 * The attacking half of a rink in SVG: the goal at the top, centre ice at
 * the bottom. One feet→px scale (the group's transform) draws the lines and
 * whatever `children` plot — marks in feet, goal at the origin, y toward
 * centre ice, as `normalizeShot` returns them. Lines are `stroke-border`
 * only, 1 px at any size (non-scaling-stroke), no fills, so both themes
 * draw them from the border token. The SVG fills its container's width.
 */
export function Rink({ scale = 4, className, children }: { scale?: number; className?: string; children?: ReactNode }) {
  const w = RINK.width * scale;
  const h = (RINK_GOAL_Y + RINK.goalLine) * scale;
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${h + 2}`} className={className} role="img" aria-label="Attacking half of the rink">
      <g transform={`scale(${scale}) translate(${RINK.width / 2} ${RINK.goalLine})`}>
        {rinkPaths().map((d, i) => (
          <path key={i} d={d} className="stroke-border" fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {children}
      </g>
    </svg>
  );
}
