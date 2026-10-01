import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformPathFor } from '../lib/platform/searchRoutes.ts';

test('a game opens Win probability on its sport, season and id', () => {
  assert.equal(
    platformPathFor({ type: 'game', id: '401628374', league: 'cfb', season: 2024, label: 'Georgia @ Alabama' }),
    '/platform/wp?sport=cfb&season=2024&game=401628374'
  );
  assert.equal(
    platformPathFor({ type: 'game', id: '401873045', league: 'nfl', season: 2026, label: 'New York Jets @ Kansas City Chiefs' }),
    '/platform/wp?sport=nfl&season=2026&game=401873045'
  );
});

test('a player in a league without shots opens Lookups by name; one with shots opens Shots by id', () => {
  assert.equal(
    platformPathFor({ type: 'player', id: '3139477', league: 'nfl', season: 2026, label: 'Patrick Mahomes', sublabel: 'KC · 2017–2026' }),
    '/platform/lookups?sport=nfl&q=Patrick+Mahomes'
  );
  assert.equal(
    platformPathFor({ type: 'player', id: '3139477', league: 'cfb', season: 2016, label: 'Patrick Mahomes' }),
    '/platform/lookups?sport=cfb&q=Patrick+Mahomes'
  );
  assert.equal(
    platformPathFor({ type: 'player', id: '1628983', league: 'nba_stats', season: 2026, label: 'Shai Gilgeous-Alexander' }),
    '/platform/shots?league=nba_stats&season=2026&player=1628983'
  );
  assert.equal(
    platformPathFor({ type: 'player', id: '8477492', league: 'nhl', season: null, label: 'Nathan MacKinnon' }),
    '/platform/shots?league=nhl&player=8477492'
  );
});

test('a team opens Trends on the league source with the team picked', () => {
  assert.equal(
    platformPathFor({ type: 'team', id: '333', league: 'cfb', season: null, label: 'Alabama', sublabel: 'ALA · SEC' }),
    '/platform/trends?sport=cfb_team_summaries_weekly&team=Alabama'
  );
  assert.equal(
    platformPathFor({ type: 'team', id: '2010', league: 'cfb', season: null, label: 'Alabama A&M', sublabel: 'AAMU · SWAC' }),
    '/platform/trends?sport=cfb_team_summaries_weekly&team=Alabama+A%26M'
  );
  // the NFL ratings key the abbreviation, F10's sublabel's first token
  assert.equal(
    platformPathFor({ type: 'team', id: '12', league: 'nfl', season: null, label: 'Kansas City Chiefs', sublabel: 'KC · AFC' }),
    '/platform/trends?sport=nfl_ratings_weekly&team=KC'
  );
  assert.equal(
    platformPathFor({ type: 'team', id: '12', league: 'nfl', season: null, label: 'Kansas City Chiefs' }),
    '/platform/trends?sport=nfl_ratings_weekly&team=Kansas+City+Chiefs'
  );
  assert.equal(
    platformPathFor({ type: 'team', id: '150', league: 'mbb', season: null, label: 'Duke Blue Devils' }),
    '/platform/trends?sport=mbb&team=Duke+Blue+Devils'
  );
});

test('a season opens Explore on the league play-by-play release for that season', () => {
  assert.equal(
    platformPathFor({ type: 'season', id: '2024', league: 'cfb', season: 2024, label: '2024 season' }),
    '/platform/explore?tag=espn_cfb_pbp&season=2024'
  );
  assert.equal(
    platformPathFor({ type: 'season', id: '2023', league: 'nfl', season: null, label: '2023 season' }),
    '/platform/explore?tag=nfl_model_pbp&season=2023'
  );
  assert.equal(platformPathFor({ type: 'season', id: '2024', league: 'pwhl', season: 2024, label: '2024 season' }), null);
});

test('a dataset opens Explore on its tag', () => {
  assert.equal(platformPathFor({ type: 'dataset', id: 'espn_cfb_pbp', league: '', label: 'espn_cfb_pbp' }), '/platform/explore?tag=espn_cfb_pbp');
});

test('an unknown type has no view', () => {
  assert.equal(platformPathFor({ type: 'conference', id: '8', league: 'cfb', label: 'SEC' }), null);
  assert.equal(platformPathFor({ type: '', id: '1', league: 'cfb', label: '' }), null);
});
