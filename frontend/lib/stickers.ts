import type { Db, ObjectId } from "mongodb";
import { z } from "zod";

const line = (max: number) => z.string().trim().min(1).max(max);
const optLine = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(max).optional());

/** region and postal are optional: many countries have neither, and a required
 *  field turns a real address into a rejected form. */
export const addressSchema = z.object({
  line1: line(120),
  line2: optLine(120),
  city: line(80),
  region: optLine(80),
  postal: optLine(20),
  country: line(56),
});

export const stickerRequestSchema = z.object({ name: line(80), address: addressSchema });
export type StickerRequestInput = z.infer<typeof stickerRequestSchema>;

export type StickerRequestDoc = {
  _id: ObjectId;
  personId: ObjectId;
  name: string;
  /** present only while status is "requested" — shipping and cancelling remove it */
  address?: z.infer<typeof addressSchema>;
  status: "requested" | "shipped";
  createdAt: Date;
  updatedAt: Date;
  shippedAt?: Date;
  shippedBy?: string;
};

const col = (db: Db) => db.collection<StickerRequestDoc>("sticker_requests");

/**
 * One open request per person, and the FIRST one wins. The person comes from an
 * unverified email typed into /join, so letting a later request update the open
 * one would let anyone who types a stranger's email redirect the stranger's
 * parcel. Everything is written only on insert; a match changes nothing. A
 * shipped request is history, so someone whose stickers went out can ask again.
 * Someone who moved replies to the confirmation email, or an admin cancels the
 * request and they ask again.
 */
export async function upsertStickerRequest(
  db: Db,
  personId: ObjectId,
  input: StickerRequestInput,
  now: Date
): Promise<{ created: boolean; id?: ObjectId }> {
  const res = await col(db).updateOne(
    { personId, status: "requested" },
    { $setOnInsert: { personId, name: input.name, address: input.address, status: "requested", createdAt: now, updatedAt: now } },
    { upsert: true }
  );
  return res.upsertedId ? { created: true, id: res.upsertedId as ObjectId } : { created: false };
}

/**
 * At most one OPEN request per person. The upsert above keys on it, but an
 * upsert is not unique without an index — PR 3 measured duplicates in 28 of 30
 * trials of concurrent upserts on real MongoDB without one. The server retries a
 * losing upsert as an update that changes nothing. Partial on status
 * "requested", so shipped history does not collide.
 */
export async function ensureStickerIndexes(db: Db): Promise<void> {
  await col(db).createIndex({ personId: 1 }, { unique: true, partialFilterExpression: { status: "requested" } });
}

/** The ONLY read that returns addresses. Its one caller is the admin-gated
 *  sticker route; do not add another. */
export async function listOpenStickerRequests(db: Db): Promise<StickerRequestDoc[]> {
  return col(db).find({ status: "requested" }).sort({ createdAt: 1 }).toArray();
}

export async function countShipped(db: Db): Promise<number> {
  return col(db).countDocuments({ status: "shipped" });
}

/** Records the shipment and erases the address in ONE update, so there is never
 *  a moment where a request is shipped and still holding an address. Matching on
 *  status "requested" makes a second click a no-op. */
export async function shipStickerRequest(db: Db, id: ObjectId, shippedBy: string, now: Date): Promise<boolean> {
  const res = await col(db).updateOne(
    { _id: id, status: "requested" },
    { $set: { status: "shipped", shippedAt: now, shippedBy, updatedAt: now }, $unset: { address: "" } }
  );
  return res.modifiedCount === 1;
}

/** Spam, a duplicate, or a change of heart: drop the request and its address. */
export async function cancelStickerRequest(db: Db, id: ObjectId): Promise<boolean> {
  return (await col(db).deleteOne({ _id: id, status: "requested" })).deletedCount === 1;
}

/** Every request a person made, shipped or not — used when they ask to be deleted. */
export async function deleteStickerRequestsForPerson(db: Db, personId: ObjectId): Promise<number> {
  return (await col(db).deleteMany({ personId })).deletedCount;
}
