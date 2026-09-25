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

import { upsertJoin, upsertSurvey, markNewsletterPending, markNewsletterConfirmed, findPersonById, listPeople, setReviewStatus, recordDiscordInvite, linkGithubLogin, listUnsyncedNewsletter, deletePerson } from '../lib/people.ts';
import type { Profile } from '../lib/survey.ts';

const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'twitter', updatesVia: ['github'], newsChannel: 'email' } as const;

test('upsertJoin creates with profile + wants, then updates the same email without duplicating', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', identity: { name: 'A', location: { country: 'US', region: 'TX' } }, answers: { role: 'developer' }, profile: PROFILE as unknown as Profile, wants: { newsletter: true, discord: true }, placement: 'join' }, T0);
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

test('a record already bound to a handle is never re-pointed to another', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  assert.equal(await linkGithubLogin(db, a.personId, 'victimlogin'), true);
  // the record's email came out of a request body, so a second caller must not
  // be able to overwrite the handle it is already bound to
  assert.equal(await linkGithubLogin(db, a.personId, 'attacker'), false);
  assert.equal(dump('people')[0].githubLogin, 'victimlogin');
  assert.equal(await linkGithubLogin(db, a.personId, 'VictimLogin'), true, 'the same handle in another case is the same person');
});

test('unsynced newsletter people are listed, excluding those with resendContactId or not newsletter subscribers', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T0);
  const b = await upsertJoin(db, { email: 'b@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T0);
  const c = await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: false } }, T0);
  // Mark b as synced with resendContactId
  await markNewsletterSynced(db, b.personId, 'c-synced', T0);
  const unsynced = await listUnsyncedNewsletter(db);
  assert.deepEqual(unsynced.map((p) => p.email), ['a@b.co'], 'excludes synced and non-newsletter people');
  assert.equal(await deletePerson(db, a.personId), true);
  assert.equal(dump('people').length, 2);
});

test('a github login race (concurrent link attempts) resolves to false for the second requester', async () => {
  const { db, failNextUpdateWith } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  // Simulate race: updateOne fails with E11000 and linkGithubLogin handles it gracefully
  failNextUpdateWith({ code: 11000 });
  const result = await linkGithubLogin(db, a.personId, 'racing-login');
  assert.equal(result, false, 'reports false on E11000 instead of throwing');
});

const ID1 = { name: 'Pat Doe', location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' }, affiliations: [{ type: 'media' as const, org: 'The Ringer' }] };
const ID2 = { name: 'Pat D.', location: { country: 'CA', region: 'ON' } };
const PROF = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as never;

test('upsertJoin stores the latest identity, and a resubmission without socials or affiliations removes them', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', identity: ID1, answers: { role: 'developer' }, profile: PROF, wants: { newsletter: false, discord: true } }, T0);
  let p = dump('people')[0];
  assert.equal(p.name, 'Pat Doe');
  assert.deepEqual(p.location, ID1.location);
  assert.deepEqual(p.socials, { github: 'octocat' });
  assert.equal((p.lastSubmittedAt as Date).getTime(), T0.getTime());
  await upsertJoin(db, { email: 'a@b.co', identity: ID2, answers: { role: 'developer' }, profile: PROF, wants: { newsletter: false, discord: true } }, T1);
  p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal(p.name, 'Pat D.');
  assert.equal(p.socials, undefined, 'latest wins: no socials this time means none stored');
  assert.equal(p.affiliations, undefined);
});

test('upsertJoin without identity leaves identity fields alone (the queue helpers in other tests rely on it)', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', identity: ID1, answers: {}, profile: PROF, wants: { newsletter: false, discord: true } }, T0);
  await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROF, wants: { newsletter: false, discord: true } }, T1);
  assert.equal(dump('people')[0].name, 'Pat Doe');
});

test('upsertSurvey creates a survey person with every want false', async () => {
  const { db, dump } = fakeDb();
  const r = await upsertSurvey(db, { email: 's@b.co', identity: ID1, answers: { role: 'student' }, profile: PROF }, T0);
  assert.equal(r.created, true);
  const p = dump('people')[0];
  assert.equal(p.status, 'survey');
  assert.deepEqual(p.wants, { discord: false, newsletter: false, stickers: false, package: false });
  assert.equal((p.answers as Record<string, unknown>).role, 'student');
  assert.equal(p.name, 'Pat Doe');
});

test('upsertSurvey on a /join person never touches wants, status, newsletter or the wants_* answers', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, {
    email: 'a@b.co', identity: ID1,
    answers: { role: 'developer', languages: ['R'], packages_r: ['cfbfastR'], wants_discord: 'yes', wants_newsletter: 'yes' },
    profile: PROF, wants: { newsletter: true, discord: true },
  }, T0);
  await db.collection('people').updateOne({ email: 'a@b.co' }, { $set: { newsletter: { resendContactId: 'c1', syncedAt: T0 } } });
  await upsertSurvey(db, { email: 'a@b.co', identity: ID2, answers: { role: 'student', languages: ['Python'] }, profile: PROF }, T1);
  const p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.wants, { newsletter: true, discord: true, package: false, stickers: false });
  assert.deepEqual(p.newsletter, { resendContactId: 'c1', syncedAt: T0 });
  const a = p.answers as Record<string, unknown>;
  assert.equal(a.wants_discord, 'yes');
  assert.equal(a.wants_newsletter, 'yes');
  assert.equal(a.role, 'student');
  assert.deepEqual(a.languages, ['Python']);
  assert.equal(a.packages_r, undefined, 'a survey question not answered this time is cleared, not left stale');
  assert.equal(p.name, 'Pat D.');
});

test('upsertSurvey never matches a legacy anonymous row (no email)', async () => {
  const { db, dump } = fakeDb();
  await db.collection('people').insertOne({ answers: { role: 'hobbyist' }, status: 'survey', wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T0 });
  await upsertSurvey(db, { email: 's@b.co', identity: ID1, answers: { role: 'student' }, profile: PROF }, T1);
  assert.equal(dump('people').length, 2);
  assert.equal((dump('people')[0].answers as Record<string, unknown>).role, 'hobbyist');
});
