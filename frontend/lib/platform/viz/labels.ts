/**
 * Outlier labels for /platform/scatter: which marks get a name, and where
 * each name goes so no two collide and none leaves the plot.
 */

type XY = { x: number; y: number };

/** Indices of the `k` highest and `k` lowest marks on each axis, most
 *  extreme first (rank 0 of every list, then rank 1, …), de-duplicated: up
 *  to 4k marks. A tie goes to the lower index. */
export function outlierIndices(points: readonly XY[], k = 4): number[] {
  const idx = points.map((_, i) => i);
  const by = (f: (i: number) => number) => [...idx].sort((a, b) => f(a) - f(b) || a - b).slice(0, k);
  const lists = [
    by((i) => -points[i].x),
    by((i) => points[i].x),
    by((i) => -points[i].y),
    by((i) => points[i].y),
  ];
  const out = new Set<number>();
  for (let r = 0; r < k; r++) for (const l of lists) if (r < l.length) out.add(l[r]);
  return [...out];
}

/** Marks to label. With no highlight (every slot < 0), the outliers. With
 *  one, only the highlighted outliers, plus the highlighted marks' own
 *  outliers (2 per side per axis: up to 8), so a small highlight is always
 *  named in full. */
export function labelIndices(points: readonly XY[], slots: readonly number[] | null): number[] {
  const outliers = outlierIndices(points, 4);
  if (!slots || !slots.some((s) => s >= 0)) return outliers;
  const hl = points.map((_, i) => i).filter((i) => slots[i] >= 0);
  const own = outlierIndices(hl.map((i) => points[i]), 2).map((j) => hl[j]);
  return [...new Set([...outliers.filter((i) => slots[i] >= 0), ...own])];
}

export type Box = { w: number; h: number };
export type Bounds = { l: number; t: number; r: number; b: number };
export type Placed = { x: number; y: number; leader: boolean };

/** Right first (the reading side), then left, the diagonals, above, below. */
const DIRS: readonly [number, number][] = [
  [1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1], [0, 1],
];
/** How far past its own spot a label may be pushed, in CSS px. */
const RINGS = [0, 12, 24, 38, 54, 72];

/**
 * Greedy label placement: each candidate (a mark at x, y; its label `boxes[i]`
 * wide and tall), in order, takes the first spot around its mark that stays
 * inside `bounds` and clear of every label placed before it. Spots sit `pad`
 * px off the mark in 8 directions, then the same directions pushed further
 * out; a label pushed off its own spot is `leader: true` (draw a line back to
 * its mark). A label with no free spot is null: left off, never overlapped.
 * Returns each box's top-left corner.
 * ponytail: labels avoid labels and the edge, not other marks; a crowded
 * core can still hide a mark under a name (the halo keeps the name legible).
 */
export function placeLabels(candidates: readonly XY[], boxes: readonly Box[], bounds: Bounds, pad = 6): (Placed | null)[] {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) =>
    x >= bounds.l &&
    y >= bounds.t &&
    x + w <= bounds.r &&
    y + h <= bounds.b &&
    placed.every((p) => x + w <= p.x || p.x + p.w <= x || y + h <= p.y || p.y + p.h <= y);
  return candidates.map((c, i) => {
    const { w, h } = boxes[i];
    for (const ring of RINGS) {
      const off = pad + ring;
      for (const [dx, dy] of DIRS) {
        const x = dx > 0 ? c.x + off : dx < 0 ? c.x - off - w : c.x - w / 2;
        const y = dy > 0 ? c.y + off : dy < 0 ? c.y - off - h : c.y - h / 2;
        if (free(x, y, w, h)) {
          placed.push({ x, y, w, h });
          return { x, y, leader: ring > 0 };
        }
      }
    }
    return null;
  });
}
