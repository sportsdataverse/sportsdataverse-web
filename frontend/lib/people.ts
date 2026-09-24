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
    | { pending: { sentAt: Date }; confirmedAt?: Date }
    | { skipped: string };
  /** the invite this person was given; a code is reused until it expires */
  discord?: { code: string; expiresAt: Date; invitedAt: Date };
  reviewedBy?: string;
  reviewedAt?: Date;
  declineReason?: string;
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
): Promise<{ personId: PersonId; created: boolean; newsletter: PersonDoc["newsletter"] | undefined }> {
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
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted), newsletter: res.value.newsletter };
}

export async function markNewsletterSynced(
  db: Db,
  personId: PersonId,
  resendContactId: string,
  now: Date = new Date(),
  unsubscribed = false,
  /** carried forward by a re-sync: proof of a completed double opt-in is never overwritten */
  confirmedAt?: Date
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    {
      $set: {
        newsletter: {
          resendContactId,
          syncedAt: now,
          ...(unsubscribed ? { unsubscribed: true as const } : {}),
          ...(confirmedAt ? { confirmedAt } : {}),
        },
      },
    }
  );
}

/**
 * Drop an unused confirmation invite. Called when a re-submitted join form
 * turns the newsletter off: the old link must stop working, but a contact that
 * already exists (`resendContactId`) or a recorded skip is left alone.
 */
export async function clearNewsletterPending(db: Db, personId: PersonId): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $unset: { newsletter: "" } });
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
): Promise<{ personId: PersonId; created: boolean; newsletter: PersonDoc["newsletter"] | undefined }> {
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
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted), newsletter: res.value.newsletter };
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

export async function markConfirmedAt(db: Db, personId: PersonId, now: Date = new Date()): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { "newsletter.confirmedAt": now } });
}

export async function findPersonById(db: Db, id: string): Promise<PersonDoc | null> {
  // real ids are ObjectId hex; the in-memory test fake stores plain strings
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === id) {
    const hit = await people(db).findOne({ _id: new ObjectId(id) });
    if (hit) return hit;
  }
  return people(db).findOne({ _id: id as unknown as PersonId });
}

export async function findPersonByEmail(db: Db, email: string): Promise<PersonDoc | null> {
  return people(db).findOne({ email });
}

const REVIEW_LIST_CAP = 200;

export async function listPeople(
  db: Db,
  filter: { status?: PersonDoc["status"]; wantsDiscord?: boolean; limit?: number } = {}
): Promise<PersonDoc[]> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.wantsDiscord !== undefined) q["wants.discord"] = filter.wantsDiscord;
  return people(db)
    .find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit ?? 50, REVIEW_LIST_CAP))
    .toArray();
}

export async function setReviewStatus(
  db: Db,
  personId: PersonId,
  status: PersonDoc["status"],
  by: string | null,
  now: Date = new Date(),
  declineReason?: string
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    {
      $set: {
        status,
        reviewedAt: now,
        updatedAt: now,
        ...(by ? { reviewedBy: by } : {}),
        ...(declineReason ? { declineReason } : {}),
      },
    }
  );
}

export async function recordDiscordInvite(
  db: Db,
  personId: PersonId,
  invite: { code: string; expiresAt: Date },
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    { $set: { discord: { code: invite.code, expiresAt: invite.expiresAt, invitedAt: now }, updatedAt: now } }
  );
}

/**
 * Attach a GitHub login to a person. `githubLogin` is unique+sparse, so the
 * same login on a second person is a conflict, not an error a visitor should
 * ever see: this reports it instead of throwing.
 */
export async function linkGithubLogin(db: Db, personId: PersonId, login: string): Promise<boolean> {
  const owner = await people(db).findOne({ githubLogin: login });
  if (owner && String(owner._id) !== String(personId)) return false;
  if (owner) return true;
  try {
    await people(db).updateOne({ _id: personId }, { $set: { githubLogin: login } });
    return true;
  } catch (e) {
    // unique index on githubLogin: another request linked it between our read and write
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
}

/** People who want the newsletter but have no Resend contact yet (failed sync, or never tried). */
export async function listUnsyncedNewsletter(db: Db, limit = 50): Promise<PersonDoc[]> {
  return people(db)
    .find({ "wants.newsletter": true, "newsletter.resendContactId": { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, REVIEW_LIST_CAP))
    .toArray();
}

export async function deletePerson(db: Db, personId: PersonId): Promise<boolean> {
  const res = await people(db).deleteOne({ _id: personId });
  return res.deletedCount === 1;
}
