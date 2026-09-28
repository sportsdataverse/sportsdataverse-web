import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSearchParams, parseExploreView, exploreViewParams, parseQueryView, queryViewParams,
  exploreLinkMoved, parseWpView, wpViewParams, parseTrendsView, trendsViewParams, parseLookupsView, lookupsViewParams,
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
  assert.equal(trendsViewParams({ sport: 'mbb', teams: ['A', 'B'], stat: '' }).toString(), 'team=A&team=B');
  assert.equal(trendsViewParams({ sport: 'mbb', teams: [], stat: 'x' }).toString(), 'stat=x');
  assert.equal(trendsViewParams({ sport: 'mbb', teams: ['A', null, 'C', null], stat: '' }).toString(), 'team=A&team=&team=C');
});

test('an old single-team Trends link still parses to that one team', () => {
  assert.deepEqual(parseTrendsView(sp('sport=nba&team=Boston%20Celtics&stat=avgRebounds')), {
    sport: 'nba', teams: ['Boston Celtics'], stat: 'avgRebounds',
  });
});

test('Trends and Lookups round-trip and fall back to the first sport', () => {
  const t = { sport: 'wnba', teams: ['Las Vegas Aces', 'New York Liberty'], stat: 'avgPoints' };
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
