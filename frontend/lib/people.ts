import { ObjectId, type Db } from "mongodb";
import { QUESTIONS, SURVEY_SECTIONS, type Answers } from "../content/survey.ts";
import type { Affiliation, Identity, Location, Socials } from "./identity.ts";
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
  /** What a signed-in visitor SAID they are, recorded before any vouch and never
   *  used for authorization. `githubLogin` is the ownership key and only a vouched
   *  session may write it (see linkGithubLogin); this field exists so a member
   *  working the queue can see who is asking without that claim ever becoming
   *  proof. Display it as unverified, and never compare against it. */
  claimedGithubLogin?: string;
  name?: string;
  /** latest submission's location; never a mailing address (see lib/stickers.ts) */
  location?: Location;
  /** latest submission's socials, normalized handles (lib/identity.ts) */
  socials?: Socials;
  /** latest submission's affiliations, at most 3 */
  affiliations?: Affiliation[];
  lastSubmittedAt?: Date;
  /** set by an admin when someone asks not to be contacted; excluded from every export (lib/communityData.ts) */
  doNotContact?: { at: Date; by: string };
  profile?: Profile; // typed projection of the core answers — aggregations key on this
  answers?: Answers; // every answered question by id, incl. conditional follow-ups
  wants: { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };
  // pending = not yet reviewed (the Discord queue filters on wants.discord too);
  // survey = a /survey respondent who has not since /joined (legacy rows with no
  // email are the only ones that stay anonymous — see upsertSurvey)
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

/** The latest submission wins outright: optional parts it left out are removed,
 *  not kept from an older one. History lives in `responses`. */
function identityUpdate(identity: Identity, now: Date): { $set: Record<string, unknown>; $unset: Record<string, ""> } {
  const $set: Record<string, unknown> = { name: identity.name, location: identity.location, lastSubmittedAt: now };
  const $unset: Record<string, ""> = {};
  if (identity.socials) $set.socials = identity.socials;
  else $unset.socials = "";
  if (identity.affiliations) $set.affiliations = identity.affiliations;
  else $unset.affiliations = "";
  return { $set, $unset };
}

export async function upsertJoin(
  db: Db,
  input: {
    email: string;
    identity?: Identity;
    answers: Answers;
    profile: Profile;
    wants: { newsletter: boolean; discord: boolean; package?: boolean; stickers?: boolean };
    placement?: string;
  },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean; newsletter: PersonDoc["newsletter"] | undefined }> {
  const id = input.identity ? identityUpdate(input.identity, now) : { $set: {}, $unset: {} };
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: {
        answers: input.answers,
        profile: input.profile,
        "wants.newsletter": input.wants.newsletter,
        "wants.discord": input.wants.discord,
        "wants.package": input.wants.package ?? false,
        "wants.stickers": input.wants.stickers ?? false,
        updatedAt: now,
        ...id.$set,
      },
      ...(Object.keys(id.$unset).length ? { $unset: id.$unset } : {}),
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
        ...(input.placement ? { "signup.placement": input.placement } : {}),
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
  if (!res.value) throw new Error("people upsert returned no document");
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted), newsletter: res.value.newsletter };
}

/**
 * /survey, identified since 2026-09-25: find-or-create by email. Writes ONLY
 * identity and the survey's own questions — never `wants`, `status`,
 * `newsletter`, `discord`, stickers or packages, so a survey can never undo a
 * /join request. Each survey question is set when answered and unset when not
 * (a follow-up hidden this time must not keep last time's answer); /join-only
 * answers (the wants section) are left alone. Legacy anonymous rows have no
 * email, so the email filter can never match one.
 */
export async function upsertSurvey(
  db: Db,
  input: { email: string; identity: Identity; answers: Answers; profile: Profile },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const { $set, $unset } = identityUpdate(input.identity, now);
  for (const q of QUESTIONS) {
    if (!SURVEY_SECTIONS.includes(q.section)) continue;
    if (q.id in input.answers) $set[`answers.${q.id}`] = input.answers[q.id];
    else $unset[`answers.${q.id}`] = "";
  }
  $set.profile = input.profile;
  $set.updatedAt = now;
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set,
      ...(Object.keys($unset).length ? { $unset } : {}),
      $setOnInsert: {
        email: input.email,
        status: "survey",
        createdAt: now,
        wants: { discord: false, newsletter: false, stickers: false, package: false },
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
  if (!res.value) throw new Error("people upsert returned no document");
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted) };
}

/**
 * A /survey respondent who later fills out /join must enter the review queue
 * like anyone else — upsertJoin only ever sets `status` in $setOnInsert, so a
 * row that already exists (as "survey") would otherwise keep that status
 * forever, and the queue (status "pending" + wants.discord) would never list
 * them. Called unconditionally on every questionnaire /join, whatever the
 * stored status: the filter (`status: "survey"`) makes it a no-op for anyone
 * not in that state, and issuing the same update every time keeps the DB
 * round trips identical regardless of what is stored — no new timing signal.
 */
export async function promoteSurveyRespondent(db: Db, personId: PersonId, now: Date = new Date()): Promise<void> {
  await people(db).updateOne({ _id: personId, status: "survey" }, { $set: { status: "pending", updatedAt: now } });
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
/**
 * Record the handle a signed-in visitor presented, as a claim only. Never an
 * ownership key: it is not unique, it is not compared, and it is overwritten by
 * whoever submits last. `linkGithubLogin` is the authorization write.
 */
export async function recordClaimedLogin(db: Db, personId: PersonId, login: string): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { claimedGithubLogin: login.toLowerCase() } });
}

export async function linkGithubLogin(db: Db, personId: PersonId, login: string): Promise<boolean> {
  // folded on write: GitHub handles are case-insensitive, and the unique index
  // can only enforce that if every record spells the same handle the same way
  const key = login.toLowerCase();
  const person = await people(db).findOne({ _id: personId });
  // This record is already bound to a different handle. Re-pointing it is how an
  // ownership key stops being one: /join resolves the record from the request
  // body's email, so overwriting here would let a caller claim someone else's
  // record — and lock the rightful person out of ever linking their own.
  if (person?.githubLogin && person.githubLogin !== key) return false;
  const owner = await people(db).findOne({ githubLogin: key });
  if (owner && String(owner._id) !== String(personId)) return false;
  if (owner) return true;
  try {
    await people(db).updateOne({ _id: personId }, { $set: { githubLogin: key } });
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
