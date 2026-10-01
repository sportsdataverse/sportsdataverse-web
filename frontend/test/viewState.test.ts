import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSearchParams, parseExploreView, exploreViewParams, parseQueryView, queryViewParams,
  exploreLinkMoved, parseWpView, wpViewParams, parseTrendsView, trendsViewParams, parseLookupsView, lookupsViewParams,
  parseScatterView, scatterViewParams, parseGridView, gridViewParams, EMPTY_GRID, parseShotsView, shotsViewParams,
  SQL_OP_BY_SUFFIX, SUFFIX_BY_SQL_OP,
} from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('Next searchParams records become URLSearchParams, arrays repeat', () => {
  assert.equal(toSearchParams({ a: '1', b: ['x', 'y'], c: undefined }).toString(), 'a=1&b=x&b=y');
});

test('Explore round-trips tag, table, season, filters, limit and SQL', () => {
  const v = {
    tag: 'espn_cfb_pbp', table: 'play_by_play', season: '2024',
    filters: [{ column: 'week', op: '__gte' as const, value: '3' }, { column: 'clock.displayValue', op: '' as const, value: '0:00' }],
    limit: 250, sql: '',
  };
  const qs = exploreViewParams(v).toString();
  assert.equal(qs, 'tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week__gte=3&w.clock.displayValue=0%3A00&limit=250');
  assert.deepEqual(parseExploreView(sp(qs)), v);
});

test('Explore drops defaults and sanitizes a hostile URL', () => {
  assert.equal(exploreViewParams(parseExploreView(sp(''))).toString(), '');
  const v = parseExploreView(sp('tag=x&limit=99999999&w.week__nope=3&w.season=2024'));
  assert.equal(v.limit, 1_000_000);
  assert.deepEqual(v.filters, [{ column: 'season', op: '', value: '2024' }]); // unknown operator dropped
});

test('a quote in a filter key never becomes a column: COLUMN forbids it', () => {
  const v = parseExploreView(sp('w.bad"col=1'));
  assert.deepEqual(v.filters, []);
});

test('Explore SQL ops and URL suffixes are inverse maps', () => {
  for (const [suffix, op] of Object.entries(SQL_OP_BY_SUFFIX)) assert.equal(SUFFIX_BY_SQL_OP[op], suffix);
  assert.equal(SQL_OP_BY_SUFFIX.__like, 'contains');
});

/** Explore's address bar: its own view, then the preview grid's grid.* keys. */
const explorePage = (qs: string) => {
  const p = exploreViewParams(parseExploreView(sp(qs)));
  gridViewParams(parseGridView(sp(qs)), p);
  return p.toString();
};

test('Explore carries the preview grid after its own keys: a descending sort is grid.sort=-col', () => {
  const p = exploreViewParams({ tag: 'espn_cfb_pbp', table: 'play_by_play', season: '2024', filters: [{ column: 'week', op: '', value: '1' }], limit: 50, sql: '' });
  gridViewParams({ ...EMPTY_GRID, sort: { col: 'EPA', dir: 'desc' } }, p);
  assert.equal(p.toString(), 'tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week=1&limit=50&grid.sort=-EPA');
  assert.equal(explorePage(p.toString()), p.toString()); // and a copied link restores it
});

test('Explore ignores grid.* keys: they are never filters, and the grid reads only its own', () => {
  const qs = 'tag=espn_cfb_pbp&table=play_by_play&grid.sort=-EPA&grid.f.team=Ohio&grid.tint=pct';
  const v = parseExploreView(sp(qs));
  assert.deepEqual(v.filters, []);
  assert.equal(exploreViewParams(v).toString(), 'tag=espn_cfb_pbp&table=play_by_play');
  assert.deepEqual(parseGridView(sp(qs)), { sort: { col: 'EPA', dir: 'desc' }, filters: { team: 'Ohio' }, tint: 'pct', pin: null, qualified: false, preset: null, basis: null });
});

test('an Explore link from before the grid (no grid.*) round-trips unchanged', () => {
  for (const qs of [
    'tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week=1&limit=50',
    'tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week__gte=3&w.clock.displayValue=0%3A00&limit=250',
    'tag=espn_cfb_pbp&sql=SELECT+1',
    '',
  ]) assert.equal(explorePage(qs), qs);
});

test('Query URL is the Data API request: same keys, same suffixes', () => {
  const v = {
    schema: 'cfb', table: 'passing',
    filters: [{ column: 'season', op: '' as const, value: '2025' }, { column: 'EPAplay', op: '__gte' as const, value: '0.1' }],
    select: ['athlete_id', 'EPAplay'], order: '-EPAplay', limit: 100,
  };
  const qs = queryViewParams(v).toString();
  assert.equal(qs, 'schema=cfb&table=passing&season=2025&EPAplay__gte=0.1&select=athlete_id%2CEPAplay&order=-EPAplay&limit=100');
  assert.deepEqual(parseQueryView(sp(qs), ['cfb', 'nfl']), v);
});

test('Query ignores grid.* keys, rejects unknown schemas and clamps limit', () => {
  const v = parseQueryView(sp('schema=nope&table=Bad-Name&limit=0&grid.sort=-EPAplay&week=3'), ['cfb', 'nfl']);
  assert.equal(v.schema, 'cfb');
  assert.equal(v.table, '');
  assert.equal(v.limit, 1);
  assert.deepEqual(v.filters, [{ column: 'week', op: '', value: '3' }]);
});

test('Win probability round-trips sport, season year and game id', () => {
  const v = { sport: 'nfl', season: '2024', game: '2024_01_BAL_KC' };
  assert.equal(wpViewParams(v).toString(), 'sport=nfl&season=2024&game=2024_01_BAL_KC');
  assert.deepEqual(parseWpView(sp('sport=nfl&season=2024&game=2024_01_BAL_KC')), v);
  assert.deepEqual(parseWpView(sp('sport=xfl&season=24&game=1;drop')), { sport: 'cfb', season: '', game: '' });
  assert.equal(wpViewParams({ sport: 'cfb', season: '', game: '' }).toString(), '');
});

test('every parsed token/value is capped at 200 chars; sql keeps its own 10k cap', () => {
  const long = 'a'.repeat(50_000);
  const e = parseExploreView(sp(`tag=${long}&table=${long}&season=${long}&w.week=${long}&sql=${long}`));
  assert.equal(e.tag.length, 200);
  assert.equal(e.table.length, 200);
  assert.equal(e.season.length, 200);
  assert.equal(e.filters.length, 1);
  assert.equal(e.filters[0]?.value.length, 200);
  assert.equal(e.sql.length, 10_000);

  const q = parseQueryView(
    sp(`schema=cfb&table=${long}&order=${long}&select=${long},${long}&week=${long}`),
    ['cfb']
  );
  assert.equal(q.table.length, 200);
  assert.equal(q.order.length, 200);
  assert.deepEqual(q.select.map((c) => c.length), [200, 200]);
  assert.equal(q.filters[0]?.value.length, 200);
  assert.equal(parseWpView(sp(`game=${long}`)).game.length, 200);
});

/** A pre-multiples Trends view: the overlay, no group. */
const OVERLAY = { view: 'overlay' as const, group: '' };

test('Trends teams are repeated team keys: in order, gaps kept, deduped, capped at 6 positions', () => {
  assert.deepEqual(parseTrendsView(sp('team=A&team=B')).teams, ['A', 'B']);
  const eight = 'ABCDEFGH'.split('').map((t) => `team=${t}`).join('&');
  assert.deepEqual(parseTrendsView(sp(eight)).teams, ['A', 'B', 'C', 'D', 'E', 'F']);
  // A blank key is a gap (a removed team's colour stays free); a repeated name is dropped.
  assert.deepEqual(parseTrendsView(sp('team=A&team=&team=A&team=B')).teams, ['A', null, 'B']);
  assert.deepEqual(parseTrendsView(sp('team=&team=&team=A')).teams, [null, null, 'A']);
  assert.deepEqual(parseTrendsView(sp('team=A&team=&team=')).teams, ['A']); // trailing gaps trimmed
  assert.deepEqual(parseTrendsView(sp('team=&team=&team=&team=&team=&team=&team=G')).teams, []); // 6 positions
  assert.equal(parseTrendsView(sp(`team=${'x'.repeat(300)}`)).teams[0]?.length, 200);
  assert.equal(trendsViewParams({ sport: 'mbb', teams: ['A', 'B'], stat: '', season: '', ...OVERLAY }).toString(), 'team=A&team=B');
  assert.equal(trendsViewParams({ sport: 'mbb', teams: [], stat: 'x', season: '', ...OVERLAY }).toString(), 'stat=x');
  assert.equal(trendsViewParams({ sport: 'mbb', teams: ['A', null, 'C', null], stat: '', season: '', ...OVERLAY }).toString(), 'team=A&team=&team=C');
});

test('an old single-team Trends link still parses to that one team', () => {
  assert.deepEqual(parseTrendsView(sp('sport=nba&team=Boston%20Celtics&stat=avgRebounds')), {
    sport: 'nba', teams: ['Boston Celtics'], stat: 'avgRebounds', season: '', ...OVERLAY,
  });
});

test('a weekly Trends link carries its season, written after the sport', () => {
  const qs = 'sport=cfb_ratings_weekly&season=2025&team=Ohio%20State&team=Michigan&stat=adj_net';
  const v = parseTrendsView(sp(qs));
  assert.deepEqual(v, { sport: 'cfb_ratings_weekly', teams: ['Ohio State', 'Michigan'], stat: 'adj_net', season: '2025', ...OVERLAY });
  assert.equal(trendsViewParams(v).toString(), qs.replace('%20', '+'));
  assert.equal(parseTrendsView(sp('sport=cfb_ratings_weekly&season=25')).season, ''); // not a year: newest season
});

test('Trends and Lookups round-trip and fall back to the first sport', () => {
  const t = { sport: 'wnba', teams: ['Las Vegas Aces', 'New York Liberty'], stat: 'avgPoints', season: '', ...OVERLAY };
  assert.deepEqual(parseTrendsView(trendsViewParams(t)), t);
  assert.equal(parseTrendsView(sp('sport=zzz')).sport, 'mbb');
  const l = { sport: 'cfb', mode: 'teams' as const, q: '' };
  assert.equal(lookupsViewParams(l).toString(), 'sport=cfb&mode=teams');
  assert.deepEqual(parseLookupsView(sp('sport=cfb&mode=teams')), l);
  assert.equal(parseLookupsView(sp('mode=admin')).mode, 'players');
});

test('an Explore link keeps its filters unless the table or season it named is missing', () => {
  const link = { table: 'pbp', season: '1999' };
  assert.equal(exploreLinkMoved(link, 'pbp', '1999'), false);
  assert.equal(exploreLinkMoved(link, 'pbp', '2026'), true); // season fell back
  assert.equal(exploreLinkMoved(link, 'drives', '1999'), true); // table fell back
  // a link that named neither (single-stem / unpartitioned release) keeps them
  assert.equal(exploreLinkMoved({ table: '', season: '' }, 'pbp', '2026'), false);
});

test('Scatter round-trips source, season and axes; the default source stays off the URL', () => {
  const v = { schema: 'cfb', table: 'passing', season: '2025', x: 'EPAplay', y: 'yards', hl: [], marks: 'dot' as const };
  const qs = scatterViewParams(v).toString();
  assert.equal(qs, 'schema=cfb&table=passing&season=2025&x=EPAplay&y=yards');
  assert.deepEqual(parseScatterView(sp(qs)), v);
  const index = parseScatterView(sp('schema=nba&table=player_impact&season=2026&x=o_rapm&y=d_rapm'));
  assert.deepEqual(index, { schema: 'nba', table: 'player_impact', season: '2026', x: 'o_rapm', y: 'd_rapm', hl: [], marks: 'dot' });
  assert.equal(scatterViewParams(index).toString(), 'season=2026&x=o_rapm&y=d_rapm');
  assert.deepEqual(parseScatterView(sp(scatterViewParams(index).toString())), index);
  assert.equal(scatterViewParams(parseScatterView(sp(''))).toString(), '');
});

test('Scatter drops an x or y that is not a numeric column, falling back to the first two', () => {
  const numeric = ['d_rapm', 'o_rapm', 'war'];
  assert.deepEqual(parseScatterView(sp('x=player_name&y=war'), numeric), { schema: 'nba', table: 'player_impact', season: '', x: 'd_rapm', y: 'war', hl: [], marks: 'dot' });
  assert.deepEqual(parseScatterView(sp('x=nope&y=zip'), numeric).x, 'd_rapm');
  assert.deepEqual(parseScatterView(sp('x=nope&y=zip'), numeric).y, 'o_rapm');
  assert.deepEqual(parseScatterView(sp('x=war&y=o_rapm'), numeric), { schema: 'nba', table: 'player_impact', season: '', x: 'war', y: 'o_rapm', hl: [], marks: 'dot' });
});

test('Scatter marks: face round-trips, dot is the default and stays off the URL, any other value is dot', () => {
  const v = parseScatterView(sp('schema=cfb&table=passing&season=2025&marks=face'));
  assert.equal(v.marks, 'face');
  assert.equal(scatterViewParams(v).toString(), 'schema=cfb&table=passing&season=2025&marks=face');
  assert.deepEqual(parseScatterView(sp(scatterViewParams(v).toString())), v);
  assert.equal(parseScatterView(sp('marks=dot')).marks, 'dot');
  assert.equal(parseScatterView(sp('')).marks, 'dot');
  assert.equal(parseScatterView(sp('marks=logo')).marks, 'dot');
  assert.equal(parseScatterView(sp('marks=FACE')).marks, 'dot');
  assert.equal(scatterViewParams(parseScatterView(sp('marks=dot'))).toString(), '');
});

test('Scatter sanitizes a hostile URL: unknown source, bad season, quoted column', () => {
  const v = parseScatterView(sp('schema=pg_catalog&table=pg_user&season=20251&x=a"b&y=' + 'y'.repeat(300)));
  assert.equal(v.schema, 'nba');
  assert.equal(v.table, 'player_impact');
  assert.equal(v.season, '');
  assert.equal(v.x, '');
  assert.equal(v.y.length, 200);
  // a known schema with another source's table is not a source
  assert.equal(parseScatterView(sp('schema=nba&table=passing')).table, 'player_impact');
});

test('Scatter hl: repeated keys by colour slot, a blank key per gap, at most 3, round-tripping; old links parse', () => {
  const v = parseScatterView(sp('season=2026&x=o_rapm&y=d_rapm&hl=BOS&hl=Jayson%20Tatum'));
  assert.deepEqual(v.hl, ['BOS', 'Jayson Tatum']);
  assert.equal(scatterViewParams(v).toString(), 'season=2026&x=o_rapm&y=d_rapm&hl=BOS&hl=Jayson+Tatum');
  assert.deepEqual(parseScatterView(sp(scatterViewParams(v).toString())), v);
  // a removed first chip leaves a gap, so the second keeps its slot through a reload
  const gap = { ...v, hl: [null, 'Jayson Tatum'] };
  assert.equal(scatterViewParams(gap).toString(), 'season=2026&x=o_rapm&y=d_rapm&hl=&hl=Jayson+Tatum');
  assert.deepEqual(parseScatterView(sp(scatterViewParams(gap).toString())).hl, [null, 'Jayson Tatum']);
  assert.deepEqual(parseScatterView(sp('hl=A&hl=B&hl=C&hl=D&hl=E')).hl, ['A', 'B', 'C']); // the cap
  assert.deepEqual(parseScatterView(sp('hl=&hl=&hl=&hl=D')).hl, []); // 3 positions only
  assert.deepEqual(parseScatterView(sp('hl=A&hl=A&hl=B&hl=')).hl, ['A', 'B']); // repeats dropped, no trailing gap
  assert.equal(parseScatterView(sp(`hl=${'x'.repeat(300)}`)).hl[0]?.length, 200);
  // a T1 link (no hl) still parses, and writes no hl
  const old = parseScatterView(sp('schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa'));
  assert.deepEqual(old.hl, []);
  assert.equal(scatterViewParams(old).toString(), 'schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa');
});

test('Shots round-trips league, season, player, mode and min; defaults stay off the URL; min clamps to 1–15', () => {
  const v = { league: 'nhl', season: '2026', player: '8477492', mode: 'raw' as const, minN: 5 };
  const qs = shotsViewParams(v).toString();
  assert.equal(qs, 'league=nhl&season=2026&player=8477492&min=5');
  assert.deepEqual(parseShotsView(sp(qs)), v);
  assert.equal(shotsViewParams(parseShotsView(sp(''))).toString(), '');
  assert.deepEqual(parseShotsView(sp('')), { league: 'nba_stats', season: '', player: '', mode: 'raw', minN: 2 });
  assert.deepEqual(parseShotsView(sp('league=nba_stats&season=2026&player=1628983&mode=zones&min=15')), { league: 'nba_stats', season: '2026', player: '1628983', mode: 'zones', minN: 15 });
  assert.equal(parseShotsView(sp('min=0')).minN, 1);
  assert.equal(parseShotsView(sp('min=99')).minN, 15);
  assert.equal(parseShotsView(sp('min=7.9')).minN, 7);
  assert.equal(parseShotsView(sp('min=abc')).minN, 2);
  assert.equal(parseShotsView(sp('min=')).minN, 2);
  // hostile values fall back
  const bad = parseShotsView(sp('league=nope&season=20x6&player=a%20b;drop&mode=3d'));
  assert.deepEqual(bad, { league: 'nba_stats', season: '', player: '', mode: 'raw', minN: 2 });
});
