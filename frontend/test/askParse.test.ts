import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askHref, editChip, parseAsk, stateOf, type AskContext } from '../lib/platform/ask/parse.ts';

// The page the question is asked on, and the Data API's schemas.
const CTX: AskContext = { schemas: ['cfb', 'nfl', 'nba'], base: { schema: 'nfl', table: 'passing' } };
const q = (href: string) => href.replace('/platform/query?', '');

// [question, the Query URL it applies, words left in `ignored`]. Every URL carries limit=100 (the codec writes it).
const TABLE: [string, string, string[]][] = [
  // the spec's example; league and table read from the page
  ['QBs with EPA/play over 0.2 in 2025, min 200 dropbacks', 'schema=nfl&table=passing&position_group=QB&EPAplay__gt=0.2&dropbacks__gte=200&season=2025&limit=100', []],
  ['top 10 NFL QBs by EPA/play 2025', 'schema=nfl&table=passing&position_group=QB&season=2025&order=-EPAplay&limit=10', []],
  ['Chiefs WRs with success rate over 50%', 'schema=nfl&table=receiving&position_group=WR&pos_team=KC&success__gt=0.5&limit=100', []],
  ['cfb rushers since 2020 with 100+ carries', 'schema=cfb&table=rushing&plays__gte=100&season__gte=2020&limit=100', []],
  ['college RBs with yards/play above 6 and at least 150 carries in 2024', 'schema=cfb&table=rushing&position_group=RB&yardsplay__gt=6&plays__gte=150&season=2024&limit=100', []],
  ['receivers with catch % at least 70 2018-2022', 'schema=nfl&table=receiving&catchpct__gte=0.7&season__gte=2018&season__lte=2022&limit=100', []],
  ['TEs with 50 or more catches', 'schema=nfl&table=receiving&position_group=TE&comp__gte=50&limit=100', []],
  ['QBs with EPA/play over -0.05', 'schema=nfl&table=passing&position_group=QB&EPAplay__gt=-0.05&limit=100', []],
  ['pass rate over 60%', 'schema=nfl&table=passing&pass_rate__gt=0.6&limit=100', []],
  ['success rate under .4', 'schema=nfl&table=passing&success__lt=0.4&limit=100', []],
  ['EPA/play at most 0', 'schema=nfl&table=passing&EPAplay__lte=0&limit=100', []],
  ['at least 300 dropbacks', 'schema=nfl&table=passing&dropbacks__gte=300&limit=100', []],
  // polarity: "better than" on a lower-is-better metric is "<"; "best"/"worst" follow it, "highest"/"lowest" do not
  ['havoc better than 20%', 'schema=nfl&table=passing&havoc__lt=0.2&limit=100', []],
  ['sorted by success rate', 'schema=nfl&table=passing&order=-success&limit=100', []],
  ['best by havoc', 'schema=nfl&table=passing&order=havoc&limit=100', []],
  ['worst havoc', 'schema=nfl&table=passing&order=-havoc&limit=100', []],
  ['lowest havoc', 'schema=nfl&table=passing&order=havoc&limit=100', []],
  ['most total yards 2023', 'schema=nfl&table=passing&season=2023&order=-yards&limit=100', []],
  ['bottom 5 passers by EPA/play', 'schema=nfl&table=passing&order=EPAplay&limit=5', []],
  // seasons, the qualifier, teams
  ['QBs between 2019 and 2021', 'schema=nfl&table=passing&position_group=QB&season__gte=2019&season__lte=2021&limit=100', []],
  ['QBs from 2019 to 2021', 'schema=nfl&table=passing&position_group=QB&season__gte=2019&season__lte=2021&limit=100', []],
  ['QBs before 2015', 'schema=nfl&table=passing&position_group=QB&season__lt=2015&limit=100', []],
  ['qualified QBs 2025', 'schema=nfl&table=passing&position_group=QB&season=2025&limit=100&grid.q=1', []],
  ['Eagles RBs', 'schema=nfl&table=rushing&position_group=RB&pos_team=PHI&limit=100', []],
  ['PHI receivers', 'schema=nfl&table=receiving&pos_team=PHI&limit=100', []],
  ['nfl Miami QBs', 'schema=nfl&table=passing&position_group=QB&pos_team=MIA&limit=100', []],
  // negatives: words no rule can place stay in `ignored`, nothing is invented
  ['QBs with 65% completion and 8+ YPA', 'schema=nfl&table=passing&position_group=QB&limit=100', ['65% completion', '8+ YPA']],
  ['Miami QBs', 'schema=nfl&table=passing&position_group=QB&limit=100', ['Miami']], // a city alone: also a college team
  ['nfl Los Angeles QBs', 'schema=nfl&table=passing&position_group=QB&limit=100', ['Los Angeles']], // two teams
  ['cfb Chiefs', 'schema=cfb&table=passing&limit=100', ['Chiefs']], // an NFL nickname in a college question
  ['nba QBs', 'schema=nfl&table=passing&position_group=QB&limit=100', ['nba']], // a league the grammar has no tables for
  ['QBs EPA', 'schema=nfl&table=passing&position_group=QB&limit=100', ['EPA']], // a metric with no threshold or sort
  ['QBs at least', 'schema=nfl&table=passing&position_group=QB&limit=100', ['at least']],
  ['QBs who throw deep', 'schema=nfl&table=passing&position_group=QB&limit=100', ['throw deep']],
  ['2025 QBs min 14 dropbacks per game', 'schema=nfl&table=passing&position_group=QB&season=2025&limit=100', ['min 14 dropbacks', 'game']],
  ['KC QBs with EPA/play over 0.2 and EPA/play over 0.3', 'schema=nfl&table=passing&position_group=QB&pos_team=KC&EPAplay__gt=0.2&limit=100', ['EPA/play over 0.3']],
  ['best QBs in 2025', 'schema=nfl&table=passing&position_group=QB&season=2025&limit=100', ['best']], // best by what?
];

for (const [question, href, ignored] of TABLE) {
  test(`ask: ${question}`, () => {
    const r = parseAsk(question, CTX);
    assert.equal(q(askHref(r.state)), href);
    assert.deepEqual(r.ignored, ignored);
  });
}

test('a question nothing can parse yields no chips, and every meaningful word comes back', () => {
  for (const [question, ignored] of [
    ['2000 yards', ['2000 yards']], // a year-shaped number before a metric is not a season
    ['success rate over 150%', ['success rate over 150%']], // a share above 100%
    ['EPA/play over 20%', ['EPA/play over 20%']], // a % on a metric that is not one
    ['players over 0.2', ['over 0.2']], // a threshold with no metric
    ['', []],
  ] as const) {
    const r = parseAsk(question, CTX);
    assert.deepEqual(r.chips, [], question);
    assert.deepEqual(r.ignored, ignored, question);
  }
});

test('chips record the source characters they consumed; implied chips say why', () => {
  const question = 'QBs with EPA/play over 0.2';
  const r = parseAsk(question, CTX);
  const show = r.chips.map((c) => [c.kind, c.span ? question.slice(...c.span) : `(${c.implied})`]);
  assert.deepEqual(show, [['league', '(this page)'], ['table', 'QBs'], ['metric', 'EPA/play over 0.2']]);
  assert.equal(parseAsk('Chiefs QBs', CTX).chips[0].implied, 'from Chiefs');
  assert.equal(parseAsk('success over 55%', CTX).chips.find((c) => c.kind === 'metric')?.display, '55%');
});

test('a league outside the Data API schemas is not applied', () => {
  const r = parseAsk('cfb QBs', { ...CTX, schemas: ['nfl'] });
  assert.equal(r.state.query.schema, 'nfl');
  assert.deepEqual(r.ignored, ['cfb']);
});

test('with a catalog, a filter on a column the table lacks is dropped and its words come back', () => {
  const PASSING = ['team_id', 'pos_team', 'season', 'player_id', 'plays', 'TEPA', 'EPAplay', 'yards', 'success', 'dropbacks', 'position_group'];
  const RUSHING = ['team_id', 'pos_team', 'season', 'player_id', 'plays', 'TEPA', 'EPAplay', 'yards', 'success'];
  const columns = (_: string, table: string) => ({ passing: PASSING, rushing: RUSHING })[table];
  const ctx = { ...CTX, columns };
  const a = parseAsk('QBs with EPA/dropback over 0.1 and EPA/play over 0.2', ctx);
  assert.equal(q(askHref(a.state)), 'schema=nfl&table=passing&position_group=QB&EPAplay__gt=0.2&limit=100');
  assert.deepEqual(a.ignored, ['EPA/dropback over 0.1']);
  // a sort on a missing column goes too; position_group is dropped where the table has none
  const b = parseAsk('RBs with 100+ carries sorted by havoc', ctx);
  assert.equal(q(askHref(b.state)), 'schema=nfl&table=rushing&plays__gte=100&limit=100');
  assert.deepEqual(b.ignored, ['sorted', 'havoc']);
  // "carries" is a rushing table's plays, nowhere else
  assert.deepEqual(parseAsk('QBs with 100+ carries', ctx).ignored, ['100+ carries']);
});

test('removing a chip removes exactly its filter; an edit is validated and re-scaled', () => {
  const r = parseAsk('QBs with success rate over 50% in 2025', CTX);
  const metric = r.chips.find((c) => c.kind === 'metric')!;
  const without = r.chips.filter((c) => c !== metric);
  assert.equal(q(askHref(stateOf(without, CTX.schemas))), 'schema=nfl&table=passing&position_group=QB&season=2025&limit=100');
  assert.deepEqual(editChip(metric, '55%')?.params, [['success__gt', '0.55']]);
  assert.deepEqual(editChip(metric, '0.6')?.params, [['success__gt', '0.6']]);
  assert.equal(editChip(metric, '150%'), null);
  assert.equal(editChip(metric, 'lots'), null);
  const season = r.chips.find((c) => c.kind === 'season')!;
  assert.deepEqual(editChip(season, '2024')?.params, [['season', '2024']]);
  assert.equal(editChip(season, '24'), null);
  assert.equal(editChip(r.chips.find((c) => c.kind === 'table')!, 'rushing'), null); // not an editable chip
});

test('the state goes through the page codec: a grid key never lands among the API filters', () => {
  const r = parseAsk('qualified QBs over 300 dropbacks', CTX);
  assert.equal(r.state.grid.qualified, true);
  assert.ok(r.state.query.filters.every((f) => !f.column.startsWith('grid')));
});

test('an empty schema list (the Data API did not answer) rejects no league', () => {
  assert.equal(q(askHref(parseAsk('cfb QBs', { schemas: [] }).state)), 'schema=cfb&table=passing&position_group=QB&limit=100');
});
