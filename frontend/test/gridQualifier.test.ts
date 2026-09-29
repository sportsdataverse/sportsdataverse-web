import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  belowNote, belowQualifier, categoryOf, exploreSource, nSiblings, QUALIFIER_VOLUME, qualifierMin,
} from '../lib/platform/gridQualifier.ts';

test('nSiblings maps X to X_n, and ignores an X_n without its X', () => {
  assert.deepEqual(nSiblings(['EPAplay', 'EPAplay_n', 'fg_n']), new Map([[0, 1]]));
  assert.deepEqual(nSiblings(['EPAplay_n', 'success', 'EPAplay', 'success_n']), new Map([[2, 0], [1, 3]]));
  assert.deepEqual(nSiblings(['plays', 'team_games']), new Map());
});

test('belowQualifier is the producer gate per team game: volume < min * team games, and the boundary qualifies', () => {
  assert.equal(belowQualifier(40, 5, 14), true);
  assert.equal(belowQualifier(70, 5, 14), false); // >= in the producer
  assert.equal(belowQualifier(69, 5, 14), true);
  assert.equal(belowQualifier(31.25, 5, 6.25), false);
  // grid cells arrive as strings
  assert.equal(belowQualifier('40', '5', 14), true);
  assert.equal(belowQualifier('168', '12', 14), false);
});

test('belowQualifier is unknown (null), never faded, when an input is missing or not a finite number', () => {
  assert.equal(belowQualifier(null, 5, 14), null);
  assert.equal(belowQualifier(40, null, 14), null);
  assert.equal(belowQualifier(40, 5, null), null);
  assert.equal(belowQualifier('', '5', 14), null); // "" is missing, not 0
  assert.equal(belowQualifier('40', ' ', 14), null);
  assert.equal(belowQualifier('NaN', '5', 14), null);
  assert.equal(belowQualifier('40', 'Infinity', 14), null);
  assert.equal(belowQualifier('abc', '5', 14), null);
});

test('the gate reads each category’s volume column (cfb-data PLAYER_QUALIFIERS)', () => {
  assert.deepEqual(QUALIFIER_VOLUME, { passing: 'dropbacks', rushing: 'plays', receiving: 'plays' });
});

test('categoryOf: the CFB and NFL player leaderboards in Query; team and other tables have no qualifier', () => {
  for (const schema of ['cfb', 'nfl']) {
    assert.deepEqual(categoryOf(schema, 'passing'), { entity: 'player', category: 'passing' });
    assert.deepEqual(categoryOf(schema, 'rushing'), { entity: 'player', category: 'rushing' });
    assert.deepEqual(categoryOf(schema, 'receiving'), { entity: 'player', category: 'receiving' });
    assert.equal(categoryOf(schema, 'team_summaries'), null);
    assert.equal(categoryOf(schema, 'league_averages'), null);
  }
  assert.equal(categoryOf('cfb', 'adv_passing'), null); // no team_games: not the qualified leaderboard
  assert.equal(categoryOf('pff_cfb', 'passing'), null);
  assert.equal(categoryOf('nba', 'passing'), null);
  assert.equal(categoryOf('cfb', 'toString'), null); // not an inherited key
});

test('an Explore release file maps onto the Query table it mirrors', () => {
  assert.deepEqual(exploreSource('espn_cfb_passing', 'cfb_passing'), { schema: 'cfb', table: 'passing' });
  assert.deepEqual(exploreSource('espn_cfb_receiving', 'cfb_receiving'), { schema: 'cfb', table: 'receiving' });
  assert.deepEqual(exploreSource('nfl_passing', 'passing'), { schema: 'nfl', table: 'passing' });
  assert.deepEqual(exploreSource('nfl_rushing', 'rushing'), { schema: 'nfl', table: 'rushing' });
  assert.equal(categoryOf(...Object.values(exploreSource('espn_cfb_team_summaries', 'cfb_team_summaries')!) as [string, string]), null);
  assert.equal(exploreSource('espn_mbb_pbp', 'play_by_play'), null);
  assert.equal(exploreSource('', ''), null);
});

// Real `GET /v1/{cfb,nfl}/league_averages?season=2025&entity=player&select=category,metric,qualifier_min,level`
// rows (2026-09-29), two metrics per category and level.
const CFB_2025 = [
  ['passing', 'plays', 'fbs', 14], ['passing', 'TEPA', 'fbs', 14], ['passing', 'plays', 'g5', 14], ['passing', 'TEPA', 'g5', 14],
  ['passing', 'plays', 'p4', 14], ['passing', 'TEPA', 'p4', 14],
  ['receiving', 'plays', 'fbs', 1.875], ['receiving', 'TEPA', 'fbs', 1.875], ['receiving', 'plays', 'g5', 1.875],
  ['receiving', 'TEPA', 'g5', 1.875], ['receiving', 'plays', 'p4', 1.875], ['receiving', 'TEPA', 'p4', 1.875],
  ['rushing', 'plays', 'fbs', 6.25], ['rushing', 'TEPA', 'fbs', 6.25], ['rushing', 'plays', 'g5', 6.25], ['rushing', 'TEPA', 'g5', 6.25],
  ['rushing', 'plays', 'p4', 6.25], ['rushing', 'TEPA', 'p4', 6.25],
].map(([category, metric, level, qualifier_min]) => ({ category, metric, level, qualifier_min }));
const NFL_2025 = [
  ['passing', 'plays', 'nfl', 14], ['passing', 'TEPA', 'nfl', 14], ['receiving', 'plays', 'nfl', 1.875],
  ['receiving', 'TEPA', 'nfl', 1.875], ['rushing', 'plays', 'nfl', 6.25], ['rushing', 'TEPA', 'nfl', 6.25],
].map(([category, metric, level, qualifier_min]) => ({ category, metric, level, qualifier_min }));

test('qualifierMin reads CFB’s fbs level, the same gate as every other level', () => {
  for (const category of ['passing', 'rushing', 'receiving']) {
    const rows = CFB_2025.filter((r) => r.category === category);
    const min = qualifierMin(rows, 'cfb');
    assert.equal(typeof min, 'number');
    assert.deepEqual(new Set(rows.map((r) => r.level)), new Set(['fbs', 'g5', 'p4']));
    for (const r of rows) assert.equal(r.qualifier_min, min, `${category} ${r.level} ${r.metric}`);
  }
  assert.equal(qualifierMin(CFB_2025.filter((r) => r.category === 'passing'), 'cfb'), 14);
  assert.equal(qualifierMin(CFB_2025.filter((r) => r.category === 'rushing'), 'cfb'), 6.25);
  assert.equal(qualifierMin(CFB_2025.filter((r) => r.category === 'receiving'), 'cfb'), 1.875);
});

test('qualifierMin reads the NFL’s league level; none (null) for a team category or a missing level', () => {
  assert.equal(qualifierMin(NFL_2025.filter((r) => r.category === 'passing'), 'nfl'), 14);
  assert.equal(qualifierMin(NFL_2025.filter((r) => r.category === 'receiving'), 'nfl'), 1.875);
  assert.equal(qualifierMin([{ metric: 'plays_off', level: 'fbs', qualifier_min: null }], 'cfb'), null);
  assert.equal(qualifierMin(CFB_2025.filter((r) => r.level === 'g5'), 'cfb'), null);
  assert.equal(qualifierMin([], 'nfl'), null);
  assert.equal(qualifierMin([{ level: 'nfl', qualifier_min: '14' }], 'nfl'), null); // a number, never a guess
});

test('the # cell explains a faded row in the gate’s own terms', () => {
  assert.equal(belowNote('40', '5', 14, 'dropbacks'), '40 dropbacks in 5 team games, below the qualifier (14 per team game = 70)');
  assert.equal(belowNote('9', '12', 1.875, 'plays'), '9 plays in 12 team games, below the qualifier (1.875 per team game = 22.5)');
});
