import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchIsContributor } from '../lib/contributor.ts';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('one merged PR in the org makes someone a contributor', async () => {
  const { fetchImpl, calls } = fakeFetch(200, { total_count: 2 });
  assert.equal(await fetchIsContributor('gho_x', fetchImpl), true);
  assert.match(calls[0].url, /search\/issues/);
  assert.match(decodeURIComponent(calls[0].url), /org:sportsdataverse/);
  assert.match(decodeURIComponent(calls[0].url), /is:pr/);
  assert.match(decodeURIComponent(calls[0].url), /is:merged/);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer gho_x');
});

test('no merged PRs, and any API failure, read as not a contributor', async () => {
  assert.equal(await fetchIsContributor('gho_x', fakeFetch(200, { total_count: 0 }).fetchImpl), false);
  // total_count is present so this pins the !res.ok guard: drop the guard and this goes red
  assert.equal(await fetchIsContributor('gho_x', fakeFetch(403, { message: 'rate limited', total_count: 5 }).fetchImpl), false);
  const boom = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  assert.equal(await fetchIsContributor('gho_x', boom), false);
});
