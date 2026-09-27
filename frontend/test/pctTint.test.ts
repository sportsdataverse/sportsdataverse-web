import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTint, pctScale, pctSiblings, pctTint, percentileClass } from '../lib/platform/scales.ts';

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
