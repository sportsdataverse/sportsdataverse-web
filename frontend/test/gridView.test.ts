import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridViewParams, parseGridView, gridByIndex, gridByName, queryViewParams, parseQueryView, EMPTY_GRID, type GridView } from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('grid view round-trips sort (by name, - for desc), column filters and tint', () => {
  const v = { sort: { col: 'EPAplay', dir: 'desc' as const }, filters: { team: 'Ohio' }, tint: 'pct' as const };
  const p = new URLSearchParams('schema=cfb');
  gridViewParams(v, p);
  assert.equal(p.toString(), 'schema=cfb&grid.sort=-EPAplay&grid.tint=pct&grid.f.team=Ohio');
  assert.deepEqual(parseGridView(p), v);
});

test('grid defaults are omitted and junk is ignored', () => {
  const p = new URLSearchParams();
  gridViewParams({ sort: null, filters: {}, tint: 'delta' }, p);
  assert.equal(p.toString(), '');
  assert.deepEqual(parseGridView(sp('grid.tint=rainbow&grid.sort=-')), { sort: null, filters: {}, tint: 'delta' });
});

test('names map onto the current columns and back; missing columns drop out', () => {
  const cols = ['athlete_id', 'team', 'EPAplay'];
  const byIdx = gridByIndex({ sort: { col: 'EPAplay', dir: 'asc' }, filters: { team: 'Ohio', gone: 'x' }, tint: 'off' }, cols);
  assert.deepEqual(byIdx, { sort: { col: 2, dir: 'asc' }, filters: { 1: 'Ohio' }, tint: 'off' });
  assert.deepEqual(gridByName(byIdx, cols), { sort: { col: 'EPAplay', dir: 'asc' }, filters: { team: 'Ohio' }, tint: 'off' });
  assert.equal(gridByIndex({ sort: { col: 'gone', dir: 'asc' }, filters: {}, tint: 'delta' }, cols).sort, null);
});

test('a Query URL carries the grid alongside the API request without polluting it', () => {
  const p = queryViewParams({ schema: 'cfb', table: 'passing', filters: [], select: [], order: '', limit: 100 });
  gridViewParams({ sort: { col: 'EPAplay', dir: 'desc' }, filters: {}, tint: 'pct' }, p);
  assert.deepEqual(parseQueryView(p, ['cfb']).filters, []); // grid.* never becomes an API filter
});

test('grid sort column, filter names and filter values are capped at 200 chars', () => {
  const long = 'a'.repeat(50_000);
  const g = parseGridView(sp(`grid.sort=-${long}&grid.f.${long}=${long}&grid.f.team=${long}`));
  assert.deepEqual(g.sort, { col: 'a'.repeat(200), dir: 'desc' });
  assert.deepEqual(g.filters, { ['a'.repeat(200)]: 'a'.repeat(200), team: 'a'.repeat(200) });
});

test('valid views round-trip; empty filters, non-column names and stale column indices drop out', () => {
  const views: GridView[] = [
    { sort: { col: 'clock.displayValue', dir: 'asc' }, filters: { team: 'Ohio State', 'clock.displayValue': '1:00', _x: '-5' }, tint: 'off' },
    { sort: null, filters: { a: 'x&y=z #1' }, tint: 'pct' },
    EMPTY_GRID,
  ];
  for (const v of views) {
    const p = new URLSearchParams();
    gridViewParams(v, p);
    assert.deepEqual(parseGridView(p), v);
  }
  const p = new URLSearchParams();
  gridViewParams({ sort: null, filters: { team: '' }, tint: 'delta' }, p);
  assert.equal(p.toString(), '');
  assert.deepEqual(parseGridView(sp('grid.f.team=&grid.f.x%22y=1&grid.f.1st=1&grid.f.=1')).filters, {});
  assert.deepEqual(gridByName({ sort: { col: 9, dir: 'asc' }, filters: { 9: 'x' }, tint: 'delta' }, ['team']), EMPTY_GRID);
});
