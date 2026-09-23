import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToResend } from '../lib/newsletter.ts';

type Reply = { status: number; body: unknown };
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('creates the contact with a bearer key and returns its id', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { object: 'contact', id: 'c-479e' } }]);
  const r = await subscribeToResend('a@b.co', { apiKey: 're_test', fetchImpl });
  assert.deepEqual(r, { contactId: 'c-479e', unsubscribed: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/contacts');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { email: 'a@b.co', unsubscribed: false });
});

test('an existing contact (409) is looked up by email instead', async () => {
  const { fetchImpl, calls } = fakeFetch([
    { status: 409, body: { name: 'conflict', message: 'Contact already exists' } },
    { status: 200, body: { object: 'contact', id: 'c-old', email: 'a@b.co', unsubscribed: true } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 're_test', fetchImpl });
  // reported, not reset: an anonymous form must not undo someone's unsubscribe
  assert.deepEqual(r, { contactId: 'c-old', unsubscribed: true });
  assert.equal(calls[1].url, 'https://api.resend.com/contacts/a%40b.co');
  assert.equal(calls[1].init.method, 'GET');
});

test('throws on a missing key, a non-2xx, and a body without an id', async () => {
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: undefined }), /RESEND_API_KEY/);
  const unauth = fakeFetch([{ status: 401, body: { message: 'API key is invalid' } }]);
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: unauth.fetchImpl }), /Resend 401/);
  const empty = fakeFetch([{ status: 200, body: {} }]);
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: empty.fetchImpl }), /no contact id/);
});

test('properties ride on create, and are PATCHed onto an existing contact', async () => {
  const props = { role: 'developer', languages: 'R' };
  const created = fakeFetch([{ status: 200, body: { object: 'contact', id: 'c-1' } }]);
  await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: created.fetchImpl }, props);
  assert.deepEqual(JSON.parse(String(created.calls[0].init.body)), { email: 'a@b.co', unsubscribed: false, properties: props });

  const existing = fakeFetch([
    { status: 409, body: { message: 'exists' } },
    { status: 200, body: { object: 'contact', id: 'c-old', unsubscribed: false } },
    { status: 200, body: { object: 'contact', id: 'c-old' } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: existing.fetchImpl }, props);
  assert.deepEqual(r, { contactId: 'c-old', unsubscribed: false });
  assert.equal(existing.calls[2].init.method, 'PATCH');
  assert.equal(existing.calls[2].url, 'https://api.resend.com/contacts/a%40b.co');
  assert.deepEqual(JSON.parse(String(existing.calls[2].init.body)), { properties: props });
});

test('confirm may resubscribe: PATCH flips unsubscribed back on when asked', async () => {
  const { fetchImpl, calls } = fakeFetch([
    { status: 409, body: { message: 'exists' } },
    { status: 200, body: { object: 'contact', id: 'c-old', unsubscribed: true } },
    { status: 200, body: { object: 'contact', id: 'c-old', unsubscribed: false } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl }, undefined, { resubscribe: true });
  assert.deepEqual(r, { contactId: 'c-old', unsubscribed: false });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { unsubscribed: false });
});

test('a property Resend rejects is retried without properties, not lost', async () => {
  const props = { role: 'developer' };
  const { fetchImpl, calls } = fakeFetch([
    { status: 422, body: { message: 'property does not exist' } },
    { status: 200, body: { object: 'contact', id: 'c-2' } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl }, props);
  assert.deepEqual(r, { contactId: 'c-2', unsubscribed: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { email: 'a@b.co', unsubscribed: false });
});

test('a 4xx that does not name a property is not retried', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 429, body: { message: 'Too many requests' } }]);
  await assert.rejects(
    subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl }, { role: 'developer' }),
    /Resend 429/
  );
  assert.equal(calls.length, 1, 'no pointless second create');
});

test('the property-rejection retry logs no email address', async () => {
  const logs: string[] = [];
  const { fetchImpl } = fakeFetch([
    { status: 422, body: { message: 'Unknown property key: role' } },
    { status: 200, body: { object: 'contact', id: 'c-1' } },
  ]);
  await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl, log: (m) => logs.push(m) }, { role: 'developer' });
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('a@b.co'), logs[0]);
});
