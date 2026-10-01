import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binKey, binSlot, HEX_RADIUS, hexbin, hexPoints, hexSize, nearestBin, onSurface, readoutText, type HexBin } from '../lib/platform/viz/hexbin.ts';
import { COURT, RINK, RINK_GOAL_Y, type Shot } from '../lib/platform/viz/surfaces.ts';

const shot = (x: number, y: number, made = false, xg?: number): Shot => ({ x, y, made, dist: Math.hypot(x, y), ...(xg === undefined ? {} : { xg }) });

test('hexbin puts (0,0), (0.5,0.2) and (10,10) at r = 1.75 into 2 bins, counts 2 and 1', () => {
  const bins = hexbin([shot(0, 0, true), shot(0.5, 0.2), shot(10, 10, true, 0.3)], 1.75);
  assert.equal(bins.length, 2);
  assert.deepEqual(bins.map((b) => b.n), [2, 1]);
  assert.deepEqual(bins[0], { cx: 0, cy: 0, n: 2, made: 1, sumDist: Math.hypot(0.5, 0.2), sumXg: 0 });
  assert.equal(bins[1].made, 1);
  assert.ok(Math.abs(bins[1].sumXg - 0.3) < 1e-12 && Math.abs(bins[1].sumDist - Math.hypot(10, 10)) < 1e-12);
  assert.ok(Math.hypot(bins[1].cx - 10, bins[1].cy - 10) <= 1.75, 'a bin centre is within one radius of its shot');
  assert.deepEqual(hexbin([], 1.75), []);
});

/** A deterministic uniform fill (an LCG), so the count is the same every run. */
function uniform(n: number, x0: number, x1: number, y0: number, y1: number): Shot[] {
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => shot(x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd()));
}
/** Every 0.05 ft of the surface: every cell it can touch, boundary partials included. */
function grid(x0: number, x1: number, y0: number, y1: number): Shot[] {
  const out: Shot[] = [];
  for (let x = x0; x <= x1; x += 0.05) for (let y = y0; y <= y1; y += 0.05) out.push(shot(x, y));
  return out;
}

test('50,000 uniform points over a half court make at most 300 bins at the court radius; the rink too', () => {
  const w2 = COURT.width / 2;
  const court = uniform(50_000, -w2, w2, -COURT.hoop, COURT.half - COURT.hoop);
  const n = hexbin(court, HEX_RADIUS.court).length;
  assert.ok(n <= 300 && n >= 250, `court: ${n} bins`);
  const r2 = RINK.width / 2;
  const rink = uniform(50_000, -r2, r2, -RINK.goalLine, RINK_GOAL_Y);
  const m = hexbin(rink, HEX_RADIUS.rink).length;
  assert.ok(m <= 300 && m >= 250, `rink: ${m} bins`);
  // and exhaustively: every cell either surface can touch
  assert.ok(hexbin(grid(-w2, w2, -COURT.hoop, COURT.half - COURT.hoop), HEX_RADIUS.court).length <= 300);
  assert.ok(hexbin(grid(-r2, r2, -RINK.goalLine, RINK_GOAL_Y), HEX_RADIUS.rink).length <= 300);
});

test('hexPoints is a pointy-top hexagon; hexSize runs 30%–100% by √ of volume with a lone shot at 0', () => {
  const pts = hexPoints(0, 0, 2).split(' ').map((p) => p.split(',').map(Number));
  assert.equal(pts.length, 6);
  assert.ok(pts.every(([x, y]) => Math.abs(Math.hypot(x, y) - 2) < 0.01));
  assert.ok(pts.some(([x, y]) => Math.abs(x) < 0.01 && Math.abs(y - 2) < 0.01), 'a vertex points straight down the y axis');
  assert.equal(hexSize(1, 40), 0);
  assert.ok(Math.abs(hexSize(2, 40) - (0.3 + 0.7 * Math.sqrt(1 / 39))) < 1e-12);
  assert.ok(Math.abs(hexSize(2, 1e9) - 0.3) < 1e-4, 'the floor is 30% of the radius');
  assert.equal(hexSize(40, 40), 1);
  assert.ok(Math.abs(hexSize(11, 41) - (0.3 + 0.7 * 0.5)) < 1e-12);
  assert.equal(hexSize(2, 2), 1);
});

test('binSlot: FG% on the sequential ramp; goals − xG per shot on the diverging ramp; readout text', () => {
  const hoops: HexBin = { cx: 0, cy: 0, n: 23, made: 11, sumDist: 23 * 12.4, sumXg: 0 };
  assert.equal(binSlot(hoops, 'FG'), 'seq-3');
  assert.equal(binSlot({ ...hoops, made: 23 }, 'FG'), 'seq-5');
  assert.equal(binSlot({ ...hoops, made: 0 }, 'FG'), 'seq-1');
  assert.equal(readoutText(hoops, 'FG'), '23 shots · 48% FG · 12 ft');
  const rink: HexBin = { cx: 0, cy: 0, n: 23, made: 3, sumDist: 23 * 31, sumXg: 2.1 };
  assert.equal(binSlot(rink, 'goals'), 'div-pos-1'); // +0.9 / 23 = 0.039
  assert.equal(binSlot({ ...rink, made: 0 }, 'goals'), 'div-neg-2'); // −2.1 / 23 = −0.091
  assert.equal(binSlot({ ...rink, sumXg: 3 }, 'goals'), 'div-mid');
  assert.equal(readoutText(rink, 'goals'), '23 shots · 3 goals · +0.9 vs xG · 31 ft');
  assert.equal(readoutText({ cx: 0, cy: 0, n: 1, made: 1, sumDist: 5, sumXg: 0.4 }, 'goals'), '1 shot · 1 goal · +0.6 vs xG · 5 ft');
  assert.equal(readoutText({ cx: 0, cy: 0, n: 2, made: 0, sumDist: 54, sumXg: 0.04 }, 'goals'), '2 shots · 0 goals · +0.0 vs xG · 27 ft', 'no −0.0');
  assert.equal(readoutText({ cx: 0, cy: 0, n: 2, made: 0, sumDist: 54, sumXg: 0.06 }, 'goals'), '2 shots · 0 goals · −0.1 vs xG · 27 ft');
});

test('onSurface: a point at (0, 60) is off the court; the baseline strip, the corners and the rink halves are pinned', () => {
  assert.equal(onSurface(shot(0, 60), 'court'), false, 'a backcourt heave');
  assert.equal(onSurface(shot(0, 41.75), 'court'), true, 'the centre line');
  assert.equal(onSurface(shot(0, 41.8), 'court'), false);
  assert.equal(onSurface(shot(-25, -5.25), 'court'), true, 'the baseline corner');
  assert.equal(onSurface(shot(25.1, 10), 'court'), false, 'past the sideline');
  assert.equal(onSurface(shot(0, -5.3), 'court'), false, 'behind the baseline');
  assert.equal(onSurface(shot(0, 100), 'rink'), false, 'past centre ice: the drawn half ends at 89');
  assert.equal(onSurface(shot(42.5, 89), 'rink'), true);
  assert.equal(onSurface(shot(0, -11), 'rink'), true, 'the end boards');
  assert.equal(onSurface(shot(0, -11.1), 'rink'), false);
  assert.equal(onSurface(shot(42.6, 10), 'rink'), false);
  // and through the page's path: the heave never reaches a bin
  const kept = [shot(0, 0), shot(0.5, 0.2), shot(0, 60)].filter((s) => onSurface(s, 'court'));
  assert.equal(hexbin(kept, HEX_RADIUS.court).length, 1);
});

test('nearestBin walks to the closest bin inside a 90° cone in that direction; binKey is the lattice centre', () => {
  const at = (cx: number, cy: number): HexBin => ({ cx, cy, n: 1, made: 0, sumDist: 0, sumXg: 0 });
  const o = at(0, 0);
  const bins = [o, at(3, 0), at(6, 0), at(0, 3), at(-3, 0), at(2, 2.5), at(-1, -8)];
  assert.equal(nearestBin(bins, o, [1, 0]), bins[1], 'right');
  assert.equal(nearestBin(bins, o, [0, 1]), bins[3], 'down (+y is down the screen)');
  assert.equal(nearestBin(bins, o, [-1, 0]), bins[4], 'left');
  assert.equal(nearestBin(bins, o, [0, -1]), bins[6], 'up: (-1, -8) is inside the cone');
  assert.equal(nearestBin([o, at(5, 5.1)], o, [1, 0]), null, 'outside the cone (more across than along)');
  assert.equal(nearestBin([o], o, [1, 0]), null);
  assert.equal(binKey(at(1.5, -2)), '1.5,-2');
});
