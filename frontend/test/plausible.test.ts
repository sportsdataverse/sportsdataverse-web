import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchClickCounts } from '../lib/plausible.ts';

function fakePlausible(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('without a key it reports unconfigured and makes no request', async () => {
  const { fetchImpl, calls } = fakePlausible(200, {});
  const r = await fetchClickCounts({ apiKey: undefined, fetchImpl });
  assert.equal(r.status, 'unconfigured');
  assert.deepEqual(r.rows, []);
  assert.equal(calls.length, 0);
});

test('it sends the documented v2 query and maps the rows', async () => {
  const { fetchImpl, calls } = fakePlausible(200, {
    results: [
      { dimensions: ['follow_click', 'github', 'footer'], metrics: [42] },
      { dimensions: ['support_click', 'kofi', 'callout'], metrics: [7] },
    ],
  });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.rows, [
    { event: 'follow_click', platform: 'github', placement: 'footer', count: 42 },
    { event: 'support_click', platform: 'kofi', placement: 'callout', count: 7 },
  ]);
  assert.equal(calls[0].url, 'https://plausible.io/api/v2/query');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer k');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.site_id, 'sportsdataverse.org');
  assert.equal(body.date_range, '91d', 'there is no 90d preset');
  assert.deepEqual(body.metrics, ['events']);
  assert.deepEqual(body.filters, [['is', 'event:goal', ['follow_click', 'support_click']]]);
  assert.deepEqual(body.dimensions, ['event:goal', 'event:props:platform', 'event:props:placement']);
});

test('a Plausible error is reported with its status and never its body', async () => {
  const { fetchImpl } = fakePlausible(401, { error: 'Invalid API key secret-looking-thing' });
  const r = await fetchClickCounts({ apiKey: 'bad', fetchImpl });
  assert.equal(r.status, 'error');
  assert.equal(r.httpStatus, 401);
  assert.equal(JSON.stringify(r).includes('secret-looking-thing'), false);
});

test('a network failure or a malformed body is an error, never a throw', async () => {
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  assert.equal((await fetchClickCounts({ apiKey: 'k', fetchImpl: boom })).status, 'error');
  const { fetchImpl } = fakePlausible(200, { results: 'not-an-array' });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.status, 'error');
  assert.deepEqual(r.rows, []);
});

test('rows with an unexpected shape are skipped rather than trusted', async () => {
  const { fetchImpl } = fakePlausible(200, {
    results: [
      { dimensions: ['follow_click', 'github', 'footer'], metrics: [3] },
      { dimensions: ['follow_click'], metrics: [9] },
      { dimensions: ['follow_click', 'github', 'footer'], metrics: ['nine'] },
    ],
  });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.rows.length, 1);
});

test('a 200 whose body is valid JSON but not an object is an error, never a throw', async () => {
  for (const body of [null, 42, 'a string', [1, 2]]) {
    const { fetchImpl } = fakePlausible(200, body);
    const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
    assert.equal(r.status, 'error', JSON.stringify(body));
    assert.deepEqual(r.rows, []);
  }
});

test('the response is capped at the top 20 rows by count', async () => {
  const platforms = ['github', 'bluesky', 'twitter', 'kofi', 'digitalocean', 'paypal'];
  const placements = ['footer', 'footer-bar', 'callout', 'confirmed'];
  const results = platforms.flatMap((pl, i) =>
    placements.map((pc, j) => ({ dimensions: ['follow_click', pl, pc], metrics: [i * placements.length + j] }))
  ); // 24 real rows, counts 0..23
  const { fetchImpl } = fakePlausible(200, { results });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.rows.length, 20);
  assert.deepEqual(r.rows.map((row) => row.count), Array.from({ length: 20 }, (_, i) => 23 - i));
});

test('a row whose platform or placement the site never emits is dropped, however many events it has', async () => {
  // anyone can POST a Plausible event for our domain with any property text
  const { fetchImpl } = fakePlausible(200, {
    results: [
      { dimensions: ['follow_click', 'Visit evil.example for free data', 'footer'], metrics: [900] },
      { dimensions: ['support_click', 'kofi', 'email me at someone@example.com'], metrics: [800] },
      { dimensions: ['follow_click', '(none)', '(none)'], metrics: [700] },
      { dimensions: ['follow_click', 'github', 'footer'], metrics: [3] },
      { dimensions: ['support_click', 'kofi', 'join-thanks'], metrics: [2] },
      { dimensions: ['follow_click', 'bluesky', 'survey-thanks'], metrics: [1] },
    ],
  });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.deepEqual(r.rows, [
    { event: 'follow_click', platform: 'github', placement: 'footer', count: 3 },
    { event: 'support_click', platform: 'kofi', placement: 'join-thanks', count: 2 },
    { event: 'follow_click', platform: 'bluesky', placement: 'survey-thanks', count: 1 },
  ]);
});
