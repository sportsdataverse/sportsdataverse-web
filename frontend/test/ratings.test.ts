import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATINGS, TEAM_COL } from '../content/ratings.ts';
import { SCATTER_SOURCES, type ScatterNames } from '../content/scatter.ts';
import { joinNames } from '../lib/platform/viz/scatterMath.ts';
import { polarity } from '../lib/platform/scales.ts';
import { parseRatingsView, ratingsViewParams } from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('every board orders by a shown column of its table, and shows its producer rank', () => {
  for (const [league, r] of Object.entries(RATINGS)) {
    const order = r.order.replace(/^-/, '');
    assert.ok(r.select.includes(order), `${league}: order ${order} is not in select`);
    assert.ok(order in r.columns, `${league}: order ${order} is not a column`);
    if (r.rank) assert.ok(r.select.includes(r.rank) && r.rank in r.columns, `${league}: rank ${r.rank}`);
    for (const c of r.select) assert.ok(c in r.columns || (c === TEAM_COL && r.names), `${league}: ${c} is not a column`);
    // the name column exactly where a team id is named
    assert.equal(r.select.includes(TEAM_COL), Boolean(r.names), `${league}: ${TEAM_COL} column vs names`);
    if (r.names) assert.ok(r.names.col in r.columns, `${league}: names.col ${r.names.col}`);
    if (r.source === 'release') assert.ok(r.week in r.columns, `${league}: week ${r.week}`);
  }
});

test('a board on a Scatter table reads the same rows as Scatter: same fixed filter, same names and D-I list', () => {
  const shared = Object.values(RATINGS).flatMap((r) => {
    if (r.source !== 'api') return [];
    const s = SCATTER_SOURCES.find((x) => x.schema === r.schema && x.table === r.table);
    return s ? [[r, s] as const] : [];
  });
  assert.equal(shared.length, 4); // nba, wnba player_impact; mbb, cfb ratings
  for (const [r, s] of shared) {
    assert.deepEqual(r.filter, s.filter, `${r.schema}.${r.table} filter`);
    assert.deepEqual(r.names, s.names, `${r.schema}.${r.table} names`);
  }
});

test('the grid shades each board column the right way round: a low adj_d or allowed EPA is good, possessions are no one\'s good', () => {
  for (const c of ['adj_d', 'raw_d', 'adj_def_epa', 'def_rank', 'rank', 'net_rank', 'off_rank']) assert.equal(polarity(c), -1, c);
  for (const c of ['adj_o', 'adj_em', 'adj_net', 'adj_off_epa', 'o_rapm', 'd_rapm', 'rapm', 'off_poss', 'def_poss', 'games']) assert.equal(polarity(c), 1, c);
});

const hoops: ScatterNames = { schema: 'mbb', table: 'team_group_seasons', key: 'team_id', name: 'team_name', keyType: 'string', col: 'team_id', bySeason: true, only: 'D-I' };
const cfb: ScatterNames = { schema: 'cfb', table: 'team_info', key: 'team_id', name: 'school', keyType: 'number', col: 'team_id' };

test('joinNames names ids of one type: a text 2509 matches a text 2509, a bigint 2509 a bigint 2509', () => {
  const text = joinNames([{ team_id: '2509', adj_em: 20 }], [{ team_id: '2509', team_name: 'Purdue' }], hoops);
  assert.equal(text.nameOf.get('2509'), 'Purdue');
  assert.deepEqual(text.rows, [{ team_id: '2509', adj_em: 20 }]);
  assert.equal(text.unnamed, 0);
  const num = joinNames([{ team_id: 2509 }], [{ team_id: 2509, school: 'Purdue' }], cfb);
  assert.equal(num.nameOf.get(2509), 'Purdue');
});

test('joinNames never matches a text id to a bigint key, or an object key: it throws', () => {
  assert.throws(() => joinNames([{ team_id: '2509' }], [{ team_id: 2509, school: 'Purdue' }], cfb), /release team ids/);
  assert.throws(() => joinNames([{ team_id: 2509 }], [{ team_id: '2509', school: 'Purdue' }], cfb), /cfb\.team_info\.team_id/);
  assert.throws(() => joinNames([{ team_id: { id: 2509 } }], [{ team_id: 2509, school: 'Purdue' }], cfb), /object/);
});

test('joinNames keeps an unmatched id, named by itself and counted; no D-I cut without `only`', () => {
  const j = joinNames([{ team_id: 2509 }, { team_id: 99999 }], [{ team_id: 2509, school: 'Purdue' }], cfb);
  assert.equal(j.rows.length, 2);
  assert.equal(j.nameOf.get(99999), '99999');
  assert.equal(j.unnamed, 1);
  assert.deepEqual([j.left, j.unlisted], [0, false]);
});

test('joinNames with `only` leaves out and counts the ids off the list; no list keeps every row', () => {
  const rows = [{ team_id: '2509' }, { team_id: '150' }, { team_id: '1' }];
  const list = [{ team_id: '2509', team_name: 'Purdue' }, { team_id: '150', team_name: 'Duke' }];
  const j = joinNames(rows, list, hoops);
  assert.deepEqual(j.rows, [{ team_id: '2509' }, { team_id: '150' }]);
  assert.deepEqual([j.left, j.unlisted, j.unnamed], [1, false, 0]);
  const none = joinNames(rows, [], hoops);
  assert.deepEqual([none.rows.length, none.left, none.unlisted, none.unnamed], [3, 0, true, 3]);
});

test('RatingsView round-trips league and season; the default league stays off the URL', () => {
  for (const league of Object.keys(RATINGS)) {
    const v = { league, season: '2026' };
    assert.deepEqual(parseRatingsView(ratingsViewParams(v)), v);
  }
  assert.equal(ratingsViewParams({ league: 'nfl', season: '2026' }).toString(), 'league=nfl&season=2026');
  assert.equal(ratingsViewParams({ league: 'nba', season: '2026' }).toString(), 'season=2026');
  assert.equal(ratingsViewParams(parseRatingsView(sp(''))).toString(), '');
});

test('RatingsView: an unknown league falls back to NBA, a bad season to the newest, stray keys are ignored', () => {
  assert.deepEqual(parseRatingsView(sp('league=nhl&season=2026')), { league: 'nba', season: '2026' });
  assert.deepEqual(parseRatingsView(sp('league=__proto__&season=20261')), { league: 'nba', season: '' });
  assert.deepEqual(parseRatingsView(sp('league=cfb&season=abcd&grid.sort=-adj_net&x=1')), { league: 'cfb', season: '' });
});
