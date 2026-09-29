import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCATTER_SOURCES } from '../content/scatter.ts';
import {
  baseView,
  cellNumber,
  chipMatches,
  exportFilename,
  filledColumns,
  highlightOptions,
  highlightSlots,
  isBaseView,
  keepListed,
  median,
  missingNote,
  nearest,
  numericColumns,
  paddedDomain,
  panView,
  pickRandomAxes,
  scatterAxes,
  scatterExportText,
  scatterPoints,
  suggest,
  zoomView,
  ZOOM_MAX,
  ZOOM_MIN,
  type ScatterPoint,
  utcMinute,
} from '../lib/platform/viz/scatterMath.ts';
import { addTeam, removeTeam, pickSlots } from '../lib/platform/trends.ts';
import { ALL_PAIRS_CAP } from '../lib/platform/chartTokens.ts';
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
    { label: 'A', team: 'Duke Blue Devils', teamName: '', x: 10, y: 2 },
    { label: 'E', team: 'Duke Blue Devils', teamName: '', x: 7, y: 1.5 },
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

// --- P4 T2: highlight, zoom and pan, RANDOM ---------------------------------------

const pt = (label: string, team: string, teamName = '', x = 0, y = 0): ScatterPoint => ({ label, team, teamName, x, y });

test('scatterPoints carries the full team name where the source has one (NBA: team_name beside BOS)', () => {
  const r = scatterPoints([{ player_name: 'Jayson Tatum', team_abbreviation: 'BOS', team_name: 'Boston Celtics', o_rapm: 1, d_rapm: 2 }], source('nba', 'player_impact'), 'o_rapm', 'd_rapm');
  assert.deepEqual(r.points, [{ label: 'Jayson Tatum', team: 'BOS', teamName: 'Boston Celtics', x: 1, y: 2 }]);
});

test('chipMatches: the name, the team, the team abbreviation or full name, ignoring case; never a substring', () => {
  const tatum = pt('Jayson Tatum', 'BOS', 'Boston Celtics');
  for (const chip of ['Jayson Tatum', 'jayson tatum', 'BOS', 'bos', 'Boston Celtics', 'BOSTON CELTICS']) assert.ok(chipMatches(tatum, chip), chip);
  for (const chip of ['Tatum', 'BO', 'Boston', 'LAL', '']) assert.equal(chipMatches(tatum, chip), false, chip);
  // a team table: the label is the team name
  assert.ok(chipMatches(pt('Indiana', ''), 'indiana'));
});

test('highlightSlots: each mark takes its first matching chip\'s slot, -1 for none, null with no chip', () => {
  const pts = [pt('Jayson Tatum', 'BOS', 'Boston Celtics'), pt('LeBron James', 'LAL'), pt('Jaylen Brown', 'BOS'), pt('Luka Doncic', 'LAL')];
  assert.equal(highlightSlots(pts, []), null);
  assert.equal(highlightSlots(pts, [null, null]), null);
  assert.deepEqual(highlightSlots(pts, ['bos']), [0, -1, 0, -1]);
  // a mark matching two chips takes the earlier chip's colour
  assert.deepEqual(highlightSlots(pts, ['BOS', 'Jayson Tatum', 'LAL']), [0, 2, 0, 2]);
  assert.deepEqual(highlightSlots(pts, ['Jayson Tatum', 'BOS']), [0, -1, 1, -1]);
  // a gap keeps the survivors' slots
  assert.deepEqual(highlightSlots(pts, [null, 'LAL']), [-1, 1, -1, 1]);
  // chips that match no mark (carried over to another source): the plain chart, nothing faded
  assert.equal(highlightSlots(pts, ['DEN', 'Nikola Jokic']), null);
  assert.deepEqual(highlightSlots(pts, ['DEN', 'lal']), [-1, 1, -1, 1]);
});

test('highlight chips: the first free slot, kept when another chip goes; a 4th refused (ALL_PAIRS_CAP)', () => {
  assert.equal(ALL_PAIRS_CAP, 3);
  let picks: (string | null)[] = [];
  for (const c of ['BOS', 'LAL', 'OKC']) picks = addTeam(picks, c, ALL_PAIRS_CAP).teams;
  assert.deepEqual(picks, ['BOS', 'LAL', 'OKC']);
  const fourth = addTeam(picks, 'DEN', ALL_PAIRS_CAP);
  assert.equal(fourth.refused, true);
  assert.deepEqual(fourth.teams, ['BOS', 'LAL', 'OKC']);
  picks = removeTeam(picks, 'BOS');
  assert.deepEqual(pickSlots(picks), [{ team: 'LAL', slot: 'cat-2' }, { team: 'OKC', slot: 'cat-3' }]); // survivors never repainted
  picks = addTeam(picks, 'DEN', ALL_PAIRS_CAP).teams;
  assert.deepEqual(picks, ['DEN', 'LAL', 'OKC']); // the new chip takes the free slot 1
});

test('highlightOptions and suggest: names, teams and team names once each, with match counts; exact, prefix, then the rest', () => {
  const pts = [pt('Jayson Tatum', 'BOS', 'Boston Celtics'), pt('Jaylen Brown', 'BOS', 'Boston Celtics'), pt('Bosnian Guy', 'DEN', 'Denver Nuggets'), pt('Ambos', 'LAL', 'Los Angeles Lakers')];
  const opts = highlightOptions(pts);
  assert.deepEqual(opts.get('bos'), { text: 'BOS', n: 2 });
  assert.deepEqual(opts.get('boston celtics'), { text: 'Boston Celtics', n: 2 });
  assert.deepEqual(opts.get('jayson tatum'), { text: 'Jayson Tatum', n: 1 });
  assert.deepEqual(suggest(opts, 'bos', []).map((o) => o.text), ['BOS', 'Bosnian Guy', 'Boston Celtics', 'Ambos']);
  assert.deepEqual(suggest(opts, '  BOS ', ['BOS']).map((o) => o.text), ['Bosnian Guy', 'Boston Celtics', 'Ambos']); // chips on are left out
  assert.deepEqual(suggest(opts, '', []), []);
  const many = highlightOptions(Array.from({ length: 20 }, (_, i) => pt(`Player ${i}`, 'X')));
  assert.equal(suggest(many, 'player', []).length, 8);
  assert.equal(suggest(many, 'player', [], 3).length, 3);
});

test('zoomView keeps the anchored point in place at every scale in [0.5, 32]', () => {
  const base = baseView([-10, 30], [0, 5]);
  for (const [fx, fy] of [[0.5, 0.5], [0, 1], [0.13, 0.87], [1, 0]]) {
    let v = base;
    const ax = v.x[0] + fx * (v.x[1] - v.x[0]);
    const ay = v.y[0] + fy * (v.y[1] - v.y[0]);
    for (let step = 0; step < 40; step++) {
      // zoom in to the cap, then back out past the floor
      v = zoomView(v, base, fx, fy, step < 20 ? 1.3 : 1 / 1.3);
      assert.ok(v.k >= ZOOM_MIN && v.k <= ZOOM_MAX, `k ${v.k}`);
      const [gx, gy] = [(ax - v.x[0]) / (v.x[1] - v.x[0]), (ay - v.y[0]) / (v.y[1] - v.y[0])];
      assert.ok(Math.abs(gx - fx) < 1e-9 && Math.abs(gy - fy) < 1e-9, `k ${v.k}: anchor at ${gx}, ${gy}`);
      assert.ok(Math.abs((base.x[1] - base.x[0]) / (v.x[1] - v.x[0]) - v.k) < 1e-9, 'k is the base span over the visible span');
    }
  }
});

test('zoomView clamps the total zoom to 0.5-32 of the base; the span follows k', () => {
  const base = baseView([0, 100], [0, 10]);
  const four = zoomView(base, base, 0.5, 0.5, 4);
  assert.deepEqual(four, { k: 4, x: [37.5, 62.5], y: [3.75, 6.25] });
  const top = zoomView(four, base, 0.5, 0.5, 1000);
  assert.equal(top.k, ZOOM_MAX);
  assert.ok(Math.abs(top.x[1] - top.x[0] - 100 / 32) < 1e-9);
  const bottom = zoomView(base, base, 0.25, 0.25, 0.001);
  assert.equal(bottom.k, ZOOM_MIN);
  assert.ok(Math.abs(bottom.x[1] - bottom.x[0] - 200) < 1e-9);
  assert.deepEqual(zoomView(top, base, 0.5, 0.5, 2), top); // at the cap, a further zoom in is a no-op
});

test('panView slides both domains by a fraction of their span, keeping k', () => {
  const v = { k: 2, x: [10, 20] as [number, number], y: [0, 4] as [number, number] };
  assert.deepEqual(panView(v, 0.1, 0), { k: 2, x: [9, 19], y: [0, 4] }); // drag right: lower x comes into view
  assert.deepEqual(panView(v, 0, -0.25), { k: 2, x: [10, 20], y: [1, 5] }); // drag down (fy up is -): higher y
  assert.deepEqual(panView(panView(v, 0.3, 0.2), -0.3, -0.2), v);
});

test('pickRandomAxes: two distinct columns, never the current pair or its swap, deterministic with a seeded rng', () => {
  const cols = ['a', 'b', 'c', 'd'];
  const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const seen = new Map<string, number>();
  const rng = seeded(7);
  for (let i = 0; i < 5000; i++) {
    const p = pickRandomAxes(cols, { x: 'a', y: 'b' }, rng)!;
    assert.notEqual(p.x, p.y);
    assert.ok(!(p.x === 'a' && p.y === 'b') && !(p.x === 'b' && p.y === 'a'), `${p.x},${p.y}`);
    seen.set(`${p.x},${p.y}`, (seen.get(`${p.x},${p.y}`) ?? 0) + 1);
  }
  assert.equal(seen.size, 4 * 3 - 2); // every other ordered pair comes up
  for (const n of seen.values()) assert.ok(n > 350 && n < 650, `uniform: ${[...seen]}`); // 500 expected each
  const run = (seed: number) => {
    const r = seeded(seed);
    return Array.from({ length: 8 }, () => pickRandomAxes(cols, { x: 'c', y: 'a' }, r));
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
  // the rng's edges map to the first and last pair left
  assert.deepEqual(pickRandomAxes(cols, { x: 'a', y: 'b' }, () => 0), { x: 'a', y: 'c' });
  assert.deepEqual(pickRandomAxes(cols, { x: 'a', y: 'b' }, () => 0.9999999), { x: 'd', y: 'c' });
  assert.deepEqual(pickRandomAxes(cols, { x: 'd', y: 'c' }, () => 0.9999999), { x: 'd', y: 'b' });
  // no other pair: null
  assert.equal(pickRandomAxes(['a', 'b'], { x: 'a', y: 'b' }, () => 0.5), null);
  assert.equal(pickRandomAxes(['a'], { x: 'a', y: 'a' }), null);
  // a current pick that is not a column excludes nothing
  assert.deepEqual(pickRandomAxes(['a', 'b'], { x: 'z', y: 'a' }, () => 0), { x: 'a', y: 'b' });
});

// --- Export ----------------------------------------------------------------------

const NBA_VIEW = { schema: 'nba', table: 'player_impact', season: '2026', x: 'o_rapm', y: 'd_rapm' };

test('exportFilename: {schema}_{table}_{y}_vs_{x}_{season}.png, the same every time', () => {
  assert.equal(exportFilename(NBA_VIEW), 'nba_player_impact_d_rapm_vs_o_rapm_2026.png');
  assert.equal(exportFilename({ ...NBA_VIEW }), exportFilename(NBA_VIEW));
  // two seasons of one pair never share a name
  assert.notEqual(exportFilename({ ...NBA_VIEW, season: '2025' }), exportFilename(NBA_VIEW));
});

test('exportFilename: only [a-z0-9_], runs collapsed, no underscore at either end', () => {
  const name = exportFilename({ schema: 'NBA', table: 'player impact', season: '2026/27', x: 'o-rapm %', y: '__d.rapm' });
  assert.equal(name, 'nba_player_impact_d_rapm_vs_o_rapm_2026_27.png');
  assert.match(name, /^[a-z0-9_]+\.png$/);
  assert.equal(exportFilename({ schema: '../', table: '"<x>"', season: '', x: 'é', y: '' }), 'x_vs.png');
  assert.equal(exportFilename({ schema: '', table: '', season: '', x: '', y: '' }), 'vs.png');
  for (const v of [NBA_VIEW, { schema: '\u0000', table: '💥', season: '-', x: ' ', y: '\n' }]) assert.match(exportFilename(v), /^[a-z0-9_]+\.png$/);
});

const TEXT = { label: 'NBA player impact', query: 'season=2026&x=o_rapm&y=d_rapm', zoomed: false };

test('scatterExportText: the page title, and a subtitle of source, season and every chip in its slot colour', () => {
  const t = scatterExportText({ ...NBA_VIEW, hl: ['BOS', 'LAL'] }, TEXT);
  assert.equal(t.title, 'd_rapm vs o_rapm · 2026');
  assert.deepEqual(t.subtitle, [
    { text: 'NBA player impact' },
    { text: '2026' },
    { text: 'BOS', color: 'var(--color-chart-cat-1)' },
    { text: 'LAL', color: 'var(--color-chart-cat-2)' },
  ]);
});

test('scatterExportText: the gap a removed chip leaves is skipped, and the others keep their slots, in slot order', () => {
  const t = scatterExportText({ ...NBA_VIEW, hl: [null, 'LAL', 'BOS'] }, TEXT);
  assert.deepEqual(t.subtitle.slice(2), [
    { text: 'LAL', color: 'var(--color-chart-cat-2)' },
    { text: 'BOS', color: 'var(--color-chart-cat-3)' },
  ]);
  assert.deepEqual(scatterExportText({ ...NBA_VIEW, hl: ['BOS', null, 'OKC'] }, TEXT).subtitle.slice(2).map((r) => r.color), [
    'var(--color-chart-cat-1)',
    'var(--color-chart-cat-3)',
  ]);
  assert.equal(scatterExportText({ ...NBA_VIEW, hl: [null, null] }, TEXT).subtitle.length, 2);
});

test('scatterExportText: "zoomed" only off the base view, last', () => {
  assert.ok(!scatterExportText({ ...NBA_VIEW, hl: ['BOS'] }, TEXT).subtitle.some((r) => r.text === 'zoomed'));
  assert.deepEqual(scatterExportText({ ...NBA_VIEW, hl: ['BOS'] }, { ...TEXT, zoomed: true }).subtitle.at(-1), { text: 'zoomed' });
  assert.deepEqual(scatterExportText({ ...NBA_VIEW, hl: [] }, { ...TEXT, zoomed: true }).subtitle.map((r) => r.text), ['NBA player impact', '2026', 'zoomed']);
});

test('scatterExportText: the footer links the view and says when its data last changed, or leaves that out', () => {
  const v = { ...NBA_VIEW, hl: [] };
  assert.equal(
    scatterExportText(v, { ...TEXT, asOf: '2026-08-02T06:49:04.965655+00:00' }).footer,
    'sportsdataverse.org/platform/scatter?season=2026&x=o_rapm&y=d_rapm · data as of 2026-08-02 06:49 UTC'
  );
  // an offset is read as the instant it names, shown in UTC
  assert.ok(scatterExportText(v, { ...TEXT, asOf: '2026-08-02T01:49:00-05:00' }).footer.endsWith('data as of 2026-08-02 06:49 UTC'));
  for (const asOf of [undefined, null, '', 'not a date'])
    assert.equal(scatterExportText(v, { ...TEXT, asOf }).footer, 'sportsdataverse.org/platform/scatter?season=2026&x=o_rapm&y=d_rapm');
  assert.equal(scatterExportText(v, { ...TEXT, query: '' }).footer, 'sportsdataverse.org/platform/scatter');
  assert.equal(utcMinute('2026-09-28T15:14:07Z'), '2026-09-28 15:14 UTC');
});

test('isBaseView: zoomed in and back out (buttons or wheel) is the base view again, whatever the scale', () => {
  // an NBA-like domain, a counting stat, a column in the millions, one in the billions and one
  // of tiny rates: the tolerance follows each span (an absolute one misjudges the last two)
  const DOMAINS = [
    [[-4.9, 5.4], [-3.9, 5.3]],
    [[0, 5234], [12, 97]],
    [[0.1, 0.73], [1e6, 1.6e6]],
    [[3.1e9, 7.9e9], [0.2, 0.9]],
    [[1e-9, 4e-8], [2e-9, 9e-9]],
  ];
  for (const [xs, ys] of DOMAINS) {
    const b = baseView(paddedDomain(xs), paddedDomain(ys));
    assert.ok(isBaseView(b, b));
    const inOut = zoomView(zoomView(b, b, 0.5, 0.5, 2), b, 0.5, 0.5, 0.5);
    const outIn = zoomView(zoomView(b, b, 0.5, 0.5, 0.5), b, 0.5, 0.5, 2);
    const wheel = zoomView(zoomView(b, b, 0.37, 0.61, Math.exp(0.24)), b, 0.37, 0.61, Math.exp(-0.24));
    for (const v of [inOut, outIn, wheel]) {
      assert.notEqual(v, b); // a new object: identity alone would call it zoomed
      assert.ok(isBaseView(v, b), JSON.stringify(v));
    }
    // off the base view: zoomed 2x, or panned at k = 1 by a thousandth of the plot
    assert.ok(!isBaseView(zoomView(b, b, 0.5, 0.5, 2), b));
    assert.ok(!isBaseView(panView(b, 0.001, 0), b));
    assert.ok(!isBaseView(panView(b, 0, -0.001), b));
    assert.ok(!isBaseView(zoomView(b, b, 0.5, 0.5, 1.001), b));
    // the zoom factor is part of the view, even over the base domain
    assert.ok(!isBaseView({ ...b, k: 2 }, b));
  }
  // in the billions a round trip lands ~1e-6 off the base (and k a hair under 1): far past an
  // absolute 1e-9, well within the span-relative one
  const big = baseView(paddedDomain([3.1e9, 7.9e9]), paddedDomain([0.2, 0.9]));
  const bigRt = zoomView(zoomView(big, big, 0.13, 0.61, 3.7), big, 0.13, 0.61, 1 / 3.7);
  assert.ok(Math.abs(bigRt.x[1] - big.x[1]) > 1e-9);
  assert.ok(isBaseView(bigRt, big));
});
