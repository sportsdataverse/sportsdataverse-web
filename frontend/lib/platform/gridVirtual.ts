/** At this many rows or fewer the grid renders every row; above it, a window. */
export const WINDOW_MIN = 200;

/**
 * The rows a fixed-row-height list renders at a scroll position: those in view
 * plus `overscan` on each side, and the pixel heights of the spacers standing
 * in for the rest (`padTop + (end - start) * rowHeight + padBottom` is always
 * the full list's height). `scrollTop` is clamped to the content, so the frame
 * after a filter shrinks the list still gets a window ending at the last row.
 */
export function visibleRange({
  scrollTop,
  viewport,
  rowHeight,
  total,
  overscan,
}: {
  scrollTop: number;
  viewport: number;
  rowHeight: number;
  total: number;
  overscan: number;
}): { start: number; end: number; padTop: number; padBottom: number } {
  if (total <= WINDOW_MIN) return { start: 0, end: total, padTop: 0, padBottom: 0 };
  const inView = Math.ceil(viewport / rowHeight);
  const first = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight)), Math.max(0, total - inView));
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + inView + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight };
}
