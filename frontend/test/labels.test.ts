import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelIndices, outlierIndices, placeLabels, type Bounds } from '../lib/platform/viz/labels.ts';

const PAD = 6;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Chebyshev gap from a mark to its label box: PAD at the label's own spot, more once pushed. */
const gap = (c: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(Math.max(b.x - c.x, c.x - (b.x + b.w), 0), Math.max(b.y - c.y, c.y - (b.y + b.h), 0));

test('placeLabels: 8 overlapping boxes come back apart, inside the plot, every pushed label with a leader', () => {
  const bounds: Bounds = { l: 0, t: 0, r: 400, b: 300 };
  // 8 marks within 4 px of each other: at their own spot, every label would sit on the others
  const marks = Array.from({ length: 8 }, (_, i) => ({ x: 200 + (i % 3), y: 150 + (i % 4) }));
  const boxes = marks.map((_, i) => ({ w: 60 + i * 4, h: 12 }));
  const naive = marks.map((m, i) => ({ x: m.x + PAD, y: m.y - 6, ...boxes[i] }));
  assert.ok(naive.some((a, i) => naive.some((b, j) => i !== j && overlap(a, b))), 'the fixture overlaps');
  const out = placeLabels(marks, boxes, bounds, PAD);
  assert.equal(out.length, 8);
  const placed = out.map((p, i) => {
    assert.ok(p, `label ${i} was placed`);
    return { ...p, ...boxes[i] };
  });
  for (const [i, a] of placed.entries()) {
    assert.ok(a.x >= bounds.l && a.y >= bounds.t && a.x + a.w <= bounds.r && a.y + a.h <= bounds.b, `label ${i} inside`);
    for (const [j, b] of placed.entries()) if (i < j) assert.ok(!overlap(a, b), `labels ${i} and ${j} overlap`);
    // moved off its own spot <=> leader line
    assert.equal(a.leader, gap(marks[i], a) > PAD, `label ${i}: gap ${gap(marks[i], a)}, leader ${a.leader}`);
  }
  assert.equal(placed[0].leader, false); // the first label takes its own spot, right of the mark
  assert.deepEqual([placed[0].x, placed[0].y], [200 + PAD, 150 - 6]);
  assert.ok(placed.filter((p) => p.leader).length >= 1, 'a crowd of 8 pushes some labels out');
});

test('placeLabels: the plot edge flips a label left, and a label with no room is left off', () => {
  const bounds: Bounds = { l: 0, t: 0, r: 100, b: 100 };
  const [p] = placeLabels([{ x: 95, y: 50 }], [{ w: 40, h: 10 }], bounds, PAD);
  assert.deepEqual(p, { x: 95 - PAD - 40, y: 45, leader: false });
  assert.deepEqual(placeLabels([{ x: 50, y: 50 }], [{ w: 140, h: 10 }], bounds, PAD), [null]);
  // a full plot: the second label cannot go anywhere the first does not already cover
  const tight: Bounds = { l: 0, t: 0, r: 60, b: 12 };
  const two = placeLabels([{ x: 0, y: 6 }, { x: 0, y: 6 }], [{ w: 50, h: 12 }, { w: 50, h: 12 }], tight, PAD);
  assert.ok(two[0]);
  assert.equal(two[1], null);
});

test('outlierIndices: top and bottom k on each axis, most extreme first, de-duplicated', () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: (i * 7) % 20 }));
  const out = outlierIndices(pts, 4);
  assert.equal(new Set(out).size, out.length);
  const want = new Set([19, 18, 17, 16, 0, 1, 2, 3]); // x extremes
  for (const i of pts.map((_, i) => i).sort((a, b) => pts[b].y - pts[a].y).slice(0, 4)) want.add(i);
  for (const i of pts.map((_, i) => i).sort((a, b) => pts[a].y - pts[b].y).slice(0, 4)) want.add(i);
  assert.deepEqual(new Set(out), want);
  assert.ok(out.length <= 16);
  assert.deepEqual(out.slice(0, 2), [19, 0]); // rank 0: top x, bottom x first
  assert.deepEqual(outlierIndices([{ x: 1, y: 1 }], 4), [0]);
  assert.deepEqual(outlierIndices([], 4), []);
});

test('labelIndices: outliers alone, or with a highlight only highlighted marks (their outliers + up to 8 own)', () => {
  const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: -i }));
  assert.deepEqual(labelIndices(pts, null), outlierIndices(pts, 4));
  // a highlight with no highlighted mark (none in view) names nothing, never the faded rest
  assert.deepEqual(labelIndices(pts, pts.map(() => -1)), []);
  // a 3-mark highlight: all three named, nothing else
  const three = pts.map((_, i) => ([5, 12, 29].includes(i) ? 0 : -1));
  assert.deepEqual(new Set(labelIndices(pts, three)), new Set([5, 12, 29]));
  // a 20-mark highlight holding one global outlier (29): that one plus its own extremes, at most 1 + 8
  const twenty = pts.map((_, i) => (i >= 10 ? 1 : -1));
  const got = labelIndices(pts, twenty);
  assert.ok(got.every((i) => twenty[i] >= 0), 'only highlighted marks');
  assert.ok(got.includes(29) && got.includes(10));
  assert.ok(got.length <= 12, `${got.length} labels`);
});

test('labelIndices: a highlight clear of every outlier names only its own extremes, 2 per side per axis (8 at most)', () => {
  // 10 low marks, 10 highlighted mid marks with shuffled y, 10 high marks: the global
  // outliers are all low or high, so the highlight is named by its own extremes alone
  const pts = Array.from({ length: 30 }, (_, i) =>
    i < 10 ? { x: -100 + i, y: -100 - i } : i < 20 ? { x: i, y: (i * 3) % 10 } : { x: 100 + i, y: 100 + i }
  );
  const slots = pts.map((_, i) => (i >= 10 && i < 20 ? 2 : -1));
  // top x 19, 18; bottom x 10, 11; top y 13 (9), 16 (8); bottom y 10 (0), 17 (1)
  assert.deepEqual(new Set(labelIndices(pts, slots)), new Set([19, 18, 10, 11, 13, 16, 17]));
});

test('labelIndices: a highlight of 8 or fewer is named in full, the middle marks too', () => {
  // the reviewer's five.ts: 100 far-out context marks, 5 highlighted in the middle (102 is middle on both axes)
  const pts = [
    ...Array.from({ length: 100 }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (100 + i), y: (i % 3 ? 1 : -1) * (100 + i) })),
    { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 3, y: 2.5 }, { x: 4, y: 5 }, { x: 5, y: 2 },
  ];
  const slots = pts.map((_, i) => (i >= 100 ? 0 : -1));
  assert.deepEqual([...labelIndices(pts, slots)].sort((a, b) => a - b), [100, 101, 102, 103, 104]);
  // 9 highlighted in the middle: back to the highlight's own extremes (2 per side per axis), at most 8
  const nine = [...pts.slice(0, 100), ...Array.from({ length: 9 }, (_, i) => ({ x: i, y: (i * 4) % 9 }))];
  const got = labelIndices(nine, nine.map((_, i) => (i >= 100 ? 1 : -1)));
  assert.ok(got.length <= 8 && got.length >= 4 && got.every((i) => i >= 100), `${got}`);
});

test('outlierIndices: the one-pass top-k matches four full sorts, ties to the lower index', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const bySort = (pts: { x: number; y: number }[], k: number) => {
    const idx = pts.map((_, i) => i);
    const by = (f: (i: number) => number) => [...idx].sort((a, b) => f(a) - f(b) || a - b).slice(0, k);
    const lists = [by((i) => -pts[i].x), by((i) => pts[i].x), by((i) => -pts[i].y), by((i) => pts[i].y)];
    const out = new Set<number>();
    for (let r = 0; r < k; r++) for (const l of lists) if (r < l.length) out.add(l[r]);
    return [...out];
  };
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rnd() * 60);
    // small integer values: plenty of ties
    const pts = Array.from({ length: n }, () => ({ x: Math.floor(rnd() * 7) - 3, y: Math.floor(rnd() * 5) }));
    for (const k of [1, 2, 4]) assert.deepEqual(outlierIndices(pts, k), bySort(pts, k), `trial ${trial}, k ${k}`);
  }
  assert.deepEqual(outlierIndices([{ x: 1, y: 1 }], 0), []);
  // one pass with bounded lists: ~0.6 ms for MBB's 5,015 marks (four full sorts took 13-18 ms; an
  // unbounded list, 500+ ms). It reruns every zoom frame, so a generous ceiling still guards it.
  const big = Array.from({ length: 5015 }, () => ({ x: rnd() * 40 - 20, y: rnd() * 20 - 10 }));
  const t0 = performance.now();
  outlierIndices(big, 4);
  assert.ok(performance.now() - t0 < 100, `outlierIndices on 5,015 marks took ${(performance.now() - t0).toFixed(1)} ms`);
});

test('placeLabels never puts a label on an obstacle (the marks a name must not cover)', () => {
  const bounds: Bounds = { l: 0, t: 0, r: 400, b: 300 };
  // 8 marks in a tight cluster, each also an obstacle, plus a ring of other obstacle dots around them
  const marks = Array.from({ length: 8 }, (_, i) => ({ x: 200 + (i % 3) * 9, y: 150 + (i % 4) * 7 }));
  const ring = Array.from({ length: 16 }, (_, i) => ({ x: 214 + 30 * Math.cos(i / 2.5), y: 160 + 22 * Math.sin(i / 2.5) }));
  const dot = (p: { x: number; y: number }) => ({ x: p.x - 5, y: p.y - 5, w: 10, h: 10 });
  const obstacles = [...marks, ...ring].map(dot);
  const boxes = marks.map((_, i) => ({ w: 58 + i * 5, h: 15 }));
  const plain = placeLabels(marks, boxes, bounds, 7);
  const hitsObstacle = (out: typeof plain) =>
    out.some((p, i) => p && obstacles.some((o) => overlap({ ...p, ...boxes[i] }, o)));
  assert.ok(hitsObstacle(plain), 'without obstacles, some label lands on a mark');
  const out = placeLabels(marks, boxes, bounds, 7, obstacles);
  assert.equal(hitsObstacle(out), false);
  assert.ok(out.filter(Boolean).length >= 6, `${out.filter(Boolean).length} of 8 placed`);
  for (const [i, p] of out.entries()) if (p) assert.equal(p.leader, gap(marks[i], { ...p, ...boxes[i] }) > 7);
});
