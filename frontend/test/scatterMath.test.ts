import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCATTER_SOURCES } from '../content/scatter.ts';
import {
  cellNumber,
  filledColumns,
  keepListed,
  median,
  missingNote,
  nearest,
  numericColumns,
  paddedDomain,
  scatterAxes,
  scatterPoints,
} from '../lib/platform/viz/scatterMath.ts';
import { resolveColor, sizeCanvas } from '../lib/platform/viz/canvas.ts';

const source = (schema: string, table: string) => SCATTER_SOURCES.find((s) => s.schema === schema && s.table === table)!;

test('median: odd, empty, even (mean of the middle two), unsorted input left alone', () => {
  const input = [3, 1, 2];
  assert.equal(median(input), 2);
  assert.deepEqual(input, [3, 1, 2]);
  assert.equal(median([]), null);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([-1, 10]), 4.5);
});

test('paddedDomain pads 5% of the span; one value or all-equal values still span', () => {
  assert.deepEqual(paddedDomain([0, 10]), [-0.5, 10.5]);
  assert.deepEqual(paddedDomain([10, 0, 5]), [-0.5, 10.5]);
  assert.deepEqual(paddedDomain([5, 5, 5]), [4.75, 5.25]);
  assert.deepEqual(paddedDomain([-4]), [-4.2, -3.8]);
  const [lo, hi] = paddedDomain([0]);
  assert.ok(hi - lo > 0);
  assert.deepEqual(paddedDomain([0, 10], 0.1), [-1, 11]);
});

test('nearest: -1 beyond 20 px, the closer of two marks, a tie to the lower index', () => {
  const pts = [{ px: 0, py: 0 }, { px: 30, py: 0 }];
  assert.equal(nearest(pts, 100, 100), -1);
  assert.equal(nearest(pts, 0, 21), -1); // 21 px from the nearest
  assert.equal(nearest(pts, 0, 20), 0); // 20 px is within
  assert.equal(nearest(pts, 10, 0), 0);
  assert.equal(nearest(pts, 20, 0), 1);
  assert.equal(nearest(pts, 15, 0), 0); // equidistant: the lower index
  assert.equal(nearest([{ px: 5, py: 5 }, { px: 5, py: 5 }], 5, 5), 0);
  assert.equal(nearest(pts, 40, 0, 5), -1); // maxPx is honoured
  assert.equal(nearest([], 0, 0), -1);
});

test('numericColumns: numeric catalog types only, no ids or season, A-Z with every _rank last', () => {
  const catalog = {
    player_id: 'bigint', player_name: 'text', team_id: 'bigint', season: 'bigint', season_type: 'text',
    w_pct: 'double precision', GP: 'bigint', ast: 'integer', off_rating: 'numeric', flag: 'boolean',
    ast_rank: 'bigint', gp_rank: 'bigint',
  };
  assert.deepEqual(numericColumns(catalog), ['ast', 'GP', 'off_rating', 'w_pct', 'ast_rank', 'gp_rank']);
  // NFL's player_id is text: dropped as not numeric, never as a stat
  assert.deepEqual(numericColumns({ player_id: 'text', pos_team: 'text', season: 'bigint', yards: 'double precision' }), ['yards']);
});

test('cellNumber: numbers as they are, Postgres numeric strings converted, everything else NaN', () => {
  assert.equal(cellNumber(3.5), 3.5);
  assert.equal(cellNumber('12.50'), 12.5);
  assert.equal(cellNumber('-0.3'), -0.3);
  for (const v of [null, undefined, '', '  ', 'n/a', true, {}]) assert.ok(Number.isNaN(cellNumber(v)), String(v));
  assert.equal(cellNumber('Infinity'), Infinity); // numeric, then dropped by the finite check
});

test('filledColumns keeps columns with any finite value, a numeric string included', () => {
  const rows = [{ a: null, b: 1, c: Number.NaN, d: '' }, { a: null, b: null, c: '3', d: 'x' }];
  assert.deepEqual(filledColumns(['a', 'b', 'c', 'd'], rows), ['b', 'c']);
});

test('keepListed keeps rows on the list and counts the rest; no list filters nothing', () => {
  const rows = [{ team_id: '150' }, { team_id: '99' }, { team_id: null }, { team_id: '150' }];
  const d1 = keepListed(rows, 'team_id', new Set(['150', '2']));
  assert.deepEqual(d1, { rows: [{ team_id: '150' }, { team_id: '150' }], left: 2, listed: true });
  assert.deepEqual(keepListed(rows, 'team_id', new Set()), { rows, left: 0, listed: false });
  // keys compare by value and type: a number id is not its string
  assert.equal(keepListed([{ team_id: 150 }], 'team_id', new Set(['150'])).left, 1);
});

test('the college hoops sources keep D-I only; no other source filters', () => {
  const only = SCATTER_SOURCES.filter((s) => s.names?.only).map((s) => `${s.schema}.${s.table}:${s.names?.only}`);
  assert.deepEqual(only, ['mbb.player_value:D-I', 'wbb.player_value:D-I', 'mbb.ratings:D-I']);
});

test('scatterAxes keeps valid picks and falls back to the first two numeric columns', () => {
  const cols = ['a', 'b', 'c'];
  assert.deepEqual(scatterAxes('c', 'a', cols), { x: 'c', y: 'a' });
  assert.deepEqual(scatterAxes('nope', 'zip', cols), { x: 'a', y: 'b' });
  assert.deepEqual(scatterAxes('nope', 'a', cols), { x: 'b', y: 'a' }); // the kept y is not reused
  assert.deepEqual(scatterAxes('c', 'nope', cols), { x: 'c', y: 'a' });
  assert.deepEqual(scatterAxes('a', 'nope', ['a']), { x: 'a', y: 'a' });
  assert.deepEqual(scatterAxes('x', 'y', []), { x: '', y: '' });
});

test('scatterPoints drops null and non-finite x or y, counting each axis, and names a team id', () => {
  const src = source('mbb', 'player_value');
  const rows = [
    { player: 'A', team_id: '150', min: 10, box_bpm: 2 },
    { player: 'B', team_id: '99', min: null, box_bpm: 1 },
    { player: 'C', team_id: '150', min: 5, box_bpm: Number.POSITIVE_INFINITY },
    { player: 'D', team_id: '150', min: null, box_bpm: null },
    { player: 'E', team_id: '150', min: '7', box_bpm: '1.5' }, // Postgres numeric arrives as a string
    { player: 'F', team_id: '150', min: 'n/a', box_bpm: 1 },
  ];
  const { points, missingX, missingY } = scatterPoints(rows, src, 'min', 'box_bpm', new Map([['150', 'Duke Blue Devils']]));
  assert.deepEqual(points, [
    { label: 'A', team: 'Duke Blue Devils', x: 10, y: 2 },
    { label: 'E', team: 'Duke Blue Devils', x: 7, y: 1.5 },
  ]);
  assert.equal(missingX, 3);
  assert.equal(missingY, 2);
  // a team table: the label IS the named id; unnamed ids stay themselves
  const r = scatterPoints([{ team_id: 1, adj_net: 1, games: 2 }, { team_id: 2, adj_net: 3, games: 4 }], source('cfb', 'ratings'), 'adj_net', 'games', new Map([[1, 'Ohio State']]));
  assert.deepEqual(r.points.map((p) => [p.label, p.team]), [['Ohio State', ''], ['2', '']]);
});

test('missingNote reads per axis, singular and plural, skipping zeros', () => {
  assert.equal(missingNote('players', [['o_rapm', 12], ['d_rapm', 0]]), '12 players have no value for o_rapm.');
  assert.equal(missingNote('teams', [['x', 1], ['y', 1200]]), '1 team has no value for x. 1,200 teams have no value for y.');
  assert.equal(missingNote('players', [['x', 0], ['y', 0]]), '');
});

test('sizeCanvas backs CSS px with DPR device pixels, reallocating only on a size change', () => {
  const calls: string[] = [];
  let [w, h, writes] = [0, 0, 0];
  const ctx2d = {
    setTransform: (...a: number[]) => calls.push(`t${a.join(',')}`),
    clearRect: (...a: number[]) => calls.push(`c${a.join(',')}`),
  };
  const canvas = {
    get width() { return w; },
    set width(v: number) { w = v; writes++; },
    get height() { return h; },
    set height(v: number) { h = v; writes++; },
    style: { width: '', height: '' },
    getContext: () => ctx2d,
  };
  const size = (cw: number, ch: number, dpr: number) => sizeCanvas(canvas as unknown as HTMLCanvasElement, cw, ch, dpr);
  assert.ok(size(300.5, 200, 2));
  assert.deepEqual([w, h, canvas.style.width, canvas.style.height, writes], [601, 400, '300.5px', '200px', 2]);
  // the scale is applied after a clear at identity: drawing works in CSS px
  assert.deepEqual(calls, ['t1,0,0,1,0,0', 'c0,0,601,400', 't2,0,0,2,0,0']);
  size(300.5, 200, 2); // a hover redraw: same size, cleared, not reallocated
  assert.equal(writes, 2);
  assert.deepEqual(calls.slice(3), ['t1,0,0,1,0,0', 'c0,0,601,400', 't2,0,0,2,0,0']);
  size(300.5, 200, 1); // a DPR change reallocates
  assert.deepEqual([w, h, writes], [301, 200, 4]);
  size(100, 50, 1);
  assert.deepEqual([w, h], [100, 50]);
  const dead = { ...canvas, getContext: () => null };
  assert.throws(() => sizeCanvas(dead as unknown as HTMLCanvasElement, 1, 1, 1), /no 2d canvas context/);
});

test('resolveColor reads the token off a probe inside the host, then removes it', () => {
  const kids: { style: Record<string, string> }[] = [];
  const host = {
    ownerDocument: { createElement: () => ({ style: {} }) },
    appendChild: (el: { style: Record<string, string> }) => kids.push(el),
    removeChild: (el: { style: Record<string, string> }) => kids.splice(kids.indexOf(el), 1),
  };
  let seen = '';
  const color = resolveColor(host as unknown as HTMLElement, '--color-chart-cat-1', (el) => {
    seen = (el as unknown as { style: { color: string } }).style.color;
    return { color: kids.includes(el as never) ? 'rgb(42, 120, 214)' : 'detached' };
  });
  assert.equal(seen, 'var(--color-chart-cat-1)');
  assert.equal(color, 'rgb(42, 120, 214)');
  assert.equal(kids.length, 0);
});
