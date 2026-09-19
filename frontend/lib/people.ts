import { ObjectId, type Db } from "mongodb";
import type { Answers } from "../content/survey.ts";
import type { Profile } from "./survey.ts";

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
  profile?: Profile; // typed projection of the core answers — aggregations key on this
  answers?: Answers; // every answered question by id, incl. conditional follow-ups
  wants: { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };
  // pending = not yet reviewed (the Discord queue filters on wants.discord too); survey = anonymous respondent
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  signup?: { placement: string };
  // unsubscribed: the Resend contact exists but opted out; we never flip it from this form.
  // pending: a confirmation email was sent (double opt-in); confirmedAt is set when the link is used.
  newsletter?:
    | { resendContactId: string; syncedAt: Date; unsubscribed?: true; confirmedAt?: Date }
    | { pending: { sentAt: Date } }
    | { skipped: string };
  createdAt: Date;
  updatedAt: Date;
};
// No IP on the person: rate_limits holds it with a TTL; PR 2 adds a purged 30-day copy if abuse handling needs it.

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
  input: { email: string; placement?: string },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: { "wants.newsletter": true, updatedAt: now },
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
  now: Date = new Date(),
  unsubscribed = false
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    { $set: { newsletter: { resendContactId, syncedAt: now, ...(unsubscribed ? { unsubscribed: true as const } : {}) } } }
  );
}

export async function markNewsletterSkipped(db: Db, personId: PersonId, reason: string): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { skipped: reason } } });
}

export async function recordSurvey(
  db: Db,
  input: { answers: Answers; profile: Profile },
  now: Date = new Date()
): Promise<{ personId: PersonId }> {
  const doc = {
    answers: input.answers,
    profile: input.profile,
    wants: { discord: false, newsletter: false, stickers: false, package: false },
    status: "survey" as const,
    createdAt: now,
    updatedAt: now,
  };
  const res = await people(db).insertOne(doc as unknown as PersonDoc);
  return { personId: res.insertedId };
}

export async function upsertJoin(
  db: Db,
  input: {
    email: string;
    name?: string;
    answers: Answers;
    profile: Profile;
    wants: { newsletter: boolean; discord: boolean };
    placement?: string;
  },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: {
        answers: input.answers,
        profile: input.profile,
        "wants.newsletter": input.wants.newsletter,
        "wants.discord": input.wants.discord,
        updatedAt: now,
        ...(input.name ? { name: input.name } : {}),
      },
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
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

export async function markNewsletterPending(db: Db, personId: PersonId, now: Date = new Date()): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { pending: { sentAt: now } } } });
}

export async function markNewsletterConfirmed(
  db: Db,
  personId: PersonId,
  resendContactId: string,
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    { $set: { newsletter: { resendContactId, syncedAt: now, confirmedAt: now } } }
  );
}

export async function findPersonById(db: Db, id: string): Promise<PersonDoc | null> {
  // real ids are ObjectId hex; the in-memory test fake stores plain strings
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === id) {
    const hit = await people(db).findOne({ _id: new ObjectId(id) });
    if (hit) return hit;
  }
  return people(db).findOne({ _id: id as unknown as PersonId });
}
