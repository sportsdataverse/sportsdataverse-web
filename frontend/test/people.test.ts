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

import { recordSurvey, upsertJoin, markNewsletterPending, markNewsletterConfirmed, findPersonById, listPeople, setReviewStatus, recordDiscordInvite, linkGithubLogin, listUnsyncedNewsletter, deletePerson } from '../lib/people.ts';
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

const PROFILE2 = { role: 'student', languages: ['Python'], sports: ['NBA'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as const;

test('the queue lists pending people who asked for Discord, newest first', async () => {
  const { db } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T1);
  const queue = await listPeople(db, { status: 'pending', wantsDiscord: true });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].email, 'a@b.co');
});

test('a review stamps who decided, when, and why', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  await setReviewStatus(db, personId, 'declined', 'saiemgilani', T1, 'no vouch');
  const [p] = dump('people');
  assert.equal(p.status, 'declined');
  assert.equal(p.reviewedBy, 'saiemgilani');
  assert.equal((p.reviewedAt as Date).getTime(), T1.getTime());
  assert.equal(p.declineReason, 'no vouch');
});

test('an invite is stored with its expiry', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  const expiresAt = new Date(T1.getTime() + 604800_000);
  await recordDiscordInvite(db, personId, { code: 'abc123', expiresAt }, T1);
  const d = dump('people')[0].discord as { code: string; expiresAt: Date; invitedAt: Date };
  assert.equal(d.code, 'abc123');
  assert.equal(d.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(d.invitedAt.getTime(), T1.getTime());
});

test('a github login is linked once and never stolen from another person', async () => {
  const { db } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  const b = await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  assert.equal(await linkGithubLogin(db, a.personId, 'octocat'), true);
  assert.equal(await linkGithubLogin(db, a.personId, 'octocat'), true, 'idempotent for the same person');
  assert.equal(await linkGithubLogin(db, b.personId, 'octocat'), false, 'already someone else');
});

test('unsynced newsletter people are listed, and a person can be deleted', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T0);
  await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: false } }, T0);
  const unsynced = await listUnsyncedNewsletter(db);
  assert.deepEqual(unsynced.map((p) => p.email), ['a@b.co']);
  assert.equal(await deletePerson(db, a.personId), true);
  assert.equal(dump('people').length, 1);
});
