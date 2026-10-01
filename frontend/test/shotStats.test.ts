import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  butterfly, byDistance, COURT_ZONES, courtZones, DIST_STEP, distBin, kernelSmooth, RINK_ZONES, rinkZoneOf, rinkZones, SMOOTH_SIGMA, smoothBins, zoneOf, zoneStats,
} from '../lib/platform/viz/shotStats.ts';
import { binSlot, HEX_RADIUS, hexbin, hexSize, type HexBin } from '../lib/platform/viz/hexbin.ts';
import { COURT, COURTS, normalizeShot, RINK, RINK_GOAL_Y, type Shot } from '../lib/platform/viz/surfaces.ts';

const shot = (x: number, y: number, made = false, xg?: number): Shot => ({ x, y, made, dist: Math.hypot(x, y), ...(xg === undefined ? {} : { xg }) });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

/** One real game per source (test/fixtures/shots/README.md), normalized. */
const fixture = (name: string, source: 'nba_stats' | 'nhl'): Shot[] =>
  (JSON.parse(readFileSync(new URL(`./fixtures/shots/${name}.json`, import.meta.url), 'utf8')).data as Record<string, unknown>[]).flatMap((r) => normalizeShot(source, r) ?? []);

/** A deterministic uniform fill (an LCG), as test/hexbin.test.ts. */
function uniform(n: number, x0: number, x1: number, y0: number, y1: number): Shot[] {
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => shot(x0 + (x1 - x0) * rnd(), y0 + (y1 - y0) * rnd(), rnd() < 0.45));
}
const w2 = COURT.width / 2;
const COURT_BOX = [-w2, w2, -COURT.hoop, COURT.half - COURT.hoop] as const;

test('kernelSmooth: two bins give the attempt-weighted Gaussian average; a lone bin is its own rate; no weight in reach reads 0', () => {
  const values = [0.5, 0.25];
  const weights = [10, 30];
  const sigma = 0.9;
  const k = Math.exp(-1 / (2 * sigma * sigma)); // the neighbour one bin away
  const out = kernelSmooth(values, weights, sigma);
  near(out[0], (10 * 0.5 + k * 30 * 0.25) / (10 + k * 30));
  near(out[1], (k * 10 * 0.5 + 30 * 0.25) / (k * 10 + 30));
  // a wide kernel is the plain attempt-weighted mean: (10 × 0.5 + 30 × 0.25) / 40
  near(kernelSmooth(values, weights, 1e6)[0], 0.3125, 1e-6);
  near(kernelSmooth(values, null, 1e6)[0], 0.375, 1e-6, );
  assert.deepEqual(kernelSmooth([0.42], [7], sigma), [0.42]);
  // an empty bin takes its neighbours' rate (weight 0 of its own); past 3σ of any attempt it reads 0
  const gap = kernelSmooth([0.6, 0, 0.6], [5, 0, 5], sigma);
  near(gap[1], 0.6);
  assert.equal(kernelSmooth([0.6, 0, 0, 0, 0, 0], [5, 0, 0, 0, 0, 0], sigma)[5], 0);
  assert.deepEqual(kernelSmooth([], [], sigma), []);
});

test('smoothBins: two neighbouring bins become their attempt-weighted average; a lone bin keeps its rate; centres, counts, sizes unchanged', () => {
  const r = HEX_RADIUS.court;
  const [a, b] = hexbin([...Array.from({ length: 10 }, (_, i) => shot(0, 0, i < 5)), ...Array.from({ length: 30 }, (_, i) => shot(r * Math.sqrt(3), 0, i < 6))], r);
  assert.deepEqual([a.n, a.made, b.n, b.made], [10, 5, 30, 6], 'the setup: 50% of 10 next to 20% of 30');
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const k = Math.exp(-(d * d) / (2 * 3 * 3));
  const [sa, sb] = smoothBins([a, b], 3);
  near(sa.made / sa.n, (5 + k * 6) / (10 + k * 30));
  near(sb.made / sb.n, (k * 5 + 6) / (k * 10 + 30));
  assert.ok(sa.made / sa.n < 0.5 && sa.made / sa.n > 0.2 && sb.made / sb.n > 0.2 && sb.made / sb.n < 0.5, 'both pulled toward each other');
  assert.deepEqual([sa.cx, sa.cy, sa.n, sa.sumDist, sb.cx, sb.cy, sb.n, sb.sumDist], [a.cx, a.cy, a.n, a.sumDist, b.cx, b.cy, b.n, b.sumDist]);
  assert.equal(hexSize(sa.n, 30), hexSize(a.n, 30), 'the mark size is the bin\'s own volume');
  // a lone bin: its own rate (and xG)
  const lone: HexBin = { cx: 0, cy: 0, n: 7, made: 3, sumDist: 10, sumXg: 0.9 };
  assert.deepEqual(smoothBins([lone], 3), [lone]);
  // a lone shot stays a lone shot (n = 1 → a dot), now coloured by its neighbourhood
  const dot = smoothBins([lone, { cx: r * Math.sqrt(3), cy: 0, n: 1, made: 0, sumDist: 3, sumXg: 0 }], 3)[1];
  assert.equal(dot.n, 1);
  assert.ok(dot.made > 0 && dot.made < 1, `a miss among makes reads ${dot.made}`);
  // beyond 3σ nothing reaches: two bins 10 ft apart at σ 3 stay themselves
  const far = smoothBins([lone, { cx: 10, cy: 0, n: 4, made: 4, sumDist: 40, sumXg: 0 }], 3);
  assert.deepEqual(far[0], lone);
  assert.deepEqual(smoothBins([], 3), []);
});

test('smoothed ≠ raw on a real game: the nba_stats fixture\'s bins change colour, and its goals − xG on the NHL fixture', () => {
  const shots = fixture('nba_stats-0022500013', 'nba_stats');
  const raw = hexbin(shots, HEX_RADIUS.court);
  const smooth = smoothBins(raw, SMOOTH_SIGMA.court);
  assert.ok(raw.length > 40, `${raw.length} bins`);
  const changed = raw.filter((b, i) => Math.abs(b.made / b.n - smooth[i].made / smooth[i].n) > 1e-9).length;
  assert.ok(changed > raw.length / 2, `only ${changed} of ${raw.length} bins moved`);
  const recoloured = raw.filter((b, i) => binSlot(b, 'FG') !== binSlot(smooth[i], 'FG')).length;
  assert.ok(recoloured > 0, 'no bin changed its sequential slot');
  near(smooth.reduce((s, b) => s + b.n, 0), shots.length);
  const nhl = hexbin(fixture('nhl-2025020001', 'nhl'), HEX_RADIUS.rink);
  const nhlSmooth = smoothBins(nhl, SMOOTH_SIGMA.rink);
  assert.ok(nhl.some((b, i) => Math.abs(b.sumXg - nhlSmooth[i].sumXg) > 1e-9), 'xG is smoothed with the goals');
});

test('every mode stays under 300 marks on 50,000 uniform points: raw and smoothed share one lattice, zones are 5', () => {
  const shots = uniform(50_000, ...COURT_BOX);
  const raw = hexbin(shots, HEX_RADIUS.court);
  const smooth = smoothBins(raw, SMOOTH_SIGMA.court);
  const zones = zoneStats(shots, { kind: 'court', court: 'nba' });
  assert.ok(raw.length <= 300 && raw.length >= 250, `raw ${raw.length}`);
  assert.equal(smooth.length, raw.length);
  assert.deepEqual(smooth.map((b) => `${b.cx},${b.cy},${b.n}`), raw.map((b) => `${b.cx},${b.cy},${b.n}`));
  assert.equal(zones.length, 5);
  assert.equal(zones.reduce((s, z) => s + z.n, 0), 50_000, 'every shot is in exactly one zone');
  assert.ok(zones.every((z) => z.n > 0));
  const r2 = RINK.width / 2;
  const rink = uniform(50_000, -r2, r2, -RINK.goalLine, RINK_GOAL_Y);
  const rinkZ = zoneStats(rink, { kind: 'rink' });
  assert.equal(rinkZ.length, 4);
  assert.equal(rinkZ.reduce((s, z) => s + z.n, 0), 50_000);
  assert.equal(smoothBins(hexbin(rink, HEX_RADIUS.rink), SMOOTH_SIGMA.rink).length, hexbin(rink, HEX_RADIUS.rink).length);
  console.log(`marks: raw ${raw.length}, smoothed ${smooth.length}, zones ${zones.length} (rink ${rinkZ.length})`);
});

test('zoneOf (NBA): (0, 2) restricted; (−22, 3) corner 3; (0, 25) above the break; the paint, mid-range and the boundaries', () => {
  const nba = COURTS.nba;
  assert.equal(zoneOf(0, 2, nba), 'restricted');
  assert.equal(zoneOf(-22, 3, nba), 'corner3');
  assert.equal(zoneOf(0, 25, nba), 'atb3');
  assert.equal(zoneOf(0, 8, nba), 'paint');
  assert.equal(zoneOf(-7.9, 13.75, nba), 'paint', 'the lane\'s far corner at the FT line');
  assert.equal(zoneOf(-8.1, 13, nba), 'mid', 'just outside the lane');
  assert.equal(zoneOf(0, 13.8, nba), 'mid', 'just past the FT line');
  assert.equal(zoneOf(0, 18, nba), 'mid');
  assert.equal(zoneOf(0, 23.75, nba), 'atb3', 'ON the arc is a three');
  assert.equal(zoneOf(0, 23.7, nba), 'mid');
  assert.equal(zoneOf(0, 3.99, nba), 'restricted');
  assert.equal(zoneOf(0, 4, nba), 'paint', 'ON the restricted arc is the paint');
  assert.equal(zoneOf(0, -3, nba), 'restricted', 'behind the backboard, within 4 ft');
  assert.equal(zoneOf(-21.9, 3, nba), 'mid', 'inside the corner line');
  assert.equal(zoneOf(-24, -5, nba), 'corner3', 'the baseline corner');
  assert.equal(zoneOf(-22.5, 9, nba), 'atb3', 'above where the corner line meets the arc (8.95 ft): past the arc');
  assert.equal(zoneOf(-23, 8.9, nba), 'corner3');
  // the WNBA / college corner is shorter; the college lane narrower
  assert.equal(zoneOf(-21.7, 3, COURTS.mbb), 'corner3');
  assert.equal(zoneOf(-21.7, 3, COURTS.nba), 'mid');
  assert.equal(zoneOf(-7, 8, COURTS.mbb), 'mid');
  assert.equal(zoneOf(-7, 8, COURTS.nba), 'paint');
  // every court zone is reachable on the court, and the uniform fill hits each
  const hit = new Set(uniform(5_000, ...COURT_BOX).map((s) => zoneOf(s.x, s.y, nba)));
  assert.deepEqual([...hit].sort(), [...COURT_ZONES].sort());
});

test('rinkZoneOf: the slot, high slot, point and perimeter from the rink\'s lines', () => {
  assert.equal(rinkZoneOf(0, 10), 'slot');
  assert.equal(rinkZoneOf(-22, 20), 'slot', 'the dots are the slot\'s corners');
  assert.equal(rinkZoneOf(0, 0), 'slot', 'the goal line');
  assert.equal(rinkZoneOf(0, 20.1), 'highSlot');
  assert.equal(rinkZoneOf(0, 35), 'highSlot', 'the circle tops');
  assert.equal(rinkZoneOf(0, 35.1), 'point');
  assert.equal(rinkZoneOf(-40, 60), 'point', 'the top of the zone, any width');
  assert.equal(rinkZoneOf(0, 80), 'point', 'the neutral zone reads with the point');
  assert.equal(rinkZoneOf(-35, 10), 'perimeter', 'the wing');
  assert.equal(rinkZoneOf(-22.1, 10), 'perimeter');
  assert.equal(rinkZoneOf(0, -5), 'perimeter', 'behind the goal line');
  const hit = new Set(uniform(5_000, -RINK.width / 2, RINK.width / 2, -RINK.goalLine, RINK_GOAL_Y).map((s) => rinkZoneOf(s.x, s.y)));
  assert.deepEqual([...hit].sort(), [...RINK_ZONES].sort());
});

test('zoneStats: the fixture\'s shots land in every court zone, in draw order (outermost first), each with a fill path and an anchor', () => {
  const shots = fixture('nba_stats-0022500013', 'nba_stats');
  const zones = zoneStats(shots, { kind: 'court', court: 'nba' });
  assert.deepEqual(zones.map((z) => z.zone), ['atb3', 'corner3', 'mid', 'paint', 'restricted']);
  assert.equal(zones.reduce((s, z) => s + z.n, 0), shots.length);
  assert.ok(zones.every((z) => z.n > 0 && z.path.startsWith('M ') && Number.isFinite(z.cx) && Number.isFinite(z.cy)));
  const ra = zones.find((z) => z.zone === 'restricted')!;
  assert.ok(ra.made / ra.n > 0.5 && ra.sumDist / ra.n < 4, `restricted: ${ra.made}/${ra.n} at ${ra.sumDist / ra.n} ft`);
  assert.ok(zones.find((z) => z.zone === 'atb3')!.sumDist / zones.find((z) => z.zone === 'atb3')!.n > 23.75);
  // the shapes: the evenodd holes are the enclosed zones, so a court's fills are 5 non-overlapping regions
  assert.equal(courtZones('nba').length, 5);
  assert.equal(courtZones('nba').find((z) => z.zone === 'corner3')!.rotate, true);
  assert.equal(rinkZones().length, 4);
  assert.deepEqual(zoneStats([], { kind: 'rink' }).map((z) => [z.zone, z.n]), [['perimeter', 0], ['point', 0], ['highSlot', 0], ['slot', 0]]);
  // an empty zone colours null (no NaN slot)
  assert.equal(binSlot(zoneStats([], { kind: 'rink' })[0], 'goals'), null);
});

test('byDistance: 1 ft bins from 0 to the farthest shot whose attempts sum to the shot count; lo inclusive; 2 ft bins', () => {
  const rows = byDistance([shot(0, 0, true), shot(3, 4), shot(0, 5, true), shot(24, 0), shot(0, 2.5)], 1);
  assert.equal(rows.length, 25, '0..24 ft, empty bins kept');
  assert.deepEqual(rows.map((r) => r.lo), Array.from({ length: 25 }, (_, i) => i));
  assert.equal(rows.reduce((s, r) => s + r.n, 0), 5);
  assert.deepEqual([rows[5].n, rows[5].made], [2, 1], 'exactly 5 ft is the [5, 6) bin, with (3, 4)');
  assert.deepEqual([rows[2].n, rows[24].n, rows[0].n, rows[0].made], [1, 1, 1, 1]);
  assert.deepEqual(byDistance([], 1), []);
  const two = byDistance([shot(0, 1), shot(0, 3), shot(0, 99)], 2);
  assert.equal(two.length, 50);
  assert.deepEqual([two[0].n, two[1].n, two[49].n], [1, 1, 1]);
  // the fixture: every shot counted; the rim bin holds the (0, 0) rows, and a three-point bin is the busiest
  const shots = fixture('nba_stats-0022500013', 'nba_stats');
  const real = byDistance(shots, DIST_STEP.court);
  assert.equal(real.reduce((s, r) => s + r.n, 0), shots.length);
  assert.ok(real[0].n >= 5, `${real[0].n} shots in the rim bin`);
  assert.ok(real.reduce((m, r) => (r.n > m.n ? r : m)).lo >= 22);
  assert.ok(real.length <= 50, `${real.length} bins on a half court`);
});

test('butterfly: [(−5, 5), (5, 5), (6, 6)] splits left 1 / right 2; x = 0 is right; left + right = every shot', () => {
  const rows = butterfly([shot(-5, 5), shot(5, 5), shot(6, 6)], 1);
  const left = rows.reduce((s, r) => s + r.left.n, 0);
  const right = rows.reduce((s, r) => s + r.right.n, 0);
  assert.deepEqual([left, right], [1, 2]);
  assert.deepEqual([rows[7].left.n, rows[7].right.n, rows[8].right.n], [1, 1, 1], '(±5, 5) are 7.07 ft, (6, 6) is 8.49');
  const centre = butterfly([shot(0, 0, true), shot(0, 10)], 1);
  assert.deepEqual([centre[0].right.n, centre[0].right.made, centre[10].right.n, centre.reduce((s, r) => s + r.left.n, 0)], [1, 1, 1, 0]);
  const shots = fixture('nba_stats-0022500013', 'nba_stats');
  const real = butterfly(shots, 1);
  const l = real.reduce((s, r) => s + r.left.n, 0);
  const r = real.reduce((s, r) => s + r.right.n, 0);
  assert.equal(l + r, shots.length, `${l} + ${r} ≠ ${shots.length}`);
  assert.ok(shots.some((s) => s.x === 0) && l > 0 && r > 0, 'the fixture has centre-line shots and both sides');
  // the sides of a bin are the bin
  const dist = byDistance(shots, 1);
  assert.deepEqual(real.map((x) => x.left.n + x.right.n), dist.map((d) => d.n));
  assert.deepEqual(real.map((x) => x.left.made + x.right.made), dist.map((d) => d.made));
  assert.deepEqual(butterfly([], 1), []);
});

test('distBin: a bin\'s mean distance floors to its companion bin', () => {
  assert.equal(distBin({ n: 4, made: 1, sumDist: 97.6, sumXg: 0 }, 1), 24);
  assert.equal(distBin({ n: 4, made: 1, sumDist: 97.6, sumXg: 0 }, 2), 24);
  assert.equal(distBin({ n: 4, made: 1, sumDist: 100, sumXg: 0 }, 2), 24);
  assert.equal(distBin({ n: 1, made: 1, sumDist: 0, sumXg: 0 }, 1), 0);
});
