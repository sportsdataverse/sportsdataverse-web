import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { personRow } from '../lib/peopleRow.ts';

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
