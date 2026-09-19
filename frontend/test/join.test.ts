import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { handleJoin } from '../lib/join.ts';

function resend(status: number, body: unknown) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}
const okResend = () => resend(200, { object: 'contact', id: 'c-479e' });

test('400 on an invalid body, nothing stored', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'nope' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  assert.equal(r.status, 400);
  assert.equal(r.body.success, false);
  assert.equal(dump('people').length, 0);
});

test('200: person saved, Resend called, sync recorded', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'A@B.co', placement: 'footer' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 1);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-479e');
});

test('Resend failure still returns 200 and keeps the person unsynced', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: resend(500, {}).fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1);
  assert.equal(dump('people')[0].newsletter, undefined);
  assert.match(logs[0], /resend sync failed/);
});

test('an address that opted out in Resend is recorded as unsubscribed, not re-subscribed', async () => {
  const { db, dump } = fakeDb();
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    const body = n === 1 ? { message: 'Contact already exists' } : { object: 'contact', id: 'c-old', unsubscribed: true };
    return new Response(JSON.stringify(body), { status: n === 1 ? 409 : 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(n, 2); // POST then GET; never a PATCH that flips unsubscribed
  assert.equal((dump('people')[0].newsletter as { unsubscribed?: true }).unsubscribed, true);
});

test('a reserved-domain email is stored but never sent to Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'walkthrough@example.com' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});

test('429 after five signups from one address in an hour', async () => {
  const { db } = fakeDb();
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl };
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleJoin({ email: `u${i}@b.co` }, '9.9.9.9', deps)).status, 200);
  }
  const sixth = await handleJoin({ email: 'u6@b.co' }, '9.9.9.9', deps);
  assert.equal(sixth.status, 429);
  assert.equal((await handleJoin({ email: 'u7@b.co' }, '8.8.8.8', deps)).status, 200);
});
