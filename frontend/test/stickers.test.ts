import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import {
  stickerRequestSchema, upsertStickerRequest, listOpenStickerRequests, countShipped,
  shipStickerRequest, cancelStickerRequest, deleteStickerRequestsForPerson,
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
