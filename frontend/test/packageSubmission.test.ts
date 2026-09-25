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
  assert.equal(String(doc._id), String(r.packageId), 'the returned id is the stored id');
  assert.deepEqual(doc.createdAt, T0);
  assert.deepEqual(doc.updatedAt, T0);
  assert.equal(isPubliclyVisible(doc), false, 'a stranger never reaches the public site');
});

test('a client-supplied published flag never survives', async () => {
  const parsed = packageSubmissionSchema.safeParse({ ...GOOD, published: true });
  assert.equal(parsed.success, true, 'unknown keys are stripped, not rejected');
  assert.equal('published' in parsed.data!, false);
  // and even if something upstream let it through, the write overrides it
  const { db, dump } = fakeDb();
  await submitPackage(db, { ...GOOD, published: true } as never, new ObjectId(), false, T0);
  const doc = dump('packages')[0];
  assert.equal(doc.published, false);
  assert.equal(doc.orgTierRequested, false, 'the false case is written too, not just the true one');
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

test('a forged _id, createdBy, updatedBy, or submittedBy on the input never reaches the write', async () => {
  const { db, dump } = fakeDb();
  const real = new ObjectId();
  const forged = {
    ...GOOD,
    _id: 'attacker',
    createdBy: 'saiemgilani',
    updatedBy: 'saiemgilani',
    submittedBy: new ObjectId(), // a foreign id the caller has no business setting
  } as never;
  const r = await submitPackage(db, forged, real, true, T0);
  assert.equal(r.ok, true);
  const doc = dump('packages')[0];
  // the fake driver mints its own id for a doc with none — the point here is
  // that the attacker's literal string never makes it into the collection
  assert.notEqual(doc._id, 'attacker');
  assert.equal(String(doc._id), String(r.packageId));
  assert.equal('createdBy' in doc, false);
  assert.equal('updatedBy' in doc, false);
  assert.equal(String(doc.submittedBy), String(real), 'submittedBy is always the function argument, never the input');
});

test('an input that fails the schema is refused before any write', async () => {
  const { db, dump } = fakeDb();
  const r = await submitPackage(db, { ...GOOD, sourceHref: 'not-a-url' } as never, new ObjectId(), false, T0);
  assert.equal(r.ok, false);
  assert.equal(dump('packages').length, 0, 'a rejected submission writes nothing');
});

test('a submission may only link to http(s): script and data URLs are refused on every link field', () => {
  const hostile = [
    'javascript:alert(document.cookie)', 'JavaScript:alert(1)', ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'ftp://example.com/x',
  ];
  for (const url of hostile) {
    for (const field of ['sourceHref', 'docsHref', 'logoHref', 'dataRepoHref']) {
      assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, [field]: url }).success, false, `${field} = ${url}`);
    }
  }
  for (const url of ['https://github.com/sportsdataverse/hoopR', 'http://example.org/x', 'HTTPS://EXAMPLE.COM/y']) {
    assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, sourceHref: url }).success, true, url);
  }
  assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, docsHref: '' }).success, true, 'an empty optional link is just absent');
});

test('a script URL never reaches the database, even from a caller that skips parsing', async () => {
  const { db, dump } = fakeDb();
  const r = await submitPackage(db, { ...GOOD, sourceHref: 'javascript:alert(1)' } as never, new ObjectId(), false, T0);
  assert.equal(r.ok, false);
  assert.equal(dump('packages').length, 0);
});

test('the same person resubmitting the same title updates one row, not a duplicate', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const T1 = new Date('2026-09-25T13:00:00Z');
  const first = await submitPackage(db, GOOD, person, false, T0);
  const second = await submitPackage(db, { ...GOOD, content: 'An updated description.' }, person, true, T1);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const rows = dump('packages');
  assert.equal(rows.length, 1, 'one row, not two');
  assert.equal(rows[0].content, 'An updated description.', 'holds the second submission');
  assert.equal(rows[0].orgTierRequested, true);
  assert.deepEqual(rows[0].createdAt, T0, 'createdAt is untouched by the update');
  assert.deepEqual(rows[0].updatedAt, T1);
  assert.equal(second.packageId, undefined, 'no new id — nothing was created');
});

test('the same person submitting two different titles leaves two rows', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  await submitPackage(db, GOOD, person, false, T0);
  await submitPackage(
    db,
    { ...GOOD, title: 'wehoop', sourceHref: 'https://github.com/sportsdataverse/wehoop' },
    person,
    false,
    T0
  );
  assert.equal(dump('packages').length, 2);
});

test('resubmitting a title that was already published starts a new pending row, not an edit to the live one', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  await submitPackage(db, GOOD, person, false, T0);
  dump('packages')[0].published = true; // a member approved it, directly in the store
  const second = await submitPackage(db, { ...GOOD, content: 'A fresh pitch for the same package.' }, person, false, T0);
  assert.equal(second.ok, true);
  const rows = dump('packages');
  assert.equal(rows.length, 2, 'the live row is untouched, a new pending row is added');
  assert.equal(rows.find((r) => r.published === true)?.content, GOOD.content, 'the live listing keeps its original content');
  assert.equal(rows.find((r) => r.published === false)?.content, 'A fresh pitch for the same package.');
});
