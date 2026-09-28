import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PANELS, MAX_TRENDS_TEAMS, addTeam, assertGroupKeys, assertGroupsJoin, capPanels, pickGroup, sharedDomain, teamGroups, bandRuns, bandWithin, displayDecimals, endLabels, formatValue, lastPlayedWeek,
  leagueBand, loadLeague, pickSlots, rankColumn, rankLabel, releaseKey, removeTeam, spreadLabels, statColumns, statGroups,
  teamNameLookup, wideToSeries,
} from '../lib/platform/trends.ts';
import { parseTrendsView, trendsViewParams } from '../lib/platform/viewState.ts';
import { CATEGORICAL } from '../lib/platform/chartTokens.ts';
import { TREND_SPORTS } from '../content/trends.ts';

test('the overlay holds one team per categorical slot', () => {
  assert.equal(MAX_TRENDS_TEAMS, CATEGORICAL.length);
  assert.equal(MAX_TRENDS_TEAMS, 6);
});

test('addTeam appends, ignores a duplicate, and refuses a 7th pick instead of cycling', () => {
  assert.deepEqual(addTeam(['A'], 'B'), { teams: ['A', 'B'], refused: false });
  assert.deepEqual(addTeam(['A', 'B'], 'A'), { teams: ['A', 'B'], refused: false });
  const six = ['A', 'B', 'C', 'D', 'E', 'F'];
  assert.deepEqual(addTeam(six, 'G'), { teams: six, refused: true });
  assert.deepEqual(addTeam(six, 'C'), { teams: six, refused: false }); // already on: not a refusal
});

test('addTeam fills the first gap before growing the list', () => {
  assert.deepEqual(addTeam([null, 'B', 'C'], 'D'), { teams: ['D', 'B', 'C'], refused: false });
  const gapped = ['A', 'B', null, 'D', 'E', 'F'];
  assert.deepEqual(addTeam(gapped, 'G'), { teams: ['A', 'B', 'G', 'D', 'E', 'F'], refused: false });
});

test('removing #1 leaves #2 in cat-2: a removal leaves a gap, never shifts', () => {
  const after = removeTeam(['A', 'B', 'C'], 'A');
  assert.deepEqual(after, [null, 'B', 'C']);
  assert.deepEqual(pickSlots(after), [{ team: 'B', slot: 'cat-2' }, { team: 'C', slot: 'cat-3' }]);
  assert.deepEqual(removeTeam(['A', 'B', 'C'], 'C'), ['A', 'B']); // no trailing gap
  assert.deepEqual(removeTeam(['A', null, 'C'], 'C'), ['A']);
});

test('the next add fills cat-1', () => {
  const next = addTeam(removeTeam(['A', 'B', 'C'], 'A'), 'D').teams;
  assert.deepEqual(pickSlots(next).map((p) => `${p.team}:${p.slot}`), ['D:cat-1', 'B:cat-2', 'C:cat-3']);
});

test('a gap survives a URL round-trip', () => {
  const v = { sport: 'nba', teams: [null, 'B', null, 'D'], stat: 'avgPoints', season: '', view: 'overlay' as const, group: '' };
  const qs = trendsViewParams(v).toString();
  assert.equal(qs, 'sport=nba&team=&team=B&team=&team=D&stat=avgPoints');
  assert.deepEqual(parseTrendsView(new URLSearchParams(qs)), v);
  assert.deepEqual(pickSlots(parseTrendsView(new URLSearchParams(qs)).teams).map((p) => p.slot), ['cat-2', 'cat-4']);
});

const GAP = 14;
/** Every pair of labels at least `gap` apart. */
function spaced(ys: number[], gap: number) {
  const s = [...ys].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] >= gap - 1e-9, `${s[i - 1]} and ${s[i]} overlap`);
}

test('spreadLabels leaves labels that already clear each other where their lines end', () => {
  assert.deepEqual(spreadLabels([10, 100, 200], GAP, 0, 240), [10, 100, 200]);
});

test('spreadLabels nudges colliding labels apart and keeps their top-to-bottom order', () => {
  const ys = [100, 105, 103, 104];
  const out = spreadLabels(ys, GAP, 0, 240);
  spaced(out, GAP);
  assert.equal(out[0], 100); // the topmost label stays on its line
  // the same order by y as the line ends: 0, 2, 3, 1
  assert.deepEqual([0, 1, 2, 3].sort((a, b) => out[a] - out[b]), [0, 2, 3, 1]);
});

test('spreadLabels keeps a crowd inside the plot: pushed up off the bottom, down off the top', () => {
  const bottom = spreadLabels([236, 238, 240], GAP, 0, 240);
  spaced(bottom, GAP);
  assert.deepEqual(bottom, [212, 226, 240]);
  const top = spreadLabels([-4, 2], GAP, 0, 240);
  assert.deepEqual(top, [0, 14]);
});

test('spreadLabels breaks a tie by series order', () => {
  assert.deepEqual(spreadLabels([50, 50, 50], GAP, 0, 240), [50, 64, 78]);
});

// --- CFB/NFL weekly (wide) sources ---------------------------------------------

const source = (key: string) => {
  const s = TREND_SPORTS.find((t) => t.key === key);
  assert.ok(s, `no ${key} source`);
  return s;
};

// runQuery hands every cell back as a string (null stays null), so the fixture does too.
test('wideToSeries: 2 teams over weeks give 2 series, each ordered by week', () => {
  const rows = [
    { team_id: '194', through_week: '2', adj_net: '0.25' },
    { team_id: '130', through_week: '1', adj_net: '0.1' },
    { team_id: '194', through_week: '1', adj_net: '-0.05' },
  ];
  assert.deepEqual(wideToSeries(rows, 'through_week', 'team_id', 'adj_net'), [
    { team: '194', points: [{ x: 1, value: -0.05 }, { x: 2, value: 0.25 }] },
    { team: '130', points: [{ x: 1, value: 0.1 }] },
  ]);
});

test('wideToSeries drops a row with a null (or NaN) stat instead of charting it as 0', () => {
  const rows = [
    { team_id: '194', through_week: '1', adj_net: '0.2' },
    { team_id: '194', through_week: '2', adj_net: null },
    { team_id: '130', through_week: '1', adj_net: null },
    { team_id: '130', through_week: '2', adj_net: 'NaN' }, // a parquet float NaN, stringified
  ];
  assert.deepEqual(wideToSeries(rows, 'through_week', 'team_id', 'adj_net'), [
    { team: '194', points: [{ x: 1, value: 0.2 }] },
  ]);
});

test('teamNameLookup joins release ids to a Data API team table by a number key', () => {
  const names = source('cfb_ratings_weekly').names!;
  const api = [{ team_id: 194, school: 'Ohio State' }, { team_id: 130, school: 'Michigan' }, { team_id: 2, school: 'Auburn' }];
  const lookup = teamNameLookup([194, 130, 999], api, names);
  assert.deepEqual([...lookup], [[194, 'Ohio State'], [130, 'Michigan'], [999, '999']]); // a miss shows its id, never nothing
});

test('teamNameLookup throws on a string team_id on either side of the join', () => {
  const names = source('cfb_ratings_weekly').names!;
  assert.throws(() => teamNameLookup([194], [{ team_id: '194', school: 'Ohio State' }], names), /cfb\.team_info\.team_id/);
  assert.throws(() => teamNameLookup(['194'], [{ team_id: 194, school: 'Ohio State' }], names), /release/);
  assert.throws(() => teamNameLookup([Number('x')], [{ team_id: 194, school: 'Ohio State' }], names), /release/); // NaN is no id
});

test('NFL ratings join abbreviations to nfl.teams.team_abbr; its numeric team_id is refused', () => {
  const names = source('nfl_ratings_weekly').names!;
  const api = [{ team_abbr: 'KC', team_id: 2310, team_name: 'Kansas City Chiefs' }, { team_abbr: 'LA', team_id: 2510, team_name: 'Los Angeles Rams' }];
  assert.deepEqual([...teamNameLookup(['KC', 'LA'], api, names)], [['KC', 'Kansas City Chiefs'], ['LA', 'Los Angeles Rams']]);
  assert.throws(() => teamNameLookup(['KC'], api, { ...names, key: 'team_id' }), /nfl\.teams\.team_id/);
  assert.throws(() => teamNameLookup([''], api, names), /release/); // an empty key is no team
});

test('teamNameLookup never gives two release teams the same name', () => {
  const names = source('nfl_ratings_weekly').names!;
  const api = [{ team_abbr: 'LA', team_name: 'Los Angeles Rams' }, { team_abbr: 'LAR', team_name: 'Los Angeles Rams' }];
  assert.deepEqual([...teamNameLookup(['LA', 'LAR'], api, names).values()], ['Los Angeles Rams', 'Los Angeles Rams (LAR)']);
});

test('releaseKey takes a number-keyed release id only when it is all digits', () => {
  assert.equal(releaseKey('194', 'number'), 194);
  // DuckDB CAST(… AS BIGINT) would accept every one of these.
  for (const bad of ['12.5', ' 12 ', '1e2', '0x1F', '1_000', '']) assert.throws(() => releaseKey(bad, 'number'), /digits/);
  assert.equal(releaseKey('KC', 'string'), 'KC');
});

test('lastPlayedWeek trims a forward-filled tail and keeps every week that moved', () => {
  const pairs = (totals: number[], first = 1) => totals.map((gamesTotal, i) => ({ week: first + i, gamesTotal }));
  // CFB 2026 as published: games stop at week 4, weeks 5-15 repeat it.
  assert.equal(lastPlayedWeek(pairs([102, 200, 314, 430, 430, 430, 430, 430, 430, 430, 430, 430, 430, 430, 430])), 4);
  // CFB 2025: a partial postseason still adds games, so both bowl weeks stay.
  assert.equal(lastPlayedWeek(pairs([1370, 1504, 1522, 1524], 13)), 16);
  // Strictly increasing, in any row order: nothing to trim.
  assert.equal(lastPlayedWeek([{ week: 4, gamesTotal: 96 }, { week: 2, gamesTotal: 32 }, { week: 3, gamesTotal: 64 }]), 4);
  // Only the flat TAIL goes: a dip and recovery mid-season is not a tail.
  assert.equal(lastPlayedWeek(pairs([10, 20, 15, 15, 20, 20])), 5);
  assert.equal(lastPlayedWeek([]), Infinity); // nothing to go on: no trim
  // A total that is not a number (DuckDB-WASM hands a HUGEINT sum back as an
  // object) must fail loudly, not quietly skip the trim.
  assert.throws(() => lastPlayedWeek(pairs([10, NaN, 20])), /games total/);
});

test('statColumns lists numeric columns, never the team, season, week or an id', () => {
  const described = [
    { name: 'season', type: 'BIGINT' },
    { name: 'team_id', type: 'VARCHAR' },
    { name: 'adj_net', type: 'DOUBLE' },
    { name: 'games', type: 'BIGINT' },
    { name: 'venue_id', type: 'BIGINT' },
    { name: 'plays_off', type: 'UINTEGER' },
    { name: 'share', type: 'DECIMAL(9,3)' },
    { name: 'conference', type: 'VARCHAR' },
    { name: 'through_week', type: 'INTEGER' },
    { name: 'playsgame_off_n', type: 'BIGINT' }, // a sample size, not a stat
    { name: 'success_def_n', type: 'BIGINT' },
  ];
  assert.deepEqual(statColumns(described, source('cfb_ratings_weekly').cols), ['adj_net', 'games', 'plays_off', 'share']);
});

test('statGroups: side, pass/rush, margin, other, then every rank; each sorted ignoring case', () => {
  const stats = [
    'yards_off', 'TEPA_off', 'havoc_off', 'EPAplay_off_rank', 'success_def', 'EPAplay_def_pass', 'havoc_off_rush',
    'TEPA_off_pass', 'EPAplay_margin', 'success_margin_rush', 'net_adj_epa', 'valid_games', 'adj_off_epa', 'havoc_def_rank',
  ];
  assert.deepEqual(statGroups(stats), [
    { label: 'Offense', stats: ['havoc_off', 'TEPA_off', 'yards_off'] },
    { label: 'Defense', stats: ['success_def'] },
    { label: 'Offense pass/rush', stats: ['havoc_off_rush', 'TEPA_off_pass'] },
    { label: 'Defense pass/rush', stats: ['EPAplay_def_pass'] },
    { label: 'Margin', stats: ['EPAplay_margin', 'success_margin_rush'] },
    { label: 'Other', stats: ['adj_off_epa', 'net_adj_epa', 'valid_games'] },
    { label: 'Ranks', stats: ['EPAplay_off_rank', 'havoc_def_rank'] },
  ]);
  assert.deepEqual(statGroups(['yards_off']).map((g) => g.label), ['Offense']); // empty groups dropped
});

test('only CFB team summaries group their stat picker; ratings keep a flat list', () => {
  assert.deepEqual(TREND_SPORTS.filter((s) => s.groupStats).map((s) => s.key), ['cfb_team_summaries_weekly']);
});

test('each weekly source names its weeks and the games column that dates them', () => {
  const weekly = TREND_SPORTS.filter((s) => s.xAxis === 'week');
  assert.deepEqual(weekly.map((s) => [s.key, s.cols.week, s.cols.games, s.weekLabel]), [
    ['cfb_team_summaries_weekly', 'through_week', 'playsgame_off_n', 'Through week'],
    ['cfb_ratings_weekly', 'through_week', 'games', 'Through week'],
    ['nfl_ratings_weekly', 'as_of_week', 'games', 'Entering week'], // as_of_week W = the rating entering week W
  ]);
});

test('end labels sit in one column at the plot edge, spread even when their lines end at different x', () => {
  // Line 0 ends mid-plot (its season ended earlier) at the same height as line 1.
  const labels = endLabels([100, 100], 400, GAP, 0, 240);
  assert.deepEqual(labels.map((l) => l.x), [400, 400]);
  spaced(labels.map((l) => l.y), GAP);
  assert.equal(labels[0].y, 100); // the earlier-ending line keeps its height, above
});

// --- League band and rank context --------------------------------------------------

const near = (got: number | null, want: number) => assert.ok(got !== null && Math.abs(got - want) < 1e-12, `${got} is not ${want}`);

test('leagueBand: mean 0.05 / sd 0.1 is a band from -0.05 to 0.15, sorted by x', () => {
  const band = leagueBand([{ x: 2, mean: 0.2, sd: 0.1, n: 136 }, { x: 1, mean: 0.05, sd: 0.1, n: 136 }]);
  assert.deepEqual(band.map((b) => [b.x, b.n]), [[1, 136], [2, 136]]);
  near(band[0].lo, -0.05);
  near(band[0].hi, 0.15);
  assert.equal(band[0].mean, 0.05);
});

test('leagueBand draws the mean only where there is no sd or fewer than 2 teams', () => {
  const band = leagueBand([{ x: 1, mean: 0.3, sd: null, n: 5 }, { x: 2, mean: 0.4, sd: 0.1, n: 1 }]);
  assert.deepEqual(band, [{ x: 1, mean: 0.3, lo: null, hi: null, n: 5 }, { x: 2, mean: 0.4, lo: null, hi: null, n: 1 }]);
});

test('leagueBand throws on a mean that is not a number instead of charting NaN', () => {
  // DuckDB-WASM hands an uncast HUGEINT back as an object: Number() of it is NaN.
  assert.throws(() => leagueBand([{ x: 3, mean: NaN, sd: 0.1, n: 136 }]), /league mean/);
});

test('the band is trimmed with the lines: no band past the last charted week', () => {
  // CFB 2026: the file runs to week 15, the lines stop at lastPlayedWeek (4).
  const band = leagueBand(Array.from({ length: 15 }, (_, i) => ({ x: i + 1, mean: 0.1, sd: 0.2, n: 136 })));
  assert.deepEqual(bandWithin(band, [1, 2, 3, 4, 1, 2]).map((b) => b.x), [1, 2, 3, 4]);
  // Hoops: every season has a mean, the lines span only some: none outside them.
  // A removal that shortens the lines shortens the band the same way.
  assert.deepEqual(bandWithin(band, [3, 5]).map((b) => b.x), [3, 4, 5]);
  assert.deepEqual(bandWithin(band, []), []); // no lines, no band
});

const bp = (x: number, spread = true) => ({ x, mean: 0, lo: spread ? -1 : null, hi: spread ? 1 : null, n: 2 });
const xsOf = (runs: { x: number }[][]) => runs.map((run) => run.map((b) => b.x));

test('bandRuns splits the filled band where a week has no sd; single points are left to the mean line', () => {
  const band = [bp(1), bp(2), bp(3, false), bp(4), bp(5, false), bp(6), bp(7), bp(8)];
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(xsOf(bandRuns(band, xs)), [[1, 2], [6, 7, 8]]);
  assert.deepEqual(xsOf(bandRuns(band, xs, false)), [[1, 2, 3, 4, 5, 6, 7, 8]]); // the mean line needs no sd
  assert.deepEqual(bandRuns([], xs), []);
});

test('bandRuns never bridges a charted x with no league value (a season with no D-I list)', () => {
  const band = [bp(2019), bp(2020), bp(2022), bp(2023)]; // 2021 is charted, but has no band point
  assert.deepEqual(xsOf(bandRuns(band, [2019, 2020, 2021, 2022, 2023])), [[2019, 2020], [2022, 2023]]);
  assert.deepEqual(xsOf(bandRuns(band, [2019, 2020, 2021, 2022, 2023], false)), [[2019, 2020], [2022, 2023]]);
  // A league x no line has is no gap: nothing charted there to leave out.
  assert.deepEqual(xsOf(bandRuns(band, [2019, 2023])), [[2019, 2020, 2022, 2023]]);
});

test('loadLeague: a failed query or a NaN mean leaves no band and no rank count, never an error', async () => {
  const of = new Map([[1, 136]]);
  const ok = await loadLeague(async () => ({ rows: [{ x: 1, mean: 0.05, sd: 0.1, n: 136 }], of }));
  assert.deepEqual([ok.band.length, ok.of.get(1), ok.failed], [1, 136, undefined]);
  // DuckDB's stddev_samp raises on an inf ("out of range"): the lines chart without the band.
  const failed = await loadLeague(async () => {
    throw new Error('Out of Range Error: STDDEV_SAMP is out of range!');
  });
  assert.deepEqual([failed.band, failed.of.size], [[], 0]);
  assert.match(failed.failed ?? '', /out of range/);
  const nan = await loadLeague(async () => ({ rows: [{ x: 1, mean: NaN, sd: 0.1, n: 136 }], of }));
  assert.deepEqual([nan.band, nan.of.size], [[], 0]);
  assert.match(nan.failed ?? '', /league mean/);
});

test('assertGroupsJoin: an integer release id joins a text groups id; a float or text release id throws', () => {
  const ok = { fileTeam: 'INTEGER', fileSeason: 'INTEGER', groupsTeam: 'VARCHAR', groupsSeason: 'INTEGER' };
  assert.doesNotThrow(() => assertGroupsJoin(ok));
  assert.doesNotThrow(() => assertGroupsJoin({ ...ok, fileTeam: 'BIGINT' }));
  // A DOUBLE id would stringify as "103.0" and match no D-I team at all.
  assert.throws(() => assertGroupsJoin({ ...ok, fileTeam: 'DOUBLE' }), /team_id/);
  assert.throws(() => assertGroupsJoin({ ...ok, fileTeam: 'VARCHAR' }), /team_id/);
  assert.throws(() => assertGroupsJoin({ ...ok, groupsTeam: 'INTEGER' }), /team_id/);
  assert.throws(() => assertGroupsJoin({ ...ok, groupsSeason: 'VARCHAR' }), /season/);
  assert.throws(() => assertGroupsJoin({ ...ok, fileSeason: 'DOUBLE' }), /season/);
});

test('only the college hoops sources limit their band to D-I, from their groups release', () => {
  assert.deepEqual(TREND_SPORTS.filter((s) => s.groups.d1Band).map((s) => [s.key, s.groups.tag, s.groups.members]), [
    ['mbb', 'mbb_groups', 'mbb_team_group_seasons.parquet'],
    ['wbb', 'wbb_groups', 'wbb_team_group_seasons.parquet'],
  ]);
});

test('formatValue: at most 3 decimals, or the source\'s own; a value rounding to zero is never -0', () => {
  assert.equal(formatValue(0.24731), '0.247');
  assert.equal(formatValue(-1.695692197767329e-16), '0'); // NFL adj_net's league mean
  assert.equal(formatValue(42.327668700000004, 1), '42.3');
  assert.equal(formatValue(42, 1), '42.0');
  assert.equal(formatValue(-0.01, 1), '0.0');
  assert.equal(formatValue(-0.25, 1), '-0.3');
});

test('displayDecimals reads the precision of a source\'s display strings', () => {
  assert.equal(displayDecimals(['46.9', '39.4', '2.0']), 1);
  assert.equal(displayDecimals(['3,421', '47']), 0);
  assert.equal(displayDecimals(['47', '46.9']), 1); // the widest string wins, wherever it sits
  assert.equal(displayDecimals(['45.25%', '1.5']), 2);
  assert.equal(displayDecimals([]), 0);
});

test('rankLabel reads "#12 of 136", a .5 tie as "#T-7" (GOP formatRank); no rank or no count, no label', () => {
  assert.equal(rankLabel(12, 136), '#12 of 136');
  // The summaries rank ties by average (R rank()): 7.5 is a two-way tie for 7th.
  assert.equal(rankLabel(7.5, 136), '#T-7 of 136');
  assert.equal(rankLabel(5.5, 83), '#T-5 of 83');
  assert.equal(rankLabel(8.0, 136), '#8 of 136');
  assert.equal(rankLabel(null, 136), null);
  assert.equal(rankLabel(NaN, 136), null);
  assert.equal(rankLabel(8, undefined), null); // the league query failed: no "of"
});

test('rankColumn: <stat>_rank when the file has it, the ratings map otherwise, never a guess', () => {
  const summaries = source('cfb_team_summaries_weekly');
  assert.equal(rankColumn('EPAplay_off', ['EPAplay_off', 'EPAplay_off_rank'], summaries.ranks), 'EPAplay_off_rank');
  assert.equal(rankColumn('EPAplay_off_n', ['EPAplay_off_n', 'EPAplay_off_rank'], summaries.ranks), null);
  for (const key of ['cfb_ratings_weekly', 'nfl_ratings_weekly']) {
    const { ranks } = source(key);
    assert.deepEqual(ranks, { adj_off_epa: 'off_rank', adj_def_epa: 'def_rank', adj_net: 'net_rank' });
    const cols = ['adj_net', 'adj_def_epa', 'adj_st_epa', 'net_rank', 'off_rank'];
    assert.equal(rankColumn('adj_net', cols, ranks), 'net_rank');
    assert.equal(rankColumn('adj_st_epa', cols, ranks), null); // no producer rank for it
    assert.equal(rankColumn('adj_def_epa', cols, ranks), null); // mapped, but not in this file
  }
});

test('wideToSeries carries the row\'s own rank when asked; a null rank stays null', () => {
  const rows = [
    { pos_team: 'Ohio State', through_week: '1', EPAplay_off: '0.2', EPAplay_off_rank: '8' },
    { pos_team: 'Ohio State', through_week: '2', EPAplay_off: '0.3', EPAplay_off_rank: null },
  ];
  assert.deepEqual(wideToSeries(rows, 'through_week', 'pos_team', 'EPAplay_off', 'EPAplay_off_rank'), [
    { team: 'Ohio State', points: [{ x: 1, value: 0.2, rank: 8 }, { x: 2, value: 0.3, rank: null }] },
  ]);
});

// --- Small multiples -----------------------------------------------------------

test('view=multiples&group=X round-trips; view and group are written only for multiples', () => {
  const v = { sport: 'cfb_team_summaries_weekly', teams: ['Ohio State'], stat: 'EPAplay_off', season: '2025', view: 'multiples' as const, group: 'cfb:big-ten' };
  const qs = trendsViewParams(v).toString();
  assert.equal(qs, 'sport=cfb_team_summaries_weekly&season=2025&view=multiples&group=cfb%3Abig-ten&team=Ohio+State&stat=EPAplay_off');
  assert.deepEqual(parseTrendsView(new URLSearchParams(qs)), v);
  // The overlay is the default: no view key, and no group key with it.
  assert.equal(trendsViewParams({ ...v, view: 'overlay' }).toString(), 'sport=cfb_team_summaries_weekly&season=2025&team=Ohio+State&stat=EPAplay_off');
  assert.equal(trendsViewParams({ ...v, group: '' }).toString(), 'sport=cfb_team_summaries_weekly&season=2025&view=multiples&team=Ohio+State&stat=EPAplay_off');
});

test('an unknown view falls back to the overlay; a malformed group is dropped; old links still parse', () => {
  const p = (qs: string) => parseTrendsView(new URLSearchParams(qs));
  assert.equal(p('view=grid').view, 'overlay');
  assert.equal(p('view=MULTIPLES').view, 'overlay');
  assert.equal(p('view=multiples').view, 'multiples');
  for (const bad of ['big-ten', 'cfb:Big Ten', "cfb:big-ten'--", 'cfb:', ':big-ten', 'cfb:big_ten']) {
    assert.equal(p(`view=multiples&group=${encodeURIComponent(bad)}`).group, '', bad);
  }
  assert.equal(p(`group=cfb:${'x'.repeat(300)}`).group.length, 200); // capped like every token (and matches no group)
  assert.equal(p('group=nfl:afc-east').group, 'nfl:afc-east');
  assert.deepEqual(p('sport=nba&team=Boston%20Celtics&stat=avgRebounds'), {
    sport: 'nba', teams: ['Boston Celtics'], stat: 'avgRebounds', season: '', view: 'overlay', group: '',
  });
});

test('sharedDomain spans every panel and the band, ignoring non-finite values', () => {
  const series = [
    { points: [{ value: 0.1 }, { value: 0.3 }] },
    { points: [{ value: -0.2 }, { value: NaN }] },
    { points: [{ value: Infinity }, { value: 0.25 }] },
  ];
  assert.deepEqual(sharedDomain(series), { lo: -0.2, hi: 0.3 });
  // The band's hi/lo widen it; a mean with no spread still counts, a null lo/hi does not.
  const band = [{ mean: 0.05, lo: -0.3, hi: 0.4 }, { mean: 0.5, lo: null, hi: null }];
  assert.deepEqual(sharedDomain(series, band), { lo: -0.3, hi: 0.5 });
  assert.deepEqual(sharedDomain([], [{ mean: 1, lo: null, hi: null }]), { lo: 1, hi: 1 });
});

test('sharedDomain of nothing finite is null', () => {
  assert.equal(sharedDomain([]), null);
  assert.equal(sharedDomain([{ points: [] }]), null);
  assert.equal(sharedDomain([{ points: [{ value: NaN }] }], [{ mean: NaN, lo: null, hi: null }]), null);
});

test('capPanels shows 20 teams A-Z and lists the rest as more', () => {
  assert.equal(MAX_PANELS, 20);
  const teams = Array.from({ length: 23 }, (_, i) => `Team ${String.fromCharCode(90 - i)}`); // Z..D
  const { shown, more } = capPanels(teams);
  assert.equal(shown.length, 20);
  assert.deepEqual([shown[0], shown[19]], ['Team D', 'Team W']);
  assert.deepEqual(more, ['Team X', 'Team Y', 'Team Z']);
  // The Big Ten (18 since 2024) fits whole, in name order.
  const b1g = ['Wisconsin', 'Illinois', 'Ohio State', 'Michigan State', 'Michigan'];
  assert.deepEqual(capPanels(b1g), { shown: ['Illinois', 'Michigan', 'Michigan State', 'Ohio State', 'Wisconsin'], more: [] });
  assert.deepEqual(capPanels(b1g, 2), { shown: ['Illinois', 'Michigan'], more: ['Michigan State', 'Ohio State', 'Wisconsin'] });
});

test('assertGroupKeys: an integer ESPN id joins as text; a float, text or a text groups id throws', () => {
  const ok = { kind: 'integer' as const, fileTeam: 'INTEGER', fileSeason: 'INTEGER', groupsTeam: 'VARCHAR', groupsSeason: 'INTEGER' };
  assert.doesNotThrow(() => assertGroupKeys(ok));
  assert.doesNotThrow(() => assertGroupKeys({ ...ok, fileTeam: 'BIGINT', fileSeason: 'BIGINT' }));
  assert.throws(() => assertGroupKeys({ ...ok, fileTeam: 'DOUBLE' }), /release team key is DOUBLE/); // "103.0" matches nothing
  assert.throws(() => assertGroupKeys({ ...ok, fileTeam: 'VARCHAR' }), /release team key/);
  assert.throws(() => assertGroupKeys({ ...ok, groupsTeam: 'INTEGER' }), /groups team_id is INTEGER/);
  assert.throws(() => assertGroupKeys({ ...ok, groupsSeason: 'VARCHAR' }), /season/);
  assert.throws(() => assertGroupKeys({ ...ok, fileSeason: 'DOUBLE' }), /season/);
});

test('assertGroupKeys: a text ESPN id joins only when every id is all digits', () => {
  const ok = { kind: 'digits' as const, fileTeam: 'VARCHAR', fileSeason: 'BIGINT', groupsTeam: 'VARCHAR', groupsSeason: 'INTEGER', allDigits: true };
  assert.doesNotThrow(() => assertGroupKeys(ok));
  assert.throws(() => assertGroupKeys({ ...ok, allDigits: false }), /not all digits/);
  assert.throws(() => assertGroupKeys({ ...ok, allDigits: undefined }), /not all digits/); // unknown is not proof
  assert.throws(() => assertGroupKeys({ ...ok, fileTeam: 'BIGINT' }), /want VARCHAR/);
});

test('assertGroupKeys: NFL abbreviations join only through a total, one-to-one map', () => {
  const ok = { kind: 'abbr' as const, fileTeam: 'VARCHAR', fileSeason: 'BIGINT', groupsTeam: 'VARCHAR', groupsSeason: 'INTEGER' };
  const map = { keys: 32, mappedKeys: 32, mappedIds: 32, pairs: 32 };
  assert.doesNotThrow(() => assertGroupKeys({ ...ok, map }));
  // A season's own notes say STL/SD/OAK where the ratings say LA/LAC/LV: 3 unmapped.
  assert.throws(() => assertGroupKeys({ ...ok, map: { ...map, mappedKeys: 29, mappedIds: 29, pairs: 29 } }), /3 release abbreviation/);
  assert.throws(() => assertGroupKeys({ ...ok, map: { ...map, mappedIds: 31, pairs: 32 } }), /one-to-one/); // two codes, one team
  assert.throws(() => assertGroupKeys({ ...ok, map: { ...map, pairs: 33, mappedIds: 33 } }), /one-to-one/); // one code, two teams
  assert.throws(() => assertGroupKeys(ok), /abbreviation/); // no map at all
  assert.throws(() => assertGroupKeys({ ...ok, map, fileTeam: 'INTEGER' }), /want VARCHAR/);
});

test('every source groups through its league groups release, at the verified level and key', () => {
  assert.deepEqual(
    TREND_SPORTS.map((s) => [s.key, s.groups.tag, s.groups.members, s.groups.names, s.groups.level, s.groups.key.col, s.groups.key.kind]),
    [
      ['mbb', 'mbb_groups', 'mbb_team_group_seasons.parquet', 'mbb_group_seasons.parquet', 'conference_id', 'team_id', 'integer'],
      ['wbb', 'wbb_groups', 'wbb_team_group_seasons.parquet', 'wbb_group_seasons.parquet', 'conference_id', 'team_id', 'integer'],
      ['nba', 'nba_groups', 'nba_team_group_seasons.parquet', 'nba_group_seasons.parquet', 'conference_id', 'team_id', 'integer'],
      ['wnba', 'wnba_groups', 'wnba_team_group_seasons.parquet', 'wnba_group_seasons.parquet', 'conference_id', 'team_id', 'integer'],
      ['cfb_team_summaries_weekly', 'cfb_groups', 'cfb_team_group_seasons.parquet', 'cfb_group_seasons.parquet', 'conference_id', 'team_id', 'digits'],
      ['cfb_ratings_weekly', 'cfb_groups', 'cfb_team_group_seasons.parquet', 'cfb_group_seasons.parquet', 'conference_id', 'team_id', 'digits'],
      ['nfl_ratings_weekly', 'nfl_groups', 'nfl_team_group_seasons.parquet', 'nfl_group_seasons.parquet', 'division_id', 'team_id', 'abbr'],
    ]
  );
});

const groupRows = [
  { team: 'Ohio State', id: 'cfb:big-ten', name: 'Big Ten' },
  { team: 'Alabama', id: 'cfb:sec', name: 'SEC' },
  { team: 'Michigan', id: 'cfb:big-ten', name: 'Big Ten' },
  { team: 'Ohio State', id: 'cfb:big-ten', name: 'Big Ten' }, // a weekly file lists a team every week
  { team: 'Clemson', id: 'cfb:acc', name: 'ACC' },
];

test('teamGroups: groups by name, each team once, A-Z', () => {
  assert.deepEqual(teamGroups(groupRows), [
    { id: 'cfb:acc', name: 'ACC', teams: ['Clemson'] },
    { id: 'cfb:big-ten', name: 'Big Ten', teams: ['Michigan', 'Ohio State'] },
    { id: 'cfb:sec', name: 'SEC', teams: ['Alabama'] },
  ]);
  assert.deepEqual(teamGroups([]), []);
});

test('pickGroup: the linked group, else the first picked team\'s, else the first by name', () => {
  const groups = teamGroups(groupRows);
  assert.equal(pickGroup(groups, 'cfb:sec', ['Ohio State'])?.id, 'cfb:sec'); // the link wins
  assert.equal(pickGroup(groups, '', ['Ohio State', 'Alabama'])?.id, 'cfb:big-ten');
  // A gap, or a pick in no group (not in this season), is skipped for the next pick.
  assert.equal(pickGroup(groups, 'cfb:pac-12', [null, 'Nowhere', 'Alabama'])?.id, 'cfb:sec');
  assert.equal(pickGroup(groups, '', [])?.id, 'cfb:acc');
  assert.equal(pickGroup([], 'cfb:acc', ['Clemson']), null);
});
