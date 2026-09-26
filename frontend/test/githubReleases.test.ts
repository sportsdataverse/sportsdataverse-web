import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listRepoReleases } from '../lib/platform/github.ts';

// sportsdataverse-data had 350 releases on 2026-09-26. A three-page cap
// silently dropped the 50 OLDEST — espn_cfb_pbp, espn_nba_pbp, nba_stats_pbp,
// the ESPN shots and rosters releases — from Explore and Datasets.
test('every page of releases is read, not just the first three', async () => {
  const real = globalThis.fetch;
  const sizes = [100, 100, 100, 50];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get('page'));
    const n = sizes[page - 1] ?? 0;
    const body = Array.from({ length: n }, (_, i) => ({
      tag_name: `t${page}_${i}`, name: null, html_url: '', published_at: '2026-01-01T00:00:00Z', assets: [],
    }));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const releases = await listRepoReleases('sportsdataverse/test-many-releases');
    assert.equal(releases.length, 350);
    assert.ok(releases.some((r) => r.tag === 't4_49'));
  } finally {
    globalThis.fetch = real;
  }
});
