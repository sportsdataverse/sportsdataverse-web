import type { Db, ObjectId } from "mongodb";
import { packageSubmissionSchema, type PackageSubmissionInput } from "./packageSchema.ts";

export { packageSubmissionSchema };
export type { PackageSubmissionInput };

/**
 * Store a visitor's package for a member to review.
 *
 * Parses `input` itself — a caller that skipped validation (or cast around
 * it, as `as never` does) must not be able to smuggle `_id` or any other
 * unmodeled key into the write; `parsed.data` is what's spread, never the
 * raw `input`. `submittedBy` is what keeps it off the public site (see
 * lib/packageVisibility.ts — `published` alone is not a visibility flag
 * here). Never throws: a submission rides along with a join request, and a
 * failed write must not fail the visitor.
 *
 * `submittedBy` is set from an unverified request-body email — anyone can
 * claim to be any person id, the same as `upsertJoin` already lets anyone
 * overwrite anyone's answers. Harmless today because it only gates
 * visibility; it must never become an ownership, contact or credit key.
 *
 * One OPEN row per (submittedBy, title): plain `insertOne` let a returning
 * visitor, a retry after a failed request, or a scripted client stack up
 * duplicates of the same package, each sorting to the top of the review
 * queue. An upsert keyed on the pending row instead edits it in place. A
 * different title is a different submission (a maintainer of two packages
 * submits both), and `published` is excluded from the key (`$ne: true`) and
 * written only in `$setOnInsert`, never `$set` — so resubmitting an
 * already-published title opens a fresh pending row rather than silently
 * editing the live listing, and `published` can never collide across
 * operators the way `wants.package` once did in `upsertJoin`.
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
    const res = await db.collection("packages").updateOne(
      { submittedBy, title: parsed.data.title, published: { $ne: true } },
      {
        $set: { ...parsed.data, orgTierRequested, updatedAt: now },
        $setOnInsert: { createdAt: now, published: false },
      },
      { upsert: true }
    );
    return {
      ok: true,
      packageId: res.upsertedId ? (res.upsertedId as ObjectId) : undefined,
      message: "Your package is queued for a member to review.",
    };
  } catch {
    return { ok: false, message: "We saved your answers but could not record the package — reply to us and we'll add it by hand." };
  }
}
