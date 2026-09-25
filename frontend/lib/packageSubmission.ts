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
 * raw `input`. `published: false` comes LAST in the document so no field of
 * the (parsed) input can override it, and `submittedBy` is what keeps it off
 * the public site (see lib/packageVisibility.ts — `published` alone is not a
 * visibility flag here). Never throws: a submission rides along with a join
 * request, and a failed insert must not fail the visitor.
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
    const res = await db.collection("packages").insertOne({
      ...parsed.data,
      submittedBy,
      orgTierRequested,
      createdAt: now,
      updatedAt: now,
      published: false,
    });
    return { ok: true, packageId: res.insertedId as ObjectId, message: "Your package is queued for a member to review." };
  } catch {
    return { ok: false, message: "We saved your answers but could not record the package — reply to us and we'll add it by hand." };
  }
}
