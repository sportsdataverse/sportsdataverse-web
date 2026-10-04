import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aboutOpenData,
  formatCount,
  leagueLabels,
  siteFacts,
  tickerFacts,
  warehouseFigures,
  warehouseLeagues,
  warehousePhrase,
} from '../lib/warehouseFigures.ts';

test('formatCount', () => {
  assert.equal(formatCount(123_456_789), '123M+');
  assert.equal(formatCount(1_234_567), '1.2M+');
  assert.equal(formatCount(9_870), '9,870');
});

test('warehouseFigures with a live status, tags, and packages', () => {
  const { tiles, asOf } = warehouseFigures({
    status: { row_estimate: 1.3e8, table_count: 516, collected_at: '2026-09-26T08:00:00Z' },
    releaseTags: ['espn_cfb_pbp', 'nba_stats_shots', 'phf_pbp', 'zzz'],
    packages: 41,
  });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Rows in the warehouse'], '130M+');
  assert.equal(byTitle['Tables in the warehouse'], '516');
  assert.equal(byTitle['Leagues in the warehouse'], '2', 'other and the archived phf are excluded');
  assert.equal(byTitle['Datasets in the catalog'], '4');
  assert.equal(byTitle['Open-source packages'], '41');
  assert.equal(asOf, '2026-09-26');
});

test('a null status renders — for Rows and Tables, and asOf is null (never a stale constant)', () => {
  const { tiles, asOf } = warehouseFigures({
    status: null,
    releaseTags: ['espn_cfb_pbp'],
    packages: 41,
  });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Rows in the warehouse'], '—');
  assert.equal(byTitle['Tables in the warehouse'], '—');
  assert.equal(asOf, null);
});

test('an ok:false heartbeat renders — for Rows and Tables, and asOf is null (never dated off a failed check)', () => {
  const { tiles, asOf } = warehouseFigures({
    status: { ok: false, error: 'connection refused', collected_at: '2026-09-26T08:00:00Z' },
    releaseTags: ['espn_cfb_pbp'],
    packages: 41,
  });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Rows in the warehouse'], '—');
  assert.equal(byTitle['Tables in the warehouse'], '—');
  assert.equal(asOf, null);
});

test('a null release list renders — for Leagues and Datasets', () => {
  const { tiles } = warehouseFigures({ status: null, releaseTags: null, packages: 41 });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Leagues in the warehouse'], '—');
  assert.equal(byTitle['Datasets in the catalog'], '—');
});

test('a null package count renders — for Packages', () => {
  const { tiles } = warehouseFigures({ status: null, releaseTags: null, packages: null });
  const byTitle = Object.fromEntries(tiles.map((t) => [t.title, t.value]));
  assert.equal(byTitle['Open-source packages'], '—');
});

test('warehouseLeagues: the /stats league buckets, sorted, without other and phf', () => {
  assert.deepEqual(warehouseLeagues(['espn_cfb_pbp', 'nba_stats_shots', 'cfb_schedules', 'phf_pbp', 'zzz', 'ncaa_baseball_pbp']), [
    'baseball',
    'cfb',
    'nba',
  ]);
  assert.deepEqual(warehouseLeagues([]), []);
});

test('siteFacts carries the /stats figures, and null where a source failed', () => {
  const live = siteFacts({ status: { row_estimate: 48_765_432, collected_at: '2026-10-03T08:00:00Z' }, releaseTags: ['espn_cfb_pbp', 'nba_stats_shots'] });
  assert.deepEqual(live, { rows: '48.7M+', leagues: ['cfb', 'nba'] });
  assert.equal(
    warehouseFigures({ status: { row_estimate: 48_765_432, collected_at: '2026-10-03T08:00:00Z' }, releaseTags: ['espn_cfb_pbp', 'nba_stats_shots'], packages: null })
      .tiles.find((t) => t.title === 'Leagues in the warehouse')?.value,
    String(live.leagues?.length),
    'the same league count /stats shows'
  );
  assert.deepEqual(siteFacts({ status: null, releaseTags: null }), { rows: null, leagues: null });
  assert.deepEqual(siteFacts({ status: { ok: false, collected_at: '2026-10-03T08:00:00Z' }, releaseTags: [] }), { rows: null, leagues: null }, 'no estimate, no leagues: nothing to claim');
});

test('the ticker and the prose leave a missing figure out instead of guessing one', () => {
  const both = { rows: '48.7M+', leagues: ['cfb', 'nba'] };
  assert.deepEqual(tickerFacts(both), ['48.7M+ rows in the warehouse', '2 leagues in the warehouse']);
  assert.deepEqual(tickerFacts({ rows: null, leagues: ['cfb'] }), ['1 league in the warehouse']);
  assert.deepEqual(tickerFacts({ rows: null, leagues: null }), []);
  assert.equal(warehousePhrase(both), '48.7M+ rows across 2 leagues');
  assert.equal(warehousePhrase({ rows: '48.7M+', leagues: null }), '48.7M+ rows');
  assert.equal(warehousePhrase({ rows: null, leagues: ['cfb', 'nba'] }), '2 leagues');
  assert.equal(warehousePhrase({ rows: null, leagues: null }), null);
});

test('leagueLabels: display names in the house order, unknown keys last', () => {
  assert.deepEqual(leagueLabels(['wnba', 'baseball', 'cfb', 'xfl', 'mlb']), ['CFB', 'WNBA', 'MLB', 'College baseball', 'XFL']);
});

test("/about's open-data sentence carries the figures it has and no others", () => {
  assert.equal(
    aboutOpenData({ rows: '48.7M+', leagues: Array(10).fill('x') }),
    'Nightly pipelines scrape, process, and publish season-level datasets as versioned releases: 48.7M+ rows of play-by-play and stats across 10 leagues, loadable in one function call.'
  );
  assert.equal(
    aboutOpenData({ rows: null, leagues: null }),
    'Nightly pipelines scrape, process, and publish season-level datasets as versioned releases: play-by-play and stats, loadable in one function call.'
  );
  assert.doesNotMatch(aboutOpenData({ rows: null, leagues: ['cfb', 'nba'] }), /rows/);
});
