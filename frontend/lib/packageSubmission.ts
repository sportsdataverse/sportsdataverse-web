import type { Db, ObjectId } from "mongodb";
import { packageSubmissionSchema, type PackageSubmissionInput } from "./packageSchema.ts";

export { packageSubmissionSchema };
export type { PackageSubmissionInput };

/**
 * Store a visitor's package for a member to review.
 *
 * `published: false` comes LAST in the document so no field of the input can
 * override it, and `submittedBy` is what keeps it off the public site (see
 * lib/packageVisibility.ts — `published` alone is not a visibility flag here).
 * Never throws: a submission rides along with a join request, and a failed
 * insert must not fail the visitor.
 */
export async function submitPackage(
  db: Db,
  input: PackageSubmissionInput,
  submittedBy: ObjectId,
  orgTierRequested: boolean,
  now: Date
): Promise<{ ok: boolean; packageId?: ObjectId; message: string }> {
  try {
    const res = await db.collection("packages").insertOne({
      ...input,
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
