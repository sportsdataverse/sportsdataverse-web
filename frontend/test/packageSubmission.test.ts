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

test('the same person resubmitting the same title keeps one row, holding the FIRST submission', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const T1 = new Date('2026-09-25T13:00:00Z');
  const first = await submitPackage(db, GOOD, person, false, T0);
  const second = await submitPackage(db, { ...GOOD, content: 'An updated description.' }, person, true, T1);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const rows = dump('packages');
  assert.equal(rows.length, 1, 'one row, not two');
  assert.equal(rows[0].content, GOOD.content, 'the first submission stands');
  assert.equal(rows[0].orgTierRequested, false, 'and so does its org-tier answer');
  assert.deepEqual(rows[0].createdAt, T0);
  assert.deepEqual(rows[0].updatedAt, T0, 'a resubmission writes nothing');
  assert.equal(second.packageId, undefined, 'no new id — nothing was created');
  assert.equal(second.message, first.message, 'the same sentence either way, or the reply says whether that person submitted that title');
});

test('a second submission with different links for the same email and title leaves the first links untouched', async () => {
  const { db, dump } = fakeDb();
  const victim = new ObjectId();
  const links = { docsHref: 'https://hoopr.sportsdataverse.org', logoHref: 'https://example.org/hoopR.png', dataRepoHref: 'https://github.com/sportsdataverse/hoopR-data' };
  await submitPackage(db, { ...GOOD, ...links }, victim, false, T0);
  // anyone who types the victim's email and package title reaches the same submittedBy
  const r = await submitPackage(
    db,
    {
      ...GOOD,
      sourceHref: 'https://evil.example/hoopR',
      docsHref: 'https://evil.example/docs',
      logoHref: 'https://evil.example/logo.png',
      dataRepoHref: 'https://evil.example/data',
    },
    victim,
    true,
    T0
  );
  assert.equal(r.ok, true);
  const rows = dump('packages');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceHref, GOOD.sourceHref);
  assert.equal(rows[0].docsHref, links.docsHref);
  assert.equal(rows[0].logoHref, links.logoHref);
  assert.equal(rows[0].dataRepoHref, links.dataRepoHref);
  assert.equal(rows[0].orgTierRequested, false);
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

test('resubmitting a title that was already published changes nothing: no edit to the live row, no duplicate listing', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  await submitPackage(db, GOOD, person, false, T0);
  dump('packages')[0].published = true; // a member approved it, directly in the store
  const second = await submitPackage(db, { ...GOOD, content: 'A fresh pitch for the same package.' }, person, false, T0);
  assert.equal(second.ok, true);
  const rows = dump('packages');
  assert.equal(rows.length, 1, 'no second row that could be approved into a duplicate listing');
  assert.equal(rows[0].published, true, 'the live listing stays published');
  assert.equal(rows[0].content, GOOD.content, 'and keeps its original content');
});
