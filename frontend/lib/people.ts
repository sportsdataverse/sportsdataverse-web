import type { Db, ObjectId } from "mongodb";

/**
 * The `people` collection: one doc per applicant / subscriber / respondent —
 * the list of record for every audience the site collects. Spec:
 * docs/superpowers/specs/2026-09-18-community-join-flow-design.md → Data model.
 * PR 1 writes only the newsletter shape; later PRs add profile/answers/discord.
 */
export type PersonDoc = {
  _id: ObjectId;
  email?: string;
  githubLogin?: string;
  name?: string;
  wants: { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };
  // pending = not yet reviewed (the Discord queue filters on wants.discord too)
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  signup?: { placement: string };
  newsletter?: { resendContactId: string; syncedAt: Date } | { skipped: string };
  createdAt: Date;
  updatedAt: Date;
  ip?: string; // abuse handling only; see the privacy page
};

export type PersonId = PersonDoc["_id"];

const people = (db: Db) => db.collection<PersonDoc>("people");

export async function ensurePeopleIndexes(db: Db): Promise<void> {
  const c = people(db);
  await c.createIndex({ email: 1 }, { unique: true, sparse: true });
  await c.createIndex({ githubLogin: 1 }, { unique: true, sparse: true });
  await c.createIndex({ status: 1, createdAt: -1 });
}

export async function upsertNewsletterSignup(
  db: Db,
  input: { email: string; ip?: string; placement?: string },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: { "wants.newsletter": true, updatedAt: now, ...(input.ip ? { ip: input.ip } : {}) },
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
        "wants.discord": false,
        "wants.stickers": false,
        "wants.package": false,
        ...(input.placement ? { "signup.placement": input.placement } : {}),
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
  if (!res.value) throw new Error("people upsert returned no document");
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted) };
}

export async function markNewsletterSynced(
  db: Db,
  personId: PersonId,
  resendContactId: string,
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { resendContactId, syncedAt: now } } });
}

export async function markNewsletterSkipped(db: Db, personId: PersonId, reason: string): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { skipped: reason } } });
}
