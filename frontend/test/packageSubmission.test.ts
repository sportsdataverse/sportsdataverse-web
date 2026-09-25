import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { packageSubmissionSchema, submitPackage } from '../lib/packageSubmission.ts';
import { isPubliclyVisible } from '../lib/packageVisibility.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const GOOD = {
  title: 'hoopR', repoType: 'R' as const, sports: 'MBB',
  content: 'Play-by-play and box scores for college and pro basketball.',
  sourceHref: 'https://github.com/sportsdataverse/hoopR',
};

test('a submission is stored hidden, stamped with who sent it and what they asked for', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const r = await submitPackage(db, GOOD, person, true, T0);
  assert.equal(r.ok, true);
  const doc = dump('packages')[0];
  assert.equal(String(doc.submittedBy), String(person));
  assert.equal(doc.orgTierRequested, true);
  assert.equal(isPubliclyVisible(doc), false, 'a stranger never reaches the public site');
});

test('a client-supplied published flag never survives', async () => {
  const parsed = packageSubmissionSchema.safeParse({ ...GOOD, published: true });
  assert.equal(parsed.success, true, 'unknown keys are stripped, not rejected');
  assert.equal('published' in parsed.data!, false);
  // and even if something upstream let it through, the write overrides it
  const { db, dump } = fakeDb();
  await submitPackage(db, { ...GOOD, published: true } as never, new ObjectId(), false, T0);
  assert.equal(dump('packages')[0].published, false);
});

test('a malformed submission is refused', () => {
  assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, sourceHref: 'not-a-url' }).success, false);
  assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, repoType: 'Rust' }).success, false);
});

test('a database failure is reported, never thrown', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('packages', new Error('mongo down'));
  const r = await submitPackage(db, GOOD, new ObjectId(), false, T0);
  assert.equal(r.ok, false);
  assert.match(r.message, /could not/i);
});
