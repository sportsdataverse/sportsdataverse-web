/**
 * Which `packages` documents the public may see.
 *
 * `published` alone cannot answer this: every legacy document carries
 * `published: false` because the field predates the manage form's default, and
 * the public page has always shown them. A visitor SUBMISSION is what must stay
 * hidden, and a submission is exactly a document with `submittedBy`. So: no
 * `submittedBy` → visible as it always was; a submission → visible only once a
 * member sets `published: true` in the CMS.
 *
 * A present-but-null `submittedBy` counts as a submission, not as absent: this
 * mirrors Mongo's `$exists`, which treats a stored `null` as present. The
 * predicate checks `"submittedBy" in pkg` rather than `== null` so it never
 * disagrees with the filter on that value.
 *
 * Every public reader uses this. A reader that does `find({})` on `packages`
 * leaks a stranger's submission to the site.
 */
export const PUBLIC_PACKAGE_FILTER = {
  $or: [{ submittedBy: { $exists: false } }, { published: true }],
};

export function isPubliclyVisible(pkg: { submittedBy?: unknown; published?: boolean }): boolean {
  return !("submittedBy" in pkg) || pkg.published === true;
}

/**
 * Output projection for every public reader that returns whole documents. An
 * approved submission still carries `submittedBy` (an internal `people` id — a
 * join key into who submitted it) and `orgTierRequested` (a request that
 * approving the listing does not grant); neither belongs in a public payload.
 * Projection only: PUBLIC_PACKAGE_FILTER still reads `submittedBy`.
 */
export const PUBLIC_PACKAGE_PROJECTION = { submittedBy: 0, orgTierRequested: 0 } as const;
