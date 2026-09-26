import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { loadCommunity, personHistory, listRow, exportable, csvCell, toCsv, setDoNotContact, auditParams } from '../lib/communityData.ts';

const BOM = String.fromCharCode(0xfeff);

const T = (d: string) => new Date(`${d}T12:00:00Z`);
const ID1 = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };
const ID2 = { name: 'Pat D.', location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' } };

async function seed() {
  const { db, dump } = fakeDb();
  const people = db.collection('people');
  const pat = (await people.insertOne({ email: 'pat@real.org', name: 'Pat D.', status: 'pending', wants: { discord: true, newsletter: false, stickers: false, package: false },
    answers: { role: 'developer' }, location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' },
    discord: { code: 'SECRET', expiresAt: T('2026-10-01'), invitedAt: T('2026-09-24') },
    createdAt: T('2026-09-01'), updatedAt: T('2026-09-21'), lastSubmittedAt: T('2026-09-21') })).insertedId as ObjectId;
  const legacy = (await people.insertOne({ status: 'survey', answers: { role: 'hobbyist' }, wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T('2025-01-01') })).insertedId as ObjectId;
  const test = (await people.insertOne({ email: 'walkthrough@example.com', name: 'W', status: 'pending', wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T('2026-09-22') })).insertedId as ObjectId;
  const resp = db.collection('responses');
  await resp.insertOne({ personId: pat, source: 'survey', createdAt: T('2026-09-10'), identity: ID1, answers: { role: 'student' }, profile: {} });
  await resp.insertOne({ personId: pat, source: 'join', createdAt: T('2026-09-21'), identity: ID2, answers: { role: 'developer' }, profile: {} });
  return { db, dump, pat, legacy, test };
}

test('loadCommunity: latest source and identity change from responses; legacy falls back to status', async () => {
  const { db, pat, legacy } = await seed();
  const all = await loadCommunity(db);
  const p = all.find((x) => String(x._id) === String(pat))!;
  assert.equal(p.latestSource, 'join');
  assert.equal(p.identityChanged, true);
  assert.equal('discord' in p, false, 'the invite code never leaves the database layer');
  const l = all.find((x) => String(x._id) === String(legacy))!;
  assert.equal(l.latestSource, 'survey');
  assert.equal(l.identityChanged, false);
});

test('personHistory returns no invite code and no newsletter record (the page uses neither)', async () => {
  const { db, pat } = await seed();
  await db.collection('people').updateOne({ _id: pat }, { $set: { newsletter: { resendContactId: 'contact_123', syncedAt: T('2026-09-21') } } });
  const h = (await personHistory(db, pat))! as unknown as { person: Record<string, unknown> };
  assert.equal('discord' in h.person, false);
  assert.equal('newsletter' in h.person, false);
  assert.ok(!JSON.stringify(h).includes('contact_123'));
});

test('personHistory: newest first, identity changes marked; a legacy person gets one implicit entry', async () => {
  const { db, pat, legacy } = await seed();
  const h = (await personHistory(db, pat))!;
  assert.deepEqual(h.history.map((e) => [e.source, e.implicit, e.identityChanged]), [['join', false, true], ['survey', false, false]]);
  const l = (await personHistory(db, legacy))!;
  assert.equal(l.history.length, 1);
  assert.equal(l.history[0].implicit, true);
  assert.equal(l.history[0].source, 'survey');
  assert.equal(await personHistory(db, new ObjectId()), null);
});

test('listRow carries what the table shows, and nothing it does not', async () => {
  const { db, pat } = await seed();
  const row = listRow((await loadCommunity(db)).find((x) => String(x._id) === String(pat))!) as Record<string, unknown>;
  assert.equal(row.id, String(pat));
  assert.equal(row.email, 'pat@real.org');
  assert.equal(row.identityChanged, true);
  assert.equal('answers' in row, false);
  assert.ok(!JSON.stringify(row).includes('SECRET'));
});

test('exportable: never do-not-contact, anonymous or test addresses', async () => {
  const { db } = await seed();
  const all = await loadCommunity(db);
  assert.deepEqual(all.filter(exportable).map((p) => p.email), ['pat@real.org']);
});

test('exportable: consent requires an identified post-notice submission, and never an unsubscribed newsletter contact', async () => {
  const { db } = await seed();
  const people = db.collection('people');
  // footer-only signup: no answers, no identified submission ever made
  const footerOnly = (await people.insertOne({
    email: 'footer@real.org', status: 'pending',
    wants: { discord: false, newsletter: true, stickers: false, package: false },
    newsletter: { resendContactId: 'c1', syncedAt: T('2026-09-20') },
    createdAt: T('2026-09-20'), updatedAt: T('2026-09-20'),
  })).insertedId as ObjectId;
  // pre-notice /join: has answers, but joined before identityUpdate() started stamping lastSubmittedAt
  const preNotice = (await people.insertOne({
    email: 'prenotice@real.org', status: 'pending', name: 'Pre Notice',
    answers: { role: 'developer' },
    wants: { discord: true, newsletter: false, stickers: false, package: false },
    createdAt: T('2026-09-01'), updatedAt: T('2026-09-01'),
  })).insertedId as ObjectId;
  // identified and post-notice, but unsubscribed from the newsletter since
  const unsubscribed = (await people.insertOne({
    email: 'unsub@real.org', status: 'pending', name: 'Unsub',
    wants: { discord: true, newsletter: true, stickers: false, package: false },
    newsletter: { resendContactId: 'c2', syncedAt: T('2026-09-22'), unsubscribed: true },
    lastSubmittedAt: T('2026-09-22'),
    createdAt: T('2026-09-22'), updatedAt: T('2026-09-22'),
  })).insertedId as ObjectId;
  const all = await loadCommunity(db);
  const byId = (id: ObjectId) => all.find((p) => String(p._id) === String(id))!;
  assert.equal(exportable(byId(footerOnly)), false, 'footer-only signup never saw the contact notice');
  assert.equal(exportable(byId(preNotice)), false, 'joined before the contact notice existed');
  assert.equal(exportable(byId(unsubscribed)), false, 'unsubscribed from the newsletter');
  assert.equal(exportable(all.find((p) => p.email === 'pat@real.org')!), true, 'identified post-notice submission, not unsubscribed');
});

test('legacySource (via loadCommunity): survey status wins, then answers, otherwise newsletter', async () => {
  const { db } = await seed();
  const people = db.collection('people');
  const joinNoResponses = (await people.insertOne({
    email: 'joinonly@real.org', status: 'pending', answers: { role: 'developer' },
    wants: { discord: true, newsletter: false, stickers: false, package: false },
    createdAt: T('2026-09-05'), updatedAt: T('2026-09-05'),
  })).insertedId as ObjectId;
  const newsletterOnly = (await people.insertOne({
    email: 'newsletter-only@real.org', status: 'pending',
    wants: { discord: false, newsletter: true, stickers: false, package: false },
    createdAt: T('2026-09-05'), updatedAt: T('2026-09-05'),
  })).insertedId as ObjectId;
  const all = await loadCommunity(db);
  assert.equal(all.find((p) => String(p._id) === String(joinNoResponses))!.latestSource, 'join');
  assert.equal(all.find((p) => String(p._id) === String(newsletterOnly))!.latestSource, 'newsletter');
});

test('auditParams: redacts the search text (it can hold a name or email), keeps every other filter', () => {
  const withQ = new URLSearchParams();
  withQ.set('f.country', 'US');
  withQ.set('q', 'pat@real.org');
  assert.equal(auditParams(withQ), 'f.country=US&q=%5Bredacted%5D');
  assert.ok(!auditParams(withQ).includes('pat%40real.org'));
  assert.equal(auditParams(new URLSearchParams('f.country=US')), 'f.country=US');
});

test('do-not-contact takes effect on the very next export, both directions are audited', async () => {
  const { db, dump, pat } = await seed();
  assert.equal(await setDoNotContact(db, pat, true, 'saiem', T('2026-09-25')), true);
  assert.equal((await loadCommunity(db)).filter(exportable).length, 0);
  assert.equal(await setDoNotContact(db, pat, false, 'saiem', T('2026-09-26')), true);
  assert.equal((await loadCommunity(db)).filter(exportable).length, 1);
  assert.deepEqual(dump('admin_audit').map((a) => a.kind), ['dnc_on', 'dnc_off']);
  assert.equal(await setDoNotContact(db, new ObjectId(), true, 'saiem', T('2026-09-25')), false);
  assert.equal(dump('admin_audit').length, 2, 'no audit entry for a person who does not exist');
});

test('csvCell neutralizes formulas and quotes separators', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('csvCell also neutralizes a formula behind leading whitespace, quoted only when it also needs it', () => {
  assert.equal(csvCell(' =1+1'), "'" + ' =1+1');
  const prefixed = "'" + ' =1,1';
  assert.equal(csvCell(' =1,1'), `"${prefixed}"`);
});

test('toCsv: header, exportable rows only, null fields empty', async () => {
  const { db, pat } = await seed();
  await db.collection('people').updateOne({ _id: pat }, { $set: { socials: null, affiliations: null } });
  const csv = toCsv(await loadCommunity(db));
  assert.ok(csv.startsWith(BOM), 'starts with the UTF-8 BOM so Excel opens it correctly');
  const lines = csv.slice(BOM.length).trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^name,email,country,region,city,github,bluesky,x,linkedin,website,affiliations,/);
  assert.ok(lines[1].startsWith('Pat D.,pat@real.org,US,TX,,,,,,,,'));
  assert.ok(!csv.includes('null'));
});

test('toCsv: starts with the BOM character, the header follows it directly', async () => {
  const { db } = await seed();
  const csv = toCsv(await loadCommunity(db));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.slice(1).startsWith('name,email,'));
});
