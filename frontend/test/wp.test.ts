import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WP_SPORTS } from '../content/wp.ts';
import { CHART_FALLBACK } from '../lib/platform/teamColor.ts';
import {
  emptyWpMessage,
  fillSegments,
  gameOptionsFromSchedule,
  loadSequencer,
  pbpParams,
  scheduleParams,
  teamColorLookup,
  teamsParams,
  wpExportFilename,
  wpExportText,
  wpPointsFromRows,
  wpTeamColors,
} from '../lib/platform/wp.ts';

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

test('gameOptionsFromSchedule labels a row "W3 · Away @ Home" and stringifies the ids', () => {
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 401628374, week: 3, home_team: 'Home', away_team: 'Away', home_id: 333, away_id: 61 }],
    cfb.schedule
  );
  assert.deepEqual({ id: g.id, label: g.label }, { id: '401628374', label: 'W3 · Away @ Home' });
  assert.deepEqual(g.home, { name: 'Home', key: '333', color: '', alt: '', score: '' });
  assert.deepEqual(g.away, { name: 'Away', key: '61', color: '', alt: '', score: '' });
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

// The API silently ignores an unknown filter column (cfb/schedule?bogus_col=1
// returns the whole season), so these exact params are the only typo guard.
test('scheduleParams: each sport reads only games that have plays', () => {
  const base = (schema: string, select: string) => ({ schema, table: 'schedule', season: '2024', select, limit: '50000' });
  const teams = 'game_id,week,home_team,away_team';
  const names = 'game_id,home_display_name,away_display_name,home_color,home_alternate_color,away_color,away_alternate_color';
  // The export header's date and final score ride on the same read.
  const cfbSelect = `${teams},home_id,away_id,start_date,home_points,away_points`;
  assert.deepEqual(scheduleParams(sport('cfb'), '2024'), { ...base('cfb', cfbSelect), home_division: 'fbs', completed: 'true' });
  assert.deepEqual(scheduleParams(sport('nfl'), '2024'), { ...base('nfl', `${teams},gameday,home_score,away_score`), home_score__gte: '0' });
  assert.deepEqual(scheduleParams(sport('mbb'), '2024'), { ...base('mbb', `${names},game_date,home_score,away_score`), PBP: 'true' });
  assert.deepEqual(scheduleParams(sport('wbb'), '2024'), { ...base('wbb', `${names},game_date,home_score,away_score`), PBP: 'true' });
});

test('pbpParams: one game, pruned to its season, only the columns the chart reads', () => {
  assert.deepEqual(pbpParams(cfb, '2024', '401628374'), {
    schema: 'cfb',
    table: 'pbp',
    season: '2024',
    game_id: '401628374',
    select: 'game_play_number,home_wp_before,period,clock.displayValue,text,homeScore,awayScore',
    order: 'game_play_number',
    limit: '50000',
  });
  assert.equal(pbpParams(sport('nfl'), '2024', '2024_01_BAL_KC').select, 'play_id,home_wp,qtr,desc');
});

test('loadSequencer: only the newest load may apply its response', () => {
  const loads = loadSequencer();
  const a = loads.next();
  const b = loads.next();
  assert.equal(loads.isLatest(a), false, 'an older completion is dropped');
  assert.equal(loads.isLatest(b), true);
  loads.next(); // resetForSport abandons whatever is in flight
  assert.equal(loads.isLatest(b), false);
});

// Binary fractions, so every interpolated crossing is exact.
test('fillSegments splits at every 0.5 crossing, with interpolated crossing points', () => {
  const segs = fillSegments([0.625, 0.75, 0.25, 0.375, 0.875].map((wp) => ({ wp })));
  assert.deepEqual(segs, [
    { side: 'home', pts: [[0, 0.5], [0, 0.625], [1, 0.75], [1.5, 0.5]] },
    { side: 'away', pts: [[1.5, 0.5], [2, 0.25], [3, 0.375], [3.25, 0.5]] },
    { side: 'home', pts: [[3.25, 0.5], [4, 0.875], [4, 0.5]] },
  ]);
});

test('fillSegments: touching 0.5 is not a crossing; passing through a 0.5 play splits there', () => {
  assert.equal(fillSegments([0.75, 0.5, 0.75].map((wp) => ({ wp }))).length, 1);
  assert.deepEqual(
    fillSegments([0.75, 0.5, 0.25].map((wp) => ({ wp }))).map((s) => [s.side, s.pts.at(-1)]),
    [['home', [1, 0.5]], ['away', [2, 0.5]]]
  );
  // A 0.5 opening play takes the side of the first play off 0.5, so no empty home sliver.
  assert.deepEqual(fillSegments([0.5, 0.25, 0.375].map((wp) => ({ wp }))).map((s) => s.side), ['away']);
  assert.deepEqual(fillSegments([]), []);
});

test('fillSegments: every polygon stays on its own side of 0.5', () => {
  const wps = Array.from({ length: 200 }, (_, i) => 0.5 + 0.45 * Math.sin(i / 7) * Math.cos(i / 23));
  for (const s of fillSegments(wps.map((wp) => ({ wp })))) {
    for (const [, wp] of s.pts) assert.ok(s.side === 'home' ? wp >= 0.5 : wp <= 0.5, `${s.side} ${wp}`);
  }
});

test('teamsParams: CFB and NFL read their team colour table once, MBB/WBB need none', () => {
  assert.deepEqual(teamsParams(cfb), { schema: 'cfb', table: 'team_info', select: 'team_id,color,alt_color', limit: '50000' });
  assert.deepEqual(teamsParams(sport('nfl')), { schema: 'nfl', table: 'teams', select: 'team_abbr,team_color,team_color2', limit: '50000' });
  assert.equal(teamsParams(sport('mbb')), null);
  assert.equal(teamsParams(sport('wbb')), null);
});

// Live cfb.team_info rows (2026-09-28): int team_id, hex with the hash.
const teamInfo = [
  { team_id: 333, color: '#9e1b32', alt_color: '#ffffff' }, // Alabama
  { team_id: 61, color: '#ba0c2f', alt_color: '#2c2a29' }, // Georgia
  { team_id: 2, color: '#0c2340', alt_color: '#f26522' }, // Auburn
];
const cfbGame = (homeId: number, awayId: number) =>
  gameOptionsFromSchedule([{ game_id: 1, week: 1, home_team: 'H', away_team: 'A', home_id: homeId, away_id: awayId }], cfb.schedule)[0];

test('wpTeamColors passes the resolved theme to pickTeamColors (Alabama vs Georgia, Alabama vs Auburn)', () => {
  const lookup = teamColorLookup(teamInfo, cfb.teams!);
  // Light: near-identical crimsons (dE 5.7), so Georgia steps to its alternate.
  assert.deepEqual(wpTeamColors(cfbGame(333, 61), lookup, 'light'), { home: '#9e1b32', away: '#2c2a29' });
  // Dark: Alabama crimson is 2.18:1 on the dark card, so white; Auburn navy
  // would be navy on navy, so it steps to its orange alternate.
  assert.deepEqual(wpTeamColors(cfbGame(333, 2), lookup, 'dark'), { home: '#ffffff', away: '#f26522' });
  assert.deepEqual(wpTeamColors(cfbGame(333, 2), lookup, 'light'), { home: '#9e1b32', away: '#0c2340' });
  // Before next-themes mounts, resolvedTheme is undefined: the site default, dark.
  assert.deepEqual(wpTeamColors(cfbGame(333, 2), lookup, undefined), { home: '#ffffff', away: '#f26522' });
});

test('wpTeamColors: MBB colours ride on the schedule row; a near-identical away colour walks to chart-cat-2', () => {
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 1, home_display_name: 'H', away_display_name: 'A', home_color: '2a78d6', home_alternate_color: null, away_color: '2b79d7', away_alternate_color: null }],
    sport('mbb').schedule
  );
  // Away's own blue and chart-cat-1 are both within 15 dE of home's blue.
  assert.deepEqual(wpTeamColors(g, undefined, 'light'), { home: '#2a78d6', away: CHART_FALLBACK.light[1] });
});

test('wpTeamColors: a null colour, or a team missing from the lookup, falls back without a crash', () => {
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 1, home_display_name: 'H', away_display_name: 'A', home_color: null, home_alternate_color: null, away_color: null, away_alternate_color: null }],
    sport('wbb').schedule
  );
  assert.deepEqual(wpTeamColors(g, undefined, 'dark'), { home: CHART_FALLBACK.dark[0], away: CHART_FALLBACK.dark[1] });
  // An FCS id not in cfb.team_info, and the lookup not loaded yet.
  const lookup = teamColorLookup([{ team_id: 333, color: null, alt_color: null }], cfb.teams!);
  assert.deepEqual(wpTeamColors(cfbGame(333, 99999), lookup, 'light'), { home: CHART_FALLBACK.light[0], away: CHART_FALLBACK.light[1] });
  assert.deepEqual(wpTeamColors(cfbGame(333, 61), undefined, 'light'), { home: CHART_FALLBACK.light[0], away: CHART_FALLBACK.light[1] });
});

test('wpExportFilename: sport key + game id', () => {
  assert.equal(wpExportFilename('cfb', '401628374'), 'wp_cfb_401628374.png');
  assert.equal(wpExportFilename('nfl', '2024_01_BAL_KC'), 'wp_nfl_2024_01_BAL_KC.png');
});

const PAGE = 'https://sportsdataverse.org/platform/wp?sport=cfb&season=2024&game=401628374';

test('wpExportText: "Away @ Home · final A–H · date" over "URL · data as of <asset time>"', () => {
  // cfb.schedule start_date is a UTC kickoff: 02:30Z on the 15th is 10:30 PM ET on the 14th.
  const [g] = gameOptionsFromSchedule(
    [{ game_id: 401628374, week: 3, home_team: 'Home', away_team: 'Away', home_id: 333, away_id: 61, start_date: '2024-09-15T02:30:00.000Z', home_points: 42, away_points: 10 }],
    cfb.schedule
  );
  assert.deepEqual(wpExportText(g, PAGE, '2026-09-20T14:03:11Z'), {
    title: 'Away @ Home · final 10–42 · Sep 14, 2024',
    footer: `${PAGE} · data as of 2026-09-20 14:03 UTC`,
  });
});

test('wpExportText: a plain schedule date is that day; a 0 score is a score; missing parts drop out', () => {
  const nfl = (row: Record<string, unknown>) =>
    gameOptionsFromSchedule([{ game_id: '2024_01_BAL_KC', week: 1, home_team: 'KC', away_team: 'BAL', ...row }], sport('nfl').schedule)[0];
  assert.equal(wpExportText(nfl({ gameday: '2024-09-05', home_score: 27, away_score: 0 }), PAGE).title, 'BAL @ KC · final 0–27 · Sep 5, 2024');
  assert.deepEqual(wpExportText(nfl({ home_score: null, away_score: null }), PAGE), { title: 'BAL @ KC', footer: PAGE });
  // MBB game_date is already the local (ET) date.
  const [m] = gameOptionsFromSchedule(
    [{ game_id: 401746082, home_display_name: 'Houston Cougars', away_display_name: 'Florida Gators', game_date: '2025-04-07', home_score: 63, away_score: 65 }],
    sport('mbb').schedule
  );
  assert.equal(wpExportText(m, PAGE).title, 'Florida Gators @ Houston Cougars · final 65–63 · Apr 7, 2025');
});
