import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { loadCommunity, personHistory, listRow, exportable, csvCell, toCsv, setDoNotContact } from '../lib/communityData.ts';

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

test('toCsv: header, exportable rows only, null fields empty', async () => {
  const { db, pat } = await seed();
  await db.collection('people').updateOne({ _id: pat }, { $set: { socials: null, affiliations: null } });
  const csv = toCsv(await loadCommunity(db));
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^name,email,country,region,city,github,bluesky,x,linkedin,website,affiliations,/);
  assert.ok(lines[1].startsWith('Pat D.,pat@real.org,US,TX,,,,,,,,'));
  assert.ok(!csv.includes('null'));
});
