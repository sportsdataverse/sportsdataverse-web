import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReleaseTag } from '../content/platform.ts';

// One live tag per family (sportsdataverse-data releases, 2026-09-26). Every
// family below landed in the "other" bucket before this table was extended.
const CASES: [tag: string, sport: string, producer: string][] = [
  ['espn_nfl_adv_team', 'nfl', 'sportsdataverse/nfl-data'],
  ['espn_nfl_pbp', 'nfl', 'sportsdataverse/nfl-data'],
  ['espn_nfl_qa', 'nfl', 'sportsdataverse/nfl-data'],
  ['cfb_ratings_weekly', 'cfb', 'sportsdataverse/cfbfastR-cfb-data'],
  ['cfb_recruits', 'cfb', 'sportsdataverse/cfbfastR-cfb-data'],
  ['ncaa_mfb_pbp_cfbfastr', 'cfb', 'sportsdataverse/ncaa-mfb-football-data'],
  ['ncaa_mbb_rapm', 'mbb', 'sportsdataverse/ncaa-mbb-hoops-data'],
  ['ncaa_wbb_shots', 'wbb', 'sportsdataverse/ncaa-wbb-hoops-data'],
  ['mbb_ratings', 'mbb', 'sportsdataverse/hoopR-mbb-data'],
  ['wbb_player_value', 'wbb', 'sportsdataverse/wehoop-wbb-data'],
  ['nba_player_impact', 'nba', 'sportsdataverse/hoopR-nba-stats-data'],
  ['wnba_player_impact', 'wnba', 'sportsdataverse/wehoop-wnba-stats-data'],
  ['mlb_pbp', 'mlb', 'sportsdataverse/baseballr-data'],
  ['espn_mlb_injuries', 'mlb', 'sportsdataverse/cfbfastR-cfb-data'],
  ['espn_mbb_injuries', 'mbb', 'sportsdataverse/cfbfastR-cfb-data'],
  ['espn_nhl_injuries', 'nhl', 'sportsdataverse/cfbfastR-cfb-data'],
];

for (const [tag, sport, producer] of CASES) {
  test(`${tag} → ${sport} / ${producer}`, () => {
    const g = classifyReleaseTag(tag);
    assert.equal(g.sport, sport);
    assert.equal(g.producer, producer);
  });
}

test('the ESPN daily snapshots are attributed to their one producer, not the league repo', () => {
  // espn_{league}_{injuries,depthcharts} are all written by cfbfastR-cfb-data's
  // espn_daily_snapshots.yml; the espn_nba_ prefix rule would say hoopR-nba-data.
  for (const tag of ['espn_nba_injuries', 'espn_nba_depthcharts', 'espn_nfl_depthcharts', 'espn_cfb_injuries', 'espn_wnba_injuries']) {
    assert.equal(classifyReleaseTag(tag).producer, 'sportsdataverse/cfbfastR-cfb-data', tag);
  }
  assert.equal(classifyReleaseTag('espn_nba_injuries').sport, 'nba');
});

test('existing families keep their classification', () => {
  assert.deepEqual(
    [classifyReleaseTag('espn_nba_pbp').producer, classifyReleaseTag('nba_stats_shots').producer, classifyReleaseTag('nfl_player_percentiles').sport, classifyReleaseTag('cfb_crosswalk').producer],
    ['sportsdataverse/hoopR-nba-data', 'sportsdataverse/hoopR-nba-stats-data', 'nfl', 'sportsdataverse/sportsdataverse-py'],
  );
  assert.equal(classifyReleaseTag('not_a_family').sport, 'other');
});
