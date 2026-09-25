import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Db } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import {
  stickerRequestSchema, upsertStickerRequest, listOpenStickerRequests, countShipped,
  shipStickerRequest, cancelStickerRequest, deleteStickerRequestsForPerson, ensureStickerIndexes,
} from '../lib/stickers.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const US = { name: 'Pat Doe', address: { line1: '1 Main St', city: 'Durham', region: 'NC', postal: '27701', country: 'US' } };

test('shipping erases the address in the same write that records the shipment', async () => {
  const { db, dump } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  assert.equal(await shipStickerRequest(db, id, 'saiemgilani', T0), true);
  const doc = dump('sticker_requests')[0];
  assert.equal(doc.status, 'shipped');
  assert.equal(doc.shippedBy, 'saiemgilani');
  assert.equal('address' in doc, false, 'no address survives a shipment');
  assert.equal(doc.name, 'Pat Doe', 'the name stays, for the record of what was sent');
});

test('shipping is recorded as one update, so there is no window with shipped-plus-address', async () => {
  const { db, dump } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  db.failNextWriteTo('sticker_requests', new Error('mongo down'));
  await assert.rejects(shipStickerRequest(db, id, 'saiemgilani', T0));
  const doc = dump('sticker_requests')[0];
  assert.equal(doc.status, 'requested', 'a failed ship leaves it requested');
  assert.ok(doc.address, 'and the address is still there to ship to');
});

test('shipping twice is a no-op, not an error', async () => {
  const { db } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  assert.equal(await shipStickerRequest(db, id, 'a', T0), true);
  assert.equal(await shipStickerRequest(db, id, 'b', T0), false);
});

test('a second request while one is open changes nothing: the first address wins', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const first = await upsertStickerRequest(db, person, US, T0);
  const second = await upsertStickerRequest(db, person, { name: 'Someone Else', address: { ...US.address, line1: '9 Attacker Rd' } }, T0);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  const open = await listOpenStickerRequests(db);
  assert.equal(open.length, 1);
  assert.equal(open[0].address!.line1, '1 Main St', 'a stranger typing this email cannot redirect the parcel');
  assert.equal(open[0].name, 'Pat Doe');
  assert.equal(dump('sticker_requests').length, 1);
});

test('a person whose stickers already shipped can ask again', async () => {
  const { db } = fakeDb();
  const person = new ObjectId();
  const first = (await upsertStickerRequest(db, person, US, T0)).id!;
  await shipStickerRequest(db, first, 'a', T0);
  await upsertStickerRequest(db, person, US, T0);
  assert.equal((await listOpenStickerRequests(db)).length, 1);
  assert.equal(await countShipped(db), 1);
});

test('an address with no postal code or region is accepted; one with no country is not', () => {
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { line1: '1 Queen St', city: 'Hong Kong', country: 'HK' } }).success, true);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { line1: '1 Queen St', city: 'X' } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: '', address: US.address }).success, false);
});

test('cancelling and deleting-for-person remove the address outright', async () => {
  const { db, dump } = fakeDb();
  const a = new ObjectId();
  const id = (await upsertStickerRequest(db, a, US, T0)).id!;
  assert.equal(await cancelStickerRequest(db, id), true);
  assert.equal(dump('sticker_requests').length, 0);
  await upsertStickerRequest(db, a, US, T0);
  assert.equal(await deleteStickerRequestsForPerson(db, a), 1);
  assert.equal(dump('sticker_requests').length, 0);
});

test('losing a concurrent race to the unique index reads as "already open", not a failure', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('sticker_requests', Object.assign(new Error('E11000 duplicate key error'), {
    code: 11000,
    keyPattern: { personId: 1, status: 1 },
  }));
  assert.deepEqual(await upsertStickerRequest(db, new ObjectId(), US, T0), { created: false });
});

test('any other database error still surfaces', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('sticker_requests', new Error('mongo down'));
  await assert.rejects(upsertStickerRequest(db, new ObjectId(), US, T0), /mongo down/);
});

test('an E11000 from a different index still surfaces, not swallowed as already-open', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('sticker_requests', Object.assign(new Error('E11000 duplicate key error'), {
    code: 11000,
    keyPattern: { email: 1 },
  }));
  await assert.rejects(upsertStickerRequest(db, new ObjectId(), US, T0));
});

test('a coded non-11000 error (e.g. not-primary during a failover) still surfaces', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('sticker_requests', Object.assign(new Error('not primary'), { code: 10107 }));
  await assert.rejects(upsertStickerRequest(db, new ObjectId(), US, T0));
});

test('a successful ship performs exactly one write to sticker_requests', async () => {
  const { db } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  const before = db.writes('sticker_requests');
  await shipStickerRequest(db, id, 'saiemgilani', T0);
  assert.equal(db.writes('sticker_requests') - before, 1, 'shipping must be one atomic write, never two');
});

test('shipping or cancelling one open request leaves a different persons open request untouched', async () => {
  const { db, dump } = fakeDb();
  // Bob is seeded FIRST and stays "requested" throughout: the fake's find/deleteOne return the
  // first row matching a filter, so if ship or cancel ever drops its `_id` clause, the filter
  // `{status:"requested"}` alone would hit Bob (the earliest such row) instead of the intended
  // target — which is exactly the bug this test exists to catch.
  const bob = (await upsertStickerRequest(db, new ObjectId(), { name: 'Bob Roe', address: US.address }, T0)).id!;
  const alice = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;

  assert.equal(await shipStickerRequest(db, alice, 'saiemgilani', T0), true);
  const bobAfterShip = dump('sticker_requests').find((r) => r._id === bob)!;
  assert.equal(bobAfterShip.status, 'requested');
  assert.ok(bobAfterShip.address, "bob's address must survive shipping alice's request");

  const carol = (await upsertStickerRequest(db, new ObjectId(), { name: 'Carol Lee', address: US.address }, T0)).id!;
  assert.equal(await cancelStickerRequest(db, carol), true);
  const bobAfterCancel = dump('sticker_requests').find((r) => r._id === bob)!;
  assert.equal(bobAfterCancel.status, 'requested');
  assert.ok(bobAfterCancel.address, "bob's address must survive cancelling carol's request");
});

test('deleting a persons requests removes every one of theirs, shipped and open, and leaves another persons request alone', async () => {
  const { db, dump } = fakeDb();
  const a = new ObjectId();
  const b = new ObjectId();

  const a1 = (await upsertStickerRequest(db, a, US, T0)).id!;
  await shipStickerRequest(db, a1, 'x', T0);
  const a2 = (await upsertStickerRequest(db, a, US, T0)).id!;
  await shipStickerRequest(db, a2, 'y', T0);
  await upsertStickerRequest(db, a, US, T0); // a's currently open request

  const bId = (await upsertStickerRequest(db, b, US, T0)).id!;

  assert.equal(dump('sticker_requests').length, 4, 'sanity: 3 rows for a, 1 for b');
  assert.equal(await deleteStickerRequestsForPerson(db, a), 3);

  const remaining = dump('sticker_requests');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]._id, bId);
  assert.ok(remaining[0].address, "b's address must survive a's deletion request");
});

test('ensureStickerIndexes creates the exact partial unique index the upsert relies on', async () => {
  let captured: { key?: unknown; options?: unknown } = {};
  const stubDb = {
    collection(name: string) {
      assert.equal(name, 'sticker_requests');
      return {
        async createIndex(key: unknown, options: unknown) {
          captured = { key, options };
          return 'sticker_requests_idx';
        },
      };
    },
  } as unknown as Db;

  await ensureStickerIndexes(stubDb);

  assert.deepEqual(captured.key, { personId: 1, status: 1 });
  assert.equal((captured.options as { unique?: boolean }).unique, true);
  assert.deepEqual((captured.options as { partialFilterExpression?: unknown }).partialFilterExpression, { status: 'requested' });
});

test('name and address lines reject control and bidi-override characters', () => {
  const forbidden = [0x00, 0x09, 0x0a, 0x1b, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069].map((cp) =>
    String.fromCodePoint(cp)
  );
  for (const ch of forbidden) {
    const hex = ch.codePointAt(0)!.toString(16);
    assert.equal(
      stickerRequestSchema.safeParse({ name: `Pat${ch}Doe`, address: US.address }).success,
      false,
      `name must reject U+${hex}`
    );
    assert.equal(
      // the char sits mid-string, not trailing — a trailing one would just be trimmed away
      stickerRequestSchema.safeParse({ name: 'Pat Doe', address: { ...US.address, line1: `1${ch}Main St` } }).success,
      false,
      `line1 must reject U+${hex}`
    );
  }
});

test('a zero-width joiner in a name is accepted', () => {
  const zwj = String.fromCodePoint(0x200d);
  assert.equal(stickerRequestSchema.safeParse({ name: `Pat${zwj}Doe`, address: US.address }).success, true);
});

test('a whitespace-only optional address line is absent after parsing, not stored as an empty string', () => {
  // undefined, not '' — the Mongo driver's BSON serializer omits an undefined leaf field on
  // write, which is what makes this "absent" rather than a stored empty string.
  const parsed = stickerRequestSchema.parse({ name: 'Pat Doe', address: { ...US.address, line2: '   ' } });
  assert.equal(parsed.address.line2, undefined);
});

test('every name/address line refuses one character over its limit', () => {
  const over = (n: number) => 'x'.repeat(n);
  assert.equal(stickerRequestSchema.safeParse({ name: over(81), address: US.address }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { ...US.address, line1: over(121) } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { ...US.address, city: over(81) } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { ...US.address, region: over(81) } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { ...US.address, postal: over(21) } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { ...US.address, country: over(57) } }).success, false);
});
