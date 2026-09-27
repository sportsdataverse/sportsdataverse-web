import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveTint,
  cellTint,
  gridShade,
  nextTint,
  pctScale,
  pctSiblings,
  pctSources,
  pctTint,
  percentileClass,
  type Domain,
} from '../lib/platform/scales.ts';

// Column names from cfb.passing / nfl.rushing (sdv-db schema snapshot 2026-09-16).
const COLS = ['athlete_id', 'EPAplay', 'EPAplay_rank', 'EPAplay_pct', 'fumbles', 'fumbles_pct', 'fg_pct'];

test('a _pct column is a producer percentile only when its base column is present', () => {
  const m = pctSiblings(COLS);
  assert.equal(m.get(1), 3); // EPAplay ← EPAplay_pct
  assert.equal(m.get(3), 3); // the percentile column tints itself
  assert.equal(m.get(4), 5); // fumbles ← fumbles_pct
  assert.equal(m.has(6), false); // fg_pct is a plain rate: no `fg` column
  assert.equal(m.has(0), false);
});

test('the percentile scale is read per column, not per value', () => {
  // Producer _pct is 0–100 (Weibull); the worst of 150 qualifiers is 0.66.
  assert.equal(pctScale(['0.66', '50', '99.3']), 100);
  assert.equal(pctScale(['0.12', '0.5', null, '0.97']), 1); // a 0–1 producer
});

test('pct tint is diverging around the 50th percentile and never re-applies polarity', () => {
  const good = pctTint('95', 100);
  const bad = pctTint('0.66', 100); // worst qualifier, NOT 66th
  assert.match(good ?? '', /--color-primary/);
  assert.match(bad ?? '', /--color-destructive/);
  assert.equal(pctTint('52', 100), undefined); // dead zone around the median
  // fumbles_pct = 95 means "fewest fumbles": the producer's _rank already
  // encodes direction, so it must read as good, not be flipped by polarity().
  assert.match(pctTint('95', 100) ?? '', /--color-primary/);
  assert.equal(pctTint(null, 100), undefined); // null stays null
  assert.equal(pctTint('', 100), undefined);
  assert.match(pctTint('0.95', 1) ?? '', /--color-primary/);
});

test('percentileClass honours the column scale too', () => {
  assert.equal(percentileClass(0.66, 100), 'text-muted-foreground');
  assert.equal(percentileClass(0.95, 1), 'text-score-ink dark:text-score font-semibold');
});

test('h cycles delta → pct → off, skipping pct when the result has no percentiles', () => {
  assert.equal(nextTint('delta', true), 'pct');
  assert.equal(nextTint('pct', true), 'off');
  assert.equal(nextTint('off', true), 'delta');
  assert.equal(nextTint('delta', false), 'off');
});

// The grid's per-cell shading (ResultsGrid), one result with BOTH producer scales.
// Each _pct's scale differs from what its base column's values would suggest.
const GRID_COLS = ['team', 'EPAplay', 'EPAplay_pct', 'sacks', 'sacks_pct', 'fg_pct'];
const GRID_ROWS = [
  ['A', '0.31', '96', '3', '0.95', '0.61'], // EPAplay_pct is 0–100, sacks_pct a 0–1 producer
  ['B', '-0.20', '0.66', '9', '0.05', '0.40'], // 0.66 of 0–100 = the worst EPA qualifier
  ['C', '0.01', null, '5', '0.50', '0.50'],
];

test('pct sources pair X and X_pct with a scale read over the whole _pct column', () => {
  const src = pctSources(GRID_COLS, GRID_ROWS);
  assert.deepEqual(src.get(1), { col: 2, scale: 100 }); // row B alone would read as 0–1
  assert.deepEqual(src.get(2), { col: 2, scale: 100 });
  assert.deepEqual(src.get(3), { col: 4, scale: 1 }); // not the sack counts' scale
  assert.deepEqual(src.get(4), { col: 4, scale: 1 });
  assert.equal(src.has(5), false); // fg_pct is a plain rate
  assert.equal(src.has(0), false);
});

test('pct mode shades X by its X_pct, on that column scale; null _pct stays unshaded', () => {
  const src = pctSources(GRID_COLS, GRID_ROWS);
  const shade = (row: number, ci: number) => gridShade('pct', GRID_ROWS[row], ci, null, src.get(ci));
  assert.match(shade(0, 1) ?? '', /--color-primary/);
  assert.equal(shade(0, 1), shade(0, 2)); // EPAplay and EPAplay_pct share a shade
  assert.match(shade(1, 1) ?? '', /--color-destructive/); // 0.66 of 0–100 = worst, not 66th
  assert.match(shade(0, 3) ?? '', /--color-primary/); // 0.95 of 0–1 = 95th, not ~1st
  assert.equal(shade(0, 3), shade(0, 4));
  assert.equal(shade(2, 1), undefined); // null percentile: no guess from EPAplay itself
  assert.equal(shade(0, 5), undefined); // fg_pct: no source, no shade
});

test('delta shades by the column domain alone; off shades nothing', () => {
  const domain: Domain = { min: -1, max: 1, base: 0, signed: true, polarity: 1 };
  const row = ['0.9', '5'];
  const pct = { col: 1, scale: 100 as const }; // 5th percentile: would read red
  assert.equal(gridShade('delta', row, 0, domain, pct), cellTint('0.9', domain));
  assert.match(gridShade('delta', row, 0, domain, pct) ?? '', /--color-primary/);
  assert.equal(gridShade('delta', row, 0, null, pct), undefined);
  assert.match(gridShade('pct', row, 0, domain, pct) ?? '', /--color-destructive/);
  assert.equal(gridShade('pct', row, 0, domain, undefined), undefined);
  assert.equal(gridShade('off', row, 0, domain, pct), undefined);
});

test('percentile mode with no percentile columns draws heat, and keeps the intent otherwise', () => {
  assert.equal(effectiveTint('pct', false), 'delta');
  assert.equal(effectiveTint('pct', true), 'pct');
  assert.equal(effectiveTint('off', false), 'off');
  assert.equal(effectiveTint('delta', true), 'delta');
});
