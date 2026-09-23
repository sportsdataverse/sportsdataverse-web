import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertNewsletterSignup, markNewsletterSynced, markNewsletterSkipped } from '../lib/people.ts';

const T0 = new Date('2026-09-19T12:00:00Z');
const T1 = new Date('2026-09-19T13:00:00Z');

test('first signup inserts a pending person wanting only the newsletter', async () => {
  const { db, dump } = fakeDb();
  const r = await upsertNewsletterSignup(db, { email: 'a@b.co', placement: 'footer' }, T0);
  assert.equal(r.created, true);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false });
  assert.deepEqual(p.signup, { placement: 'footer' });
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

import { recordSurvey, upsertJoin, markNewsletterPending, markNewsletterConfirmed, findPersonById } from '../lib/people.ts';
import type { Profile } from '../lib/survey.ts';

const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'twitter', updatesVia: ['github'], newsChannel: 'email' } as const;

test('recordSurvey inserts an anonymous row', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await recordSurvey(db, { answers: { role: 'developer' }, profile: PROFILE as unknown as Profile }, T0);
  assert.ok(personId);
  const [p] = dump('people');
  assert.equal(p.status, 'survey');
  assert.equal(p.email, undefined);
  assert.deepEqual(p.profile, PROFILE);
  assert.deepEqual(p.wants, { discord: false, newsletter: false, stickers: false, package: false });
});

test('upsertJoin creates with profile + wants, then updates the same email without duplicating', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', name: 'A', answers: { role: 'developer' }, profile: PROFILE as unknown as Profile, wants: { newsletter: true, discord: true }, placement: 'join' }, T0);
  assert.equal(a.created, true);
  const b = await upsertJoin(db, { email: 'a@b.co', answers: { role: 'student' }, profile: { ...PROFILE, role: 'student' } as unknown as Profile, wants: { newsletter: false, discord: true } }, T1);
  assert.equal(b.created, false);
  assert.equal(dump('people').length, 1);
  const [p] = dump('people');
  assert.equal(p.name, 'A');
  assert.equal((p.profile as { role: string }).role, 'student');
  assert.deepEqual(p.wants, { discord: true, newsletter: false, stickers: false, package: false });
  assert.equal(p.status, 'pending');
  assert.equal((p.createdAt as Date).getTime(), T0.getTime());
});

test('opt-in bookkeeping: pending, then confirmed', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE as unknown as Profile, wants: { newsletter: true, discord: false } }, T0);
  await markNewsletterPending(db, personId, T0);
  assert.deepEqual(dump('people')[0].newsletter, { pending: { sentAt: T0 } });
  await markNewsletterConfirmed(db, personId, 'c-1', T1);
  assert.deepEqual(dump('people')[0].newsletter, { resendContactId: 'c-1', syncedAt: T1, confirmedAt: T1 });
  const found = await findPersonById(db, String(personId));
  assert.equal(found?.email, 'a@b.co');
});
