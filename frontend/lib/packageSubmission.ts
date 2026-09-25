import type { Db, ObjectId } from "mongodb";
import { packageSubmissionSchema, type PackageSubmissionInput } from "./packageSchema.ts";

export { packageSubmissionSchema };
export type { PackageSubmissionInput };

/**
 * Store a visitor's package for a member to review.
 *
 * Parses `input` itself — a caller that skipped validation (or cast around
 * it, as `as never` does) must not be able to smuggle `_id` or any other
 * unmodeled key into the write; `parsed.data` is what's written, never the
 * raw `input`. `submittedBy` is what keeps it off the public site (see
 * lib/packageVisibility.ts — `published` alone is not a visibility flag
 * here). Never throws: a submission rides along with a join request, and a
 * failed write must not fail the visitor.
 *
 * `submittedBy` is set from an unverified request-body email — anyone can
 * claim to be any person id, the same as `upsertJoin` already lets anyone
 * overwrite anyone's answers. It gates visibility, and it is also the upsert
 * key below — which is exactly why nothing may be rewritten through it. It
 * must never become an ownership, contact or credit key.
 *
 * FIRST SUBMISSION WINS: one row per (submittedBy, title), whatever its
 * `published` state, and every field goes in `$setOnInsert` with nothing in
 * `$set`. A retry, a returning visitor or a scripted client collapses onto
 * the existing row instead of stacking duplicates in the review queue — and,
 * because a match writes nothing, someone who knows a submitter's email and
 * package title cannot rewrite the links on a pending submission before a
 * member approves it, nor touch a live listing. A genuine correction goes
 * through a member in the CMS. A different title is a different submission
 * (a maintainer of two packages submits both).
 *
 * The visitor gets the same sentence whether a row was created or already
 * there: a different answer would tell anyone who types an email and a title
 * whether that person submitted that package.
 */
export async function submitPackage(
  db: Db,
  input: PackageSubmissionInput,
  submittedBy: ObjectId,
  orgTierRequested: boolean,
  now: Date
): Promise<{ ok: boolean; packageId?: ObjectId; message: string }> {
  try {
    const parsed = packageSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid package submission." };
    }
    // updateOne, not findOneAndUpdate: nothing is read back, and the reader
    // scan (test/packageVisibilityReaders.test.ts) rightly treats findOneAnd* as a read
    const res = await db.collection("packages").updateOne(
      { submittedBy, title: parsed.data.title },
      { $setOnInsert: { ...parsed.data, orgTierRequested, createdAt: now, updatedAt: now, published: false } },
      { upsert: true }
    );
    return {
      ok: true,
      packageId: res.upsertedId ? (res.upsertedId as ObjectId) : undefined,
      message: "Your package is queued for a member to review.",
    };
  } catch {
    return { ok: false, message: "We saved your answers but could not record the package — please try again in a few minutes." };
  }
}
