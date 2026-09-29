import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridViewParams, parseGridView, gridByIndex, gridByName, queryViewParams, parseQueryView, compareCells, EMPTY_GRID, type GridView, type SortDir } from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('grid view round-trips sort (by name, - for desc), column filters and tint', () => {
  const v = { sort: { col: 'EPAplay', dir: 'desc' as const }, filters: { team: 'Ohio' }, tint: 'pct' as const, pin: null };
  const p = new URLSearchParams('schema=cfb');
  gridViewParams(v, p);
  assert.equal(p.toString(), 'schema=cfb&grid.sort=-EPAplay&grid.tint=pct&grid.f.team=Ohio');
  assert.deepEqual(parseGridView(p), v);
});

test('grid defaults are omitted and junk is ignored', () => {
  const p = new URLSearchParams();
  gridViewParams({ sort: null, filters: {}, tint: 'delta', pin: null }, p);
  assert.equal(p.toString(), '');
  assert.deepEqual(parseGridView(sp('grid.tint=rainbow&grid.sort=-&grid.pin=nope')), EMPTY_GRID);
});

test('names map onto the current columns and back; missing columns drop out', () => {
  const cols = ['athlete_id', 'team', 'EPAplay'];
  const pin = { col: 'athlete_id', values: ['7'] };
  const byIdx = gridByIndex({ sort: { col: 'EPAplay', dir: 'asc' }, filters: { team: 'Ohio', gone: 'x' }, tint: 'off', pin }, cols);
  assert.deepEqual(byIdx, { sort: { col: 2, dir: 'asc' }, filters: { 1: 'Ohio' }, tint: 'off', pin }); // pins stay by name and value
  assert.deepEqual(gridByName(byIdx, cols), { sort: { col: 'EPAplay', dir: 'asc' }, filters: { team: 'Ohio' }, tint: 'off', pin });
  assert.equal(gridByIndex({ ...EMPTY_GRID, sort: { col: 'gone', dir: 'asc' } }, cols).sort, null);
});

test('a Query URL carries the grid alongside the API request without polluting it', () => {
  const p = queryViewParams({ schema: 'cfb', table: 'passing', filters: [], select: [], order: '', limit: 100 });
  gridViewParams({ sort: { col: 'EPAplay', dir: 'desc' }, filters: {}, tint: 'pct', pin: { col: 'player_id', values: ['1'] } }, p);
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
    { sort: { col: 'clock.displayValue', dir: 'asc' }, filters: { team: 'Ohio State', 'clock.displayValue': '1:00', _x: '-5' }, tint: 'off', pin: null },
    { sort: null, filters: { a: 'x&y=z #1' }, tint: 'pct', pin: { col: 'team_id', values: ['KC', '2426', 'a.b-c_d'] } },
    EMPTY_GRID,
  ];
  for (const v of views) {
    const p = new URLSearchParams();
    gridViewParams(v, p);
    assert.deepEqual(parseGridView(p), v);
  }
  const p = new URLSearchParams();
  gridViewParams({ sort: null, filters: { team: '' }, tint: 'delta', pin: null }, p);
  assert.equal(p.toString(), '');
  assert.deepEqual(parseGridView(sp('grid.f.team=&grid.f.x%22y=1&grid.f.1st=1&grid.f.=1')).filters, {});
  assert.deepEqual(gridByName({ sort: { col: 9, dir: 'asc' }, filters: { 9: 'x' }, tint: 'delta', pin: null }, ['team']), EMPTY_GRID);
});

/** The cells in the grid's sort order (Array.prototype.sort is stable). */
const sortCells = (cells: (string | null)[], dir: SortDir) => [...cells].sort((a, b) => compareCells(a, b, dir));

test('nulls sort last in both directions (the Data API NULLS LAST); numbers compare numerically', () => {
  const cells = [null, '10', '-2.5', null, '9', '0'];
  assert.deepEqual(sortCells(cells, 'asc'), ['-2.5', '0', '9', '10', null, null]);
  assert.deepEqual(sortCells(cells, 'desc'), ['10', '9', '0', '-2.5', null, null]);
});

test('non-finite numbers sort after the finite ones and before nulls, in both directions', () => {
  const cells = ['NaN', null, '3', 'Infinity', '-Infinity', '1'];
  assert.deepEqual(sortCells(cells, 'asc'), ['1', '3', 'NaN', 'Infinity', '-Infinity', null]);
  assert.deepEqual(sortCells(cells, 'desc'), ['3', '1', 'NaN', 'Infinity', '-Infinity', null]);
});

test('mixed columns: numbers ahead of text, text by localeCompare, a blank sinks with the nulls; the order is transitive', () => {
  const cells = ['b', '10', '1a', null, '2', '', 'A'];
  assert.deepEqual(sortCells(cells, 'asc'), ['2', '10', '1a', 'A', 'b', null, '']);
  assert.deepEqual(sortCells(cells, 'desc'), ['b', 'A', '1a', '10', '2', null, '']);
  // every input order gives the same result, which a non-transitive comparator does not
  for (const perm of [['1a', '2', '10'], ['10', '1a', '2'], ['2', '10', '1a']]) {
    assert.deepEqual(sortCells(perm, 'asc'), ['2', '10', '1a']);
  }
});

test('a numeric column with blanks keeps them last in both directions: a blank is missing, not text', () => {
  const cells = ['3', '', '10', ' ', null, '-1'];
  assert.deepEqual(sortCells(cells, 'desc'), ['10', '3', '-1', '', ' ', null]);
  assert.deepEqual(sortCells(cells, 'asc'), ['-1', '3', '10', '', ' ', null]);
});

test('ties keep their original order in both directions', () => {
  const rows = [['x', '1'], ['y', null], ['z', '1'], ['w', null], ['v', '1.0']];
  for (const dir of ['asc', 'desc'] as const) {
    const ids = [...rows].sort((a, b) => compareCells(a[1], b[1], dir)).map((r) => r[0]);
    assert.deepEqual(ids, ['x', 'z', 'v', 'y', 'w']);
    // a tie is exactly 0 (=== so a -0 counts); V8's sort alone hides a comparator that returns 1 for one
    for (const [a, b] of [['1', '1.0'], [null, null], ['', null], [' ', ''], ['NaN', '-Infinity'], ['x', 'x']]) {
      assert.ok(compareCells(a, b, dir) === 0, `${a} vs ${b} ${dir}`);
    }
  }
});

test('grid.pin round-trips an id column and its values, in pin order', () => {
  const v: GridView = { ...EMPTY_GRID, pin: { col: 'player_id', values: ['4432577', '4361741'] } };
  const p = new URLSearchParams();
  gridViewParams(v, p);
  assert.equal(p.get('grid.pin'), 'player_id:4432577,4361741');
  assert.deepEqual(parseGridView(p), v);
  assert.deepEqual(parseGridView(sp('grid.pin=player_id:4432577,4361741')).pin, v.pin); // unencoded, as typed
  assert.deepEqual(parseGridView(sp('grid.pin=team_id:KC,BUF')).pin, { col: 'team_id', values: ['KC', 'BUF'] });
  const none = new URLSearchParams();
  gridViewParams({ ...EMPTY_GRID, pin: { col: 'player_id', values: [] } }, none);
  assert.equal(none.toString(), ''); // no values, no key
});

test('grid.pin keeps at most 8 values and drops repeats before counting', () => {
  const ids = Array.from({ length: 12 }, (_, i) => String(100 + i));
  assert.deepEqual(parseGridView(sp(`grid.pin=player_id:${ids.join(',')}`)).pin?.values, ids.slice(0, 8));
  const dup = parseGridView(sp('grid.pin=player_id:1,2,1,2,3,1,4,5,6,7,8,9'));
  assert.deepEqual(dup.pin?.values, ['1', '2', '3', '4', '5', '6', '7', '8']);
});

test('a malformed grid.pin is ignored, never thrown on', () => {
  for (const qs of ['grid.pin=', 'grid.pin=player_id', 'grid.pin=player_id:', 'grid.pin=:1,2', 'grid.pin=1st:1', 'grid.pin=x%22y:1', 'grid.pin=player_id:,,', 'grid.pin=player_id:%00']) {
    assert.equal(parseGridView(sp(qs)).pin, null, qs);
  }
  // a bad value drops out alone; so does one past 200 chars (cut short, it would name another row)
  assert.deepEqual(parseGridView(sp(`grid.pin=player_id:1,a b,2,<x>,${'9'.repeat(201)}`)).pin, { col: 'player_id', values: ['1', '2'] });
});
