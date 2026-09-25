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
