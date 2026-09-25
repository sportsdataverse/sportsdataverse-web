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
 * Every public reader uses this. A reader that does `find({})` on `packages`
 * leaks a stranger's submission to the site.
 */
export const PUBLIC_PACKAGE_FILTER = {
  $or: [{ submittedBy: { $exists: false } }, { published: true }],
};

export function isPubliclyVisible(pkg: { submittedBy?: unknown; published?: boolean }): boolean {
  return pkg.submittedBy == null || pkg.published === true;
}
