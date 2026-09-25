import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { PUBLIC_PACKAGE_FILTER, isPubliclyVisible } from '../lib/packageVisibility.ts';

const legacy = { title: 'cfbfastR', published: false };              // every existing doc looks like this
const created = { title: 'wehoop', published: true };                // made in the CMS form
const submitted = { title: 'strangerPkg', published: false, submittedBy: new ObjectId() };
const approved = { title: 'approvedPkg', published: true, submittedBy: new ObjectId() };

test('legacy and CMS-created packages stay visible; a submission is hidden until approved', () => {
  assert.equal(isPubliclyVisible(legacy), true, 'a legacy doc must not vanish');
  assert.equal(isPubliclyVisible(created), true);
  assert.equal(isPubliclyVisible(submitted), false, 'a stranger never reaches the public site');
  assert.equal(isPubliclyVisible(approved), true, 'until a member approves it');
});

test('the Mongo filter agrees with the predicate on the same four documents', async () => {
  const { db } = fakeDb();
  for (const d of [legacy, created, submitted, approved]) await db.collection('packages').insertOne({ ...d });
  const titles = (await db.collection('packages').find(PUBLIC_PACKAGE_FILTER).toArray()).map((p) => p.title).sort();
  assert.deepEqual(titles, ['approvedPkg', 'cfbfastR', 'wehoop']);
});
