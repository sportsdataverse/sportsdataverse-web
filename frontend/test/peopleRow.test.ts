import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { peopleViewFilter, personRow } from '../lib/peopleRow.ts';

const base = {
  _id: new ObjectId(), email: 'a@b.co', name: 'Pat', status: 'pending' as const,
  wants: { discord: true, newsletter: false, stickers: false, package: false },
  createdAt: new Date('2026-09-25T12:00:00Z'), updatedAt: new Date('2026-09-25T12:00:00Z'),
  socials: { github: 'octocat' }, affiliations: [{ type: 'media' as const, org: 'The Ringer' }],
  location: { country: 'US', region: 'TX' }, answers: { role: 'industry' },
};

test('a Discord requester awaiting review shows affiliations and socials', () => {
  const r = personRow(base as never);
  assert.deepEqual(r.socials, { github: 'octocat' });
  assert.deepEqual(r.affiliations, [{ type: 'media', org: 'The Ringer' }]);
});

test('anyone else shows neither', () => {
  for (const p of [{ ...base, status: 'approved' }, { ...base, wants: { ...base.wants, discord: false } }, { ...base, status: 'survey' }]) {
    const r = personRow(p as never);
    assert.equal(r.socials, null);
    assert.equal(r.affiliations, null);
  }
});

test('a row never carries location, answers or the invite code', () => {
  const r = personRow({ ...base, discord: { code: 'SECRET', expiresAt: new Date(), invitedAt: new Date() } } as never) as Record<string, unknown>;
  assert.equal('location' in r, false);
  assert.equal('answers' in r, false);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.equal(r.hasInvite, true);
});

// --- C1: a non-admin's "all" view must never expose a non-Discord respondent ---

// No explicit _id (matches the pattern in test/people.test.ts): fakeDb assigns
// its own plain-string id on insert, so rows are told apart by email instead.
async function seedSample(db: ReturnType<typeof fakeDb>['db']) {
  await db.collection('people').insertOne({
    email: 'jane@real.org', name: 'Jane Private', status: 'survey',
    wants: { discord: false, newsletter: false, stickers: false, package: false },
  } as never);
  await db.collection('people').insertOne({
    email: 'req@real.org', name: 'Req Uester', status: 'pending',
    wants: { discord: true, newsletter: false, stickers: false, package: false },
  } as never);
}

test('a non-admin "all" filter never matches a survey respondent who never asked for Discord', async () => {
  const { db } = fakeDb();
  await seedSample(db);
  const rows = await db.collection('people').find(peopleViewFilter('all', false)).toArray();
  assert.deepEqual(rows.map((r) => r.email), ['req@real.org']);
});

test('an admin "all" filter matches both', async () => {
  const { db } = fakeDb();
  await seedSample(db);
  const rows = await db.collection('people').find(peopleViewFilter('all', true)).toArray();
  assert.deepEqual(rows.map((r) => r.email).sort(), ['jane@real.org', 'req@real.org']);
});

test('queue and unsynced filters are unchanged by admin status', () => {
  assert.deepEqual(peopleViewFilter('queue', false), peopleViewFilter('queue', true));
  assert.deepEqual(peopleViewFilter('unsynced', false), peopleViewFilter('unsynced', true));
  assert.deepEqual(peopleViewFilter('queue', false), { status: 'pending', 'wants.discord': true });
  assert.deepEqual(peopleViewFilter('unsynced', false), {
    'wants.newsletter': true,
    'newsletter.resendContactId': { $exists: false },
  });
});

// Mutation check (run by hand, not committed as code): replacing the non-admin
// `all` branch with `return {};` makes the first test above go red — the
// survey row is then included.
