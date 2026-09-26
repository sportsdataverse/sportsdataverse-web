import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
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

// Equality as a real MongoDB query applies it. The fake used to compare
// String(a) === String(b) and deep-copy reads with structuredClone, which
// turns an ObjectId into a plain object: an id read back could never match
// again, and every such id stringified to "[object Object]".

test('an ObjectId read back is still an ObjectId and still matches', async () => {
  const { db } = fakeDb();
  const personId = new ObjectId();
  await db.collection('r').insertOne({ personId, at: new Date('2026-09-25T12:00:00.123Z') });
  const row = await db.collection('r').findOne({ personId });
  assert.ok(row?.personId instanceof ObjectId);
  assert.ok(row.at instanceof Date);
  assert.equal(String(row.personId), personId.toHexString());
  assert.equal(await db.collection('r').countDocuments({ personId: row.personId }), 1);
});

test('no coercion across types: an ObjectId never equals its hex string, 1 never equals "1"', async () => {
  const { db } = fakeDb();
  const personId = new ObjectId();
  await db.collection('r').insertOne({ personId, n: 1 });
  assert.equal(await db.collection('r').countDocuments({ personId: personId.toHexString() }), 0);
  assert.equal(await db.collection('r').countDocuments({ n: '1' }), 0);
  assert.equal(await db.collection('r').countDocuments({ personId: { $ne: personId.toHexString() } }), 1);
});

test('dates match to the millisecond', async () => {
  const { db } = fakeDb();
  await db.collection('r').insertOne({ at: new Date('2026-09-25T12:00:00.100Z') });
  assert.equal(await db.collection('r').countDocuments({ at: new Date('2026-09-25T12:00:00.100Z') }), 1);
  assert.equal(await db.collection('r').countDocuments({ at: new Date('2026-09-25T12:00:00.900Z') }), 0);
});

test('an array field matches any element it holds; null matches a missing field', async () => {
  const { db } = fakeDb();
  await db.collection('r').insertOne({ sports: ['CFB', 'NFL'] });
  assert.equal(await db.collection('r').countDocuments({ sports: 'NFL' }), 1);
  assert.equal(await db.collection('r').countDocuments({ sports: 'NBA' }), 0);
  assert.equal(await db.collection('r').countDocuments({ sports: { $ne: 'NFL' } }), 0);
  assert.equal(await db.collection('r').countDocuments({ gone: null }), 1);
  await db.collection('n').insertOne({ sports: [null, 'CFB'] });
  assert.equal(await db.collection('n').countDocuments({ sports: null }), 1);
  assert.equal(await db.collection('n').countDocuments({ sports: { $ne: null } }), 0);
});

test('a read is still a copy: mutating it changes nothing stored', async () => {
  const { db, dump } = fakeDb();
  await db.collection('r').insertOne({ tags: ['a'], at: new Date(0) });
  const row = await db.collection('r').findOne({});
  (row!.tags as string[]).push('b');
  (row!.at as Date).setTime(5);
  assert.deepEqual(dump('r')[0].tags, ['a']);
  assert.equal((dump('r')[0].at as Date).getTime(), 0);
});

test('an ObjectId read back is a copy too: its bytes are writable through .id', async () => {
  const { db, dump } = fakeDb();
  const personId = new ObjectId();
  const hex = personId.toHexString();
  await db.collection('r').insertOne({ personId });
  const row = await db.collection('r').findOne({});
  (row!.personId as ObjectId).id.fill(0);
  assert.equal((dump('r')[0].personId as ObjectId).toHexString(), hex);
});
