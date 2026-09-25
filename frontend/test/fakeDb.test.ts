import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';

// Self-test for the $set/$setOnInsert/$unset/$inc path-conflict check that
// mirrors real MongoDB's "Updating the path '...' would create a conflict"
// error. Without a test pinning the check itself, deleting it leaves the rest
// of the suite green — see task-3-review.md finding 4.

test('a parent path in one operator and a child path in another throws, like real Mongo', async () => {
  const { db } = fakeDb();
  await assert.rejects(
    db.collection<{ _id: string }>('x').updateOne(
      { _id: 'a' },
      { $set: { wants: { newsletter: true } }, $setOnInsert: { 'wants.stickers': false } }
    ),
    /conflict/
  );
});

test('the same path in $set and $unset throws', async () => {
  const { db } = fakeDb();
  await assert.rejects(
    db.collection<{ _id: string }>('x').updateOne({ _id: 'a' }, { $set: { a: 1 }, $unset: { a: '' } }),
    /conflict/
  );
});

test('sibling paths that merely share a prefix string do not throw', async () => {
  const { db } = fakeDb();
  await assert.doesNotReject(
    db.collection<{ _id: string }>('x').updateOne({ _id: 'a' }, { $set: { 'wants.a': 1 }, $setOnInsert: { 'wants.ab': 2 } })
  );
});

test('a parent and a child path inside ONE operator throws too', async () => {
  const { db } = fakeDb();
  await assert.rejects(
    db.collection<{ _id: string }>('x').updateOne({ _id: 'a' }, { $set: { wants: { newsletter: true }, 'wants.package': true } }),
    /conflict/
  );
});
