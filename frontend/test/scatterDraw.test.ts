import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawScatter,
  drawScatterExport,
  EXPORT_BOX,
  EXPORT_PLOT,
  PAD,
  scatterDomain,
  scatterGeo,
  type ScatterColors,
  type ScatterScene,
} from '../lib/platform/viz/scatterDraw.ts';
import { labelIndices } from '../lib/platform/viz/labels.ts';
import type { ScatterPoint, ZoomView } from '../lib/platform/viz/scatterMath.ts';

/** A 2D context that records every call with the paint it was made in. */
function recorder() {
  const calls: { op: string; args: unknown[]; paint: string }[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: '', globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
      return (...args: unknown[]) => calls.push({ op: String(k), args, paint: `${String(t.fillStyle)}@${t.globalAlpha}` });
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  /** Marks filled, by paint (colour @ alpha): only marks are filled, never text. */
  const marks = () => {
    const by: Record<string, number> = {};
    for (const c of calls) if (c.op === 'fill') by[c.paint] = (by[c.paint] ?? 0) + 1;
    return by;
  };
  return { ctx, calls, marks };
}

const COLORS: ScatterColors = {
  mark: 'mark',
  surface: 'surface',
  grid: 'grid',
  axis: 'axis',
  ink: 'ink',
  median: 'median',
  hl: ['hl0', 'hl1', 'hl2'],
};
// 12 × 10 grid, x and y 0..11 / 0..9; column 0 is BOS.
const POINTS: ScatterPoint[] = Array.from({ length: 120 }, (_, i) => ({
  label: `P${i}`,
  team: i % 12 === 0 ? 'BOS' : 'LAL',
  teamName: '',
  x: i % 12,
  y: Math.floor(i / 12),
}));
const DOMAIN = scatterDomain(POINTS);
const SLOTS = POINTS.map((p) => (p.team === 'BOS' ? 0 : -1));
const scene = (view: ZoomView, slots: number[] | null = null, labels = true): ScatterScene => ({
  points: POINTS,
  slots,
  view,
  labels,
  labelled: labelIndices(POINTS, slots),
  hover: null,
  colors: COLORS,
  font: 'Inter',
});
// A desktop and a phone canvas (the viewer's layout) against the export's fixed plot.
const SCREENS = [
  { W: 718, H: 488 },
  { W: 390, H: 300 },
];
// A zoomed view keeping columns 3..8 and rows 2..6, half a unit clear of
// every edge: a mark near one would fall inside the clip's pixel slack (the
// ring's width) at one size and outside it at another.
const ZOOMED: ZoomView = { k: 2, x: [2.5, 8.5], y: [1.5, 6.5] };

for (const [what, view, slots] of [
  ['base view', DOMAIN.base, null],
  ['BOS highlight', DOMAIN.base, SLOTS],
  ['zoomed 2x with the BOS highlight', ZOOMED, SLOTS],
] as const) {
  test(`drawScatter: the screen and the export draw the same marks in the same paints (${what})`, () => {
    const out = recorder();
    const exp = drawScatterExport(out.ctx, DOMAIN, scene(view, slots && [...slots]), { x: 'x', y: 'y' });
    assert.equal(exp.geo.W, EXPORT_PLOT.w);
    assert.equal(exp.geo.H, EXPORT_PLOT.h);
    assert.ok(exp.marks > 0);
    for (const s of SCREENS) {
      const on = recorder();
      const drawn = drawScatter(on.ctx, scatterGeo(DOMAIN, POINTS.length, s.W, s.H), scene(view, slots && [...slots]));
      assert.equal(drawn.marks, exp.marks, `${s.W}px: ${drawn.marks} marks on screen, ${exp.marks} exported`);
      assert.deepEqual(on.marks(), out.marks());
      // the same marks, not just as many
      assert.deepEqual(
        drawn.at.map((p) => Number.isNaN(p.px)),
        exp.at.map((p) => Number.isNaN(p.px))
      );
    }
  });
}

test('drawScatter: the zoomed view is the one exported (the in-view columns and rows), never the base view', () => {
  const out = recorder();
  const exp = drawScatterExport(out.ctx, DOMAIN, scene(ZOOMED, [...SLOTS]), { x: 'x', y: 'y' });
  const drawn = POINTS.filter((_, i) => !Number.isNaN(exp.at[i].px));
  assert.equal(drawn.length, 6 * 5);
  assert.ok(drawn.every((p) => p.x >= 3 && p.x <= 8 && p.y >= 2 && p.y <= 6));
  // BOS (x = 0) is off the zoomed plot: every drawn mark is faded context.
  assert.deepEqual(out.marks(), { 'axis@0.15': 30 });
  // the view maps to the export's plot box: its centre lands mid-plot
  const mid = POINTS.findIndex((p) => p.x === 5 && p.y === 4);
  const [cx, cy] = [(ZOOMED.x[0] + ZOOMED.x[1]) / 2, (ZOOMED.y[0] + ZOOMED.y[1]) / 2];
  const plotW = EXPORT_PLOT.w - PAD.l - PAD.r;
  const plotH = EXPORT_PLOT.h - PAD.t - PAD.b;
  assert.ok(Math.abs(exp.at[mid].px - (PAD.l + plotW / 2 + ((5 - cx) / (ZOOMED.x[1] - ZOOMED.x[0])) * plotW)) < 1e-9);
  assert.ok(Math.abs(exp.at[mid].py - (PAD.t + plotH / 2 - ((4 - cy) / (ZOOMED.y[1] - ZOOMED.y[0])) * plotH)) < 1e-9);
});

test('drawScatter: the export keeps the Labels toggle and the highlight', () => {
  const on = recorder();
  const off = recorder();
  const a = drawScatterExport(on.ctx, DOMAIN, scene(DOMAIN.base, [...SLOTS], true), { x: 'x', y: 'y' });
  const b = drawScatterExport(off.ctx, DOMAIN, scene(DOMAIN.base, [...SLOTS], false), { x: 'x', y: 'y' });
  assert.ok(a.layout.length > 0 && a.layout.every((l) => POINTS[l.i].team === 'BOS'));
  assert.equal(b.layout.length, 0);
  assert.deepEqual(on.marks(), { 'axis@0.15': 110, 'hl0@1': 10 });
});

test('drawScatterExport: "↑ Y" above the plot and "X →" below it, inside the export box', () => {
  const out = recorder();
  drawScatterExport(out.ctx, DOMAIN, scene(DOMAIN.base), { x: 'o_rapm', y: 'd_rapm' });
  const text = out.calls.filter((c) => c.op === 'fillText').map((c) => c.args);
  const up = text.find((a) => a[0] === '↑ d_rapm');
  const right = text.find((a) => a[0] === 'o_rapm →');
  assert.ok(up && right);
  assert.ok(Number(up[2]) > 0 && Number(up[2]) < EXPORT_BOX.h - EXPORT_PLOT.h);
  assert.ok(Number(right[2]) > EXPORT_PLOT.h && Number(right[2]) <= EXPORT_BOX.h);
  assert.ok(Number(right[1]) <= EXPORT_BOX.w);
});

test('drawScatter: a dense screen (a phone) and a sparse export still draw every mark', () => {
  const many: ScatterPoint[] = Array.from({ length: 600 }, (_, i) => ({ label: `P${i}`, team: '', teamName: '', x: i % 60, y: Math.floor(i / 60) }));
  const d = scatterDomain(many);
  const phone = scatterGeo(d, many.length, 390, 300);
  assert.ok(phone.dense && !scatterGeo(d, many.length, EXPORT_PLOT.w, EXPORT_PLOT.h).dense);
  const s: ScatterScene = { points: many, slots: null, view: d.base, labels: true, labelled: labelIndices(many, null), hover: null, colors: COLORS, font: 'Inter' };
  assert.equal(drawScatter(recorder().ctx, phone, s).marks, many.length);
  assert.equal(drawScatterExport(recorder().ctx, d, s, { x: 'x', y: 'y' }).marks, many.length);
});

// The export must never be tainted: toBlob throws on a canvas that drew a
// cross-origin image. No image is drawn yet (faces, P4 T3, come through the
// same-origin file proxy); this fails if any scene ever draws one from
// another origin.
test('drawScatter: no scene draws an image from another origin (the export canvas stays untainted)', () => {
  const ORIGIN = 'https://sportsdataverse.org';
  const scenes = [scene(DOMAIN.base), scene(DOMAIN.base, [...SLOTS]), scene(ZOOMED, [...SLOTS]), { ...scene(DOMAIN.base), hover: 5 }];
  for (const s of scenes) {
    for (const draw of [
      (ctx: CanvasRenderingContext2D) => drawScatter(ctx, scatterGeo(DOMAIN, POINTS.length, 718, 488), s),
      (ctx: CanvasRenderingContext2D) => drawScatterExport(ctx, DOMAIN, s, { x: 'x', y: 'y' }),
    ]) {
      const r = recorder();
      draw(r.ctx);
      for (const c of r.calls.filter((c) => c.op === 'drawImage')) {
        const src = String((c.args[0] as { src?: string })?.src ?? '');
        assert.equal(new URL(src, ORIGIN).origin, ORIGIN, `drew a cross-origin image: ${src}`);
      }
    }
  }
});
