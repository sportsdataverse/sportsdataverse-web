import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityColumn, labelColumn, pinIdentity, transposePinned } from '../lib/platform/gridCompare.ts';
import { gridViewParams, parseGridView, EMPTY_GRID } from '../lib/platform/viewState.ts';

test('the identity column is the first present of athlete_id, player_id, person_id, team_id, game_id, in that priority', () => {
  assert.equal(identityColumn(['season', 'player_id', 'team_id']), 1);
  // priority, not column order: cfb.passing lists team_id before player_id
  assert.equal(identityColumn(['team_id', 'pos_team', 'season', 'player_id', 'passer_player_name']), 3);
  assert.equal(identityColumn(['game_id', 'team_id', 'athlete_id']), 2);
  assert.equal(identityColumn(['game_id', 'person_id']), 1);
  assert.equal(identityColumn(['game_id', 'play_id']), 0);
  assert.equal(identityColumn(['season', 'team', 'adj_em']), -1);
  assert.equal(identityColumn(['home_team_id', 'player_idx']), -1); // whole names only
  assert.equal(identityColumn([]), -1);
});

test('pins key on the identity column only when it names every row once', () => {
  const cols = ['season', 'player_id', 'name'];
  assert.equal(pinIdentity(cols, [['2025', '1', 'a'], ['2025', '2', 'b']]), 1);
  // a result spanning seasons repeats a player: the id no longer names one row
  assert.equal(pinIdentity(cols, [['2024', '1', 'a'], ['2025', '1', 'a']]), -1);
  assert.equal(pinIdentity(cols, [['2025', null, 'a'], ['2025', '2', 'b']]), -1);
  assert.equal(pinIdentity(cols, [['2025', '', 'a']]), -1);
  assert.equal(pinIdentity(['season', 'name'], [['2025', 'a']]), -1);
  assert.equal(pinIdentity(cols, []), 1); // nothing to collide
});

test('pins key on the first id column, in priority order, that names every row once', () => {
  // a box score: game_id repeats per team, team_id names each row of one game once
  assert.equal(pinIdentity(['game_id', 'team_id', 'pts'], [['9', '1', '80'], ['9', '2', '77']]), 1);
  // the higher-priority id wins when it is unique too
  assert.equal(pinIdentity(['team_id', 'player_id'], [['1', '10'], ['1', '11']]), 1);
  // a team's game log: team_id outranks game_id but repeats, so game_id keys the pins
  assert.equal(pinIdentity(['game_id', 'team_id'], [['401', '5'], ['402', '5']]), 0);
  assert.equal(pinIdentity(['game_id', 'team_id'], [['9', '1'], ['9', '1']]), -1);
});

test('pins key on an id only when every value survives the grid.pin round trip', () => {
  const round = (col: string, values: string[]) => {
    const p = new URLSearchParams();
    gridViewParams({ ...EMPTY_GRID, pin: { col, values } }, p);
    return parseGridView(p).pin?.values;
  };
  const ok = [['KC'], ['2426'], ['a.b-c_d']];
  assert.equal(pinIdentity(['team_id'], ok), 0);
  assert.deepEqual(round('team_id', ok.map((r) => r[0])), ok.map((r) => r[0]));
  // a comma splits into two other pins; a space is dropped: neither may key a pin
  for (const bad of ['a,b', 'Ohio St', '9'.repeat(201), 'x<y']) {
    assert.notDeepEqual(round('team_id', [bad]), [bad], bad);
    assert.equal(pinIdentity(['team_id'], [['1'], [bad]]), -1, bad);
  }
  // ... and the next id column that does round-trip keys it instead
  assert.equal(pinIdentity(['team_id', 'game_id'], [['Ohio St', '1'], ['Iowa St', '2']]), 1);
});

test('the label column is the first *name column, or a bare team', () => {
  assert.equal(labelColumn(['team_id', 'pos_team', 'season', 'player_id', 'passer_player_name', 'team_name']), 4);
  assert.equal(labelColumn(['team', 'rank', 'adj_em', 'team_id']), 0);
  assert.equal(labelColumn(['player_name', 'team_abbreviation', 'rapm']), 0);
  assert.equal(labelColumn(['game_id', 'yards', 'names_n', 'teamname']), -1);
  // pos_team names the team tables' rows, but never outranks a player's name
  assert.equal(labelColumn(['team_id', 'pos_team', 'division', 'season', 'plays_off']), 1);
  assert.equal(labelColumn(['pos_team', 'player_id', 'passer_player_name']), 2);
});

const COLS = ['player_id', 'name', 'EPAplay', 'EPAplay_rank', 'EPAplay_pct', 'EPAplay_n', 'fg_pct'];
const ROWS = [
  ['10', 'Ann', '0.30', '4', '96', '300', '0.51'],
  ['11', 'Bea', '-0.10', '80', '12', '250', '0.44'],
  ['12', 'Cal', null, null, null, '3', '0.40'],
];

test('transposePinned: one entry per column in column order, values in PIN order', () => {
  const rows = [['Ann', '0.3'], ['Bea', '-0.1'], ['Cal', '0.0']];
  assert.deepEqual(transposePinned(['name', 'EPAplay'], rows, [2, 0]), [
    { metric: 'name', values: ['Cal', 'Ann'] },
    { metric: 'EPAplay', values: ['0.0', '0.3'] },
  ]);
  assert.deepEqual(transposePinned(['name', 'EPAplay'], rows, []), [
    { metric: 'name', values: [] },
    { metric: 'EPAplay', values: [] },
  ]);
});

test('transposePinned leaves out the columns the tray is headed by, when given', () => {
  const rows = [['1', 'Ann', '0.3'], ['2', 'Bea', '-0.1']];
  const cols = ['game_id', 'name', 'EPA'];
  // session pins (no id keys them): the tray is headed by the label, so game_id is a metric row
  assert.deepEqual(transposePinned(cols, rows, [1], [1]).map((m) => m.metric), ['game_id', 'EPA']);
  assert.deepEqual(transposePinned(cols, rows, [1], [1, 0]).map((m) => m.metric), ['EPA']);
});

test('transposePinned leaves out the identity column and each X_pct that shades its X; _rank, _n and plain rates stay', () => {
  const out = transposePinned(COLS, ROWS, [1, 2, 0]);
  assert.deepEqual(out.map((m) => m.metric), ['name', 'EPAplay', 'EPAplay_rank', 'EPAplay_n', 'fg_pct']);
  assert.deepEqual(out[1], { metric: 'EPAplay', values: ['-0.10', null, '0.30'] }); // null stays null
  assert.deepEqual(out[2].values, ['80', null, '4']);
});
