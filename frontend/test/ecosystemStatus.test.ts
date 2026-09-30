import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UNMAPPED,
  badgeUrl,
  formatDate,
  formatUtc,
  loadEcosystemSummary,
  matchesReleaseFilter,
  normalizeSummary,
  packageKey,
  pipelinesByPackage,
  pipelinesForPackage,
  relativeAge,
  runLabel,
  stateCounts,
  trackedTagCount,
  workflowAlt,
  workflowStem,
} from '../lib/ecosystemStatus.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/ecosystem-summary.json', import.meta.url), 'utf8')
);

test('the fixture normalises in full', () => {
  const s = normalizeSummary(fixture);
  assert.ok(s);
  assert.equal(s.generated_at, '2026-09-30T09:34:12.289890+00:00');
  assert.equal(s.producers.length, 6);
  assert.equal(s.packages.length, 4);
  assert.equal(s.red_workflows.length, 2);
  assert.deepEqual(s.unmapped_tags, ['amf_tracking_parquet', 'odds_lines_legacy']);
  assert.equal(s.release_tags.length, 18);
  assert.equal(s.release_tags.filter((t) => t.producer === null).length, 2);
  assert.equal(s.release_tags[0].tag, 'amf_tracking_parquet', 'stalest first: the oldest dated tag leads');
  assert.equal(s.release_tags.at(-1)?.assets, 0, 'empty tags sort last');
  assert.equal(s.totals.repos, 79);
  assert.equal(trackedTagCount(s), 18);
});

test('malformed or empty snapshots are null, never an empty success', () => {
  for (const bad of [null, undefined, 'x', 42, [], {}, { generated_at: 'nope', producers: [] }]) {
    assert.equal(normalizeSummary(bad), null, JSON.stringify(bad));
  }
  assert.equal(normalizeSummary({ generated_at: '2026-09-30T00:00:00Z' }), null, 'no producers array');
  assert.equal(normalizeSummary({ generated_at: '2026-09-30T00:00:00Z', producers: 'x' }), null);
  assert.equal(
    normalizeSummary({ generated_at: '2026-09-30T00:00:00Z', producers: [{ sport: 'NBA' }, 7] }),
    null,
    'every producer dropped → nothing true to show'
  );
});

test('unknown state → unknown; missing optional fields get defaults', () => {
  const s = normalizeSummary({
    generated_at: '2026-09-30T00:00:00Z',
    producers: [{ repo: 'sportsdataverse/hoopR-nba-data', state: 'on-fire' }],
  });
  assert.ok(s);
  assert.deepEqual(s.producers[0], {
    repo: 'sportsdataverse/hoopR-nba-data',
    sport: '',
    packages: [],
    state: 'unknown',
    in_season: false,
    updated_at: null,
    through_season: null,
    tags: 0,
    workflows: [],
  });
  assert.deepEqual(s.totals, {});
  assert.deepEqual(s.packages, []);
  assert.deepEqual(s.red_workflows, []);
  assert.deepEqual(s.release_tags, []);
  assert.equal(normalizeSummary(fixture)?.producers[5].state, 'unknown', "fixture's 'rebuilding'");
});

test('remote strings that become hrefs or anchors are checked', () => {
  const s = normalizeSummary({
    generated_at: '2026-09-30T00:00:00Z',
    producers: [
      {
        repo: 'sportsdataverse/ok-data',
        updated_at: 'not a date',
        workflows: [{ name: 'Update', file: 'u.yml', url: 'javascript:alert(1)', created_at: '2026-09-01T00:00:00Z' }],
      },
      { repo: '../../evil' },
    ],
    release_tags: [{ tag: 'a', producer: 'not a repo' }, { producer: 'sportsdataverse/ok-data' }],
  });
  assert.ok(s);
  assert.deepEqual(s.producers.map((p) => p.repo), ['sportsdataverse/ok-data']);
  assert.equal(s.producers[0].updated_at, null);
  assert.equal(s.producers[0].workflows[0].url, null);
  assert.deepEqual(s.release_tags, [
    { tag: 'a', producer: null, assets: 0, newest_asset_at: null, max_season: null },
  ]);
});

test('dates: absolute UTC and coarse relative age', () => {
  assert.equal(formatDate('2026-09-09T05:21:38Z'), '2026-09-09');
  assert.equal(formatDate(null), '—');
  assert.equal(formatUtc('2026-09-30T09:34:12.289890+00:00'), '2026-09-30 09:34 UTC');
  assert.equal(formatUtc('2026-09-30T01:05:00-04:00'), '2026-09-30 05:05 UTC');
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert.equal(relativeAge('2026-09-30T11:59:40Z', now), 'just now');
  assert.equal(relativeAge('2026-09-30T13:00:00Z', now), 'just now', 'future (clock skew)');
  assert.equal(relativeAge('2026-09-30T11:48:00Z', now), '12 min ago');
  assert.equal(relativeAge('2026-09-30T02:00:00Z', now), '10 h ago');
  assert.equal(relativeAge('2026-09-28T13:00:00Z', now), '47 h ago');
  assert.equal(relativeAge('2026-09-09T05:21:38Z', now), '21 days ago');
  assert.equal(relativeAge(null, now), '—');
});

test('badge URL: the inner raw URL is percent-encoded exactly as the contract shows', () => {
  assert.equal(
    badgeUrl('sportsdataverse/wehoop-wbb-data', 'updated'),
    'https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsportsdataverse%2F.github%2Fmain%2Fstatus%2Fbadges%2Fwehoop-wbb-data%2Fupdated.json'
  );
  assert.equal(
    badgeUrl('sportsdataverse/wehoop-wbb-data', `wf-${workflowStem('.github/workflows/daily_wbb.yml')}`),
    'https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsportsdataverse%2F.github%2Fmain%2Fstatus%2Fbadges%2Fwehoop-wbb-data%2Fwf-daily_wbb.json'
  );
  assert.equal(workflowStem('R-CMD-check.yaml'), 'R-CMD-check');
});

test('run labels and badge alt text', () => {
  const run = {
    name: 'Update WBB Data',
    file: 'daily_wbb.yml',
    conclusion: 'success',
    created_at: '2026-09-09T05:21:38Z',
    event: 'repository_dispatch',
    url: null,
  };
  assert.equal(workflowAlt(run), 'Update WBB Data: passing, last run 2026-09-09');
  assert.equal(runLabel({ conclusion: 'failure', created_at: run.created_at }), 'failing');
  assert.equal(runLabel({ conclusion: 'timed_out', created_at: run.created_at }), 'failing');
  assert.equal(runLabel({ conclusion: 'cancelled', created_at: run.created_at }), 'cancelled');
  assert.equal(runLabel({ conclusion: 'action_required', created_at: run.created_at }), 'action required');
  assert.equal(runLabel({ conclusion: null, created_at: run.created_at }), 'in progress');
  assert.equal(workflowAlt({ ...run, created_at: null, conclusion: null }), 'Update WBB Data: no runs');
});

test('producers by state', () => {
  const s = normalizeSummary(fixture)!;
  assert.deepEqual(stateCounts(s.producers), { fresh: 2, idle: 1, stale: 1, failing: 1, unknown: 1 });
});

test('producer map: keyed by loader repo name, lower-cased, in snapshot order', () => {
  const map = pipelinesByPackage(normalizeSummary(fixture));
  assert.deepEqual(map.wehoop, [
    { repo: 'sportsdataverse/wehoop-wnba-data', anchor: 'wehoop-wnba-data', sport: 'WNBA', state: 'fresh' },
    { repo: 'sportsdataverse/wehoop-wbb-data', anchor: 'wehoop-wbb-data', sport: 'WBB', state: 'idle' },
  ]);
  assert.equal(map.sportsdataverse, undefined, 'no bucket for the shared flagship title');
  assert.deepEqual(pipelinesByPackage(null), {});
});

// Card shapes as /packages holds them (real sourceHrefs carry a trailing slash).
const map = pipelinesByPackage(normalizeSummary(fixture));
const anchors = (pkg: { sourceHref?: string; title?: string }) =>
  (pipelinesForPackage(map, pkg) ?? []).map((p) => p.anchor);

test('a card matches on the repo named by its sourceHref, not its title', () => {
  const py = anchors({ title: 'sportsdataverse', sourceHref: 'https://github.com/sportsdataverse/sportsdataverse-py' });
  assert.deepEqual(py, ['cfbfastR-cfb-data', 'wehoop-wnba-data', 'wehoop-wbb-data', 'fastRhockey-nhl-data', 'hoopR-nba-data']);
  const js = anchors({ title: 'sportsdataverse', sourceHref: 'https://github.com/sportsdataverse/sportsdataverse-js/' });
  assert.deepEqual(js, ['wehoop-wbb-data', 'hoopR-nba-data'], 'only producers listing sportsdataverse-js');
});

test('the R flagship card gets only producers listing sportsdataverse-R, none of the Python-only ones', () => {
  const r = anchors({ title: 'sportsdataverse', sourceHref: 'https://github.com/sportsdataverse/sportsdataverse-R/' });
  assert.deepEqual(r, ['cfbfastR-cfb-data', 'wehoop-wnba-data', 'wehoop-wbb-data', 'hoopR-nba-data']);
  assert.ok(!r.includes('fastRhockey-nhl-data'), 'listed for sportsdataverse-py only');
});

test('no usable sourceHref: title fallback, but never for the shared title sportsdataverse', () => {
  assert.deepEqual(anchors({ title: 'sportsdataverse' }), []);
  assert.deepEqual(anchors({ title: 'sportsdataverse', sourceHref: 'not a url' }), []);
  assert.deepEqual(anchors({ title: 'sportsdataverse', sourceHref: 'https://github.com/' }), []);
  assert.deepEqual(anchors({ title: 'hoopR' }), ['hoopR-nba-data'], 'a distinct title still falls back');
  assert.equal(packageKey({ title: 'sportsdataverse' }), null);
});

test('matching is case-insensitive and tolerates .git, trailing slashes and another owner', () => {
  assert.deepEqual(anchors({ title: 'x', sourceHref: 'https://github.com/sportsdataverse/cfbfastr' }), ['cfbfastR-cfb-data']);
  assert.equal(packageKey({ sourceHref: 'https://github.com/sportsdataverse/cfbfastR.git' }), 'cfbfastr');
  assert.equal(packageKey({ sourceHref: 'https://github.com/BillPetti/baseballr/' }), 'baseballr');
  assert.deepEqual(anchors({ title: 'oddsapiR', sourceHref: 'https://github.com/sportsdataverse/oddsapiR/' }), [], 'no producer, nothing');
  assert.equal(pipelinesForPackage(map, { title: 'x', sourceHref: 'https://github.com/o/constructor' }), undefined, 'own keys only');
});

test('release-tag filter: text over tag + producer, and an exact producer pick', () => {
  const row = { tag: 'espn_nba_draft', producer: 'sportsdataverse/hoopR-nba-data' };
  const orphan = { tag: 'amf_tracking_parquet', producer: null };
  assert.ok(matchesReleaseFilter(row, '', ''));
  assert.ok(matchesReleaseFilter(row, 'NBA draft', ''));
  assert.ok(matchesReleaseFilter(row, 'hoopr', ''), 'producer text matches');
  assert.ok(!matchesReleaseFilter(row, 'wbb', ''));
  assert.ok(matchesReleaseFilter(row, '', 'sportsdataverse/hoopR-nba-data'));
  assert.ok(!matchesReleaseFilter(row, '', 'sportsdataverse/wehoop-wbb-data'));
  assert.ok(!matchesReleaseFilter(row, '', UNMAPPED));
  assert.ok(matchesReleaseFilter(orphan, '', UNMAPPED));
  assert.ok(matchesReleaseFilter(orphan, 'unmapped', ''));
});

test('loader: unreachable, non-200 and bad JSON are null; a good body normalises', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await loadEcosystemSummary('https://example.test/s.json'), null);
    globalThis.fetch = async () => new Response('Not Found', { status: 404 });
    assert.equal(await loadEcosystemSummary('https://example.test/s.json'), null);
    globalThis.fetch = async () => new Response('{not json', { status: 200 });
    assert.equal(await loadEcosystemSummary('https://example.test/s.json'), null);
    let seen = '';
    globalThis.fetch = async (input) => {
      seen = String(input);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };
    const s = await loadEcosystemSummary('https://example.test/s.json');
    assert.equal(seen, 'https://example.test/s.json');
    assert.equal(s?.producers.length, 6);
  } finally {
    globalThis.fetch = realFetch;
  }
});
