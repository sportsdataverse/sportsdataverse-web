import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WP_SPORTS } from '../content/wp.ts';
import { emptyWpMessage, gameOptionsFromSchedule, wpPointsFromRows } from '../lib/platform/wp.ts';

const sport = (key: string) => WP_SPORTS.find((s) => s.key === key)!;
const cfb = sport('cfb');

test('wpPointsFromRows drops a null WP, clamps to [0, 1] and defaults the period to 1', () => {
  // Data API rows exactly as cfb.pbp returns them (dotted clock column included).
  const rows = [
    { game_play_number: 1, home_wp_before: 0.5, period: 1, 'clock.displayValue': '15:00', text: 'Kickoff', homeScore: 0, awayScore: 0 },
    { game_play_number: 2, home_wp_before: null, period: 1, 'clock.displayValue': '14:52', text: 'Timeout', homeScore: 0, awayScore: 0 },
    { game_play_number: 3, home_wp_before: 0.61, period: null, 'clock.displayValue': '14:10', text: 'Run for 5', homeScore: 0, awayScore: 0 },
    { game_play_number: 4, home_wp_before: 1.2, period: 4, 'clock.displayValue': '0:00', text: 'End of game', homeScore: 31, awayScore: 24 },
  ];
  const points = wpPointsFromRows(rows, cfb.cols);
  assert.equal(points.length, 3);
  assert.deepEqual(points.map((p) => p.x), [1, 3, 4]);
  assert.equal(points[2].wp, 1);
  assert.equal(points[1].period, 1);
  assert.deepEqual(points[2], { x: 4, wp: 1, period: 4, clock: '0:00', text: 'End of game', score: '24-31' });
});

test('wpPointsFromRows clamps below 0 too, and a sport without clock/score columns gets empty strings', () => {
  const [p] = wpPointsFromRows([{ play_id: 40, home_wp: -0.1, qtr: 2, desc: 'Punt' }], sport('nfl').cols);
  assert.deepEqual(p, { x: 40, wp: 0, period: 2, clock: '', text: 'Punt', score: '' });
});

test('gameOptionsFromSchedule labels a row "W3 · Away @ Home" and stringifies the id', () => {
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 401628374, week: 3, home_team: 'Home', away_team: 'Away' }],
    cfb.schedule
  );
  assert.deepEqual(g, { id: '401628374', label: 'W3 · Away @ Home' });
});

test('gameOptionsFromSchedule: no week column means no week prefix (MBB display names)', () => {
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 401724927, home_display_name: 'Duke Blue Devils', away_display_name: 'UNC Tar Heels' }],
    sport('mbb').schedule
  );
  assert.equal(g.label, 'UNC Tar Heels @ Duke Blue Devils');
});

test('gameOptionsFromSchedule sorts by week, then home team (the old list order)', () => {
  const games = gameOptionsFromSchedule(
    [
      { game_id: 3, week: 2, home_team: 'Army', away_team: 'Navy' },
      { game_id: 2, week: 1, home_team: 'Texas', away_team: 'Rice' },
      { game_id: 1, week: 1, home_team: 'Auburn', away_team: 'UAB' },
    ],
    cfb.schedule
  );
  assert.deepEqual(games.map((g) => g.id), ['1', '2', '3']);
});

test('every WP null for a game explains that WP is not published for the sport-season', () => {
  const rows = [{ game_play_number: 1, home_win_prob: null, period_number: 1, text: 'Jump ball' }];
  const points = wpPointsFromRows(rows, sport('mbb').cols);
  assert.equal(emptyWpMessage(rows.length, points.length, 'MBB', '2024'), "WP isn't published for MBB 2024.");
});

test('a game with no plays at all keeps the generic empty state', () => {
  assert.equal(emptyWpMessage(0, 0, 'CFB', '2024'), 'No win-probability data for this game.');
});
