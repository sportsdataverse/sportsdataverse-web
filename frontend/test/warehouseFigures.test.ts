import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, warehouseFigures } from '../lib/warehouseFigures.ts';

test('formatCount', () => {
  assert.equal(formatCount(123_456_789), '123M+');
  assert.equal(formatCount(1_234_567), '1.2M+');
  assert.equal(formatCount(9_870), '9,870');
});

test('warehouseFigures with a live status, tags, and packages', () => {
  const { tiles, asOf } = warehouseFigures({
    status: { row_estimate: 1.3e8, table_count: 516, collected_at: '2026-09-26T08:00:00Z' },
    releaseTags: ['espn_cfb_pbp', 'nba_stats_shots', 'phf_pbp', 'zzz'],
    packages: 41,
  });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Rows of play-by-play & stats'], '130M+');
  assert.equal(byTitle['Tables in the warehouse'], '516');
  assert.equal(byTitle['Leagues in the warehouse'], '2', 'other and the archived phf are excluded');
  assert.equal(byTitle['Datasets in the catalog'], '4');
  assert.equal(byTitle['Open-source packages'], '41');
  assert.equal(asOf, '2026-09-26');
});

test('a null status renders — for Rows and Tables, and asOf is null (never a stale constant)', () => {
  const { tiles, asOf } = warehouseFigures({
    status: null,
    releaseTags: ['espn_cfb_pbp'],
    packages: 41,
  });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Rows of play-by-play & stats'], '—');
  assert.equal(byTitle['Tables in the warehouse'], '—');
  assert.equal(asOf, null);
});

test('a null release list renders — for Leagues and Datasets', () => {
  const { tiles } = warehouseFigures({ status: null, releaseTags: null, packages: 41 });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Leagues in the warehouse'], '—');
  assert.equal(byTitle['Datasets in the catalog'], '—');
});

test('a null package count renders — for Packages', () => {
  const { tiles } = warehouseFigures({ status: null, releaseTags: null, packages: null });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Open-source packages'], '—');
});
