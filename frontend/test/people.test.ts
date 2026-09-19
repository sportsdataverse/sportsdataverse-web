import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertNewsletterSignup, markNewsletterSynced, markNewsletterSkipped } from '../lib/people.ts';

const T0 = new Date('2026-09-19T12:00:00Z');
const T1 = new Date('2026-09-19T13:00:00Z');

test('first signup inserts a pending person wanting only the newsletter', async () => {
  const { db, dump } = fakeDb();
  const r = await upsertNewsletterSignup(db, { email: 'a@b.co', ip: '1.2.3.4', placement: 'footer' }, T0);
  assert.equal(r.created, true);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false });
  assert.deepEqual(p.signup, { placement: 'footer' });
  assert.equal(p.ip, '1.2.3.4');
  assert.equal((p.createdAt as Date).getTime(), T0.getTime());
});

test('a second signup with the same email updates, never duplicates', async () => {
  const { db, dump } = fakeDb();
  await upsertNewsletterSignup(db, { email: 'a@b.co', placement: 'footer' }, T0);
  const r = await upsertNewsletterSignup(db, { email: 'a@b.co', placement: 'about' }, T1);
  assert.equal(r.created, false);
  assert.equal(dump('people').length, 1);
  const [p] = dump('people');
  assert.equal((p.createdAt as Date).getTime(), T0.getTime());
  assert.equal((p.updatedAt as Date).getTime(), T1.getTime());
  assert.deepEqual(p.signup, { placement: 'footer' }); // first placement wins
});

test('sync bookkeeping', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertNewsletterSignup(db, { email: 'a@b.co' }, T0);
  await markNewsletterSynced(db, personId, 'c-479e', T1);
  assert.deepEqual(dump('people')[0].newsletter, { resendContactId: 'c-479e', syncedAt: T1 });
  await markNewsletterSkipped(db, personId, 'reserved-domain');
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});
