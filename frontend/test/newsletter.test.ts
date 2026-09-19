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
