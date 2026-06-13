import { z } from "zod";

/**
 * Validation schema for a package entry. This is the single source of truth for
 * the shape of a `packages` document's *editable* fields — the API validates
 * writes against it (closing the previous raw-`JSON.parse(req.body)` insert
 * hole) and the manage form is built from the same field set.
 *
 * Server-managed fields (`_id`, `createdBy`, `updatedBy`, `createdAt`,
 * `updatedAt`) are intentionally NOT part of this schema — the API stamps them
 * and never trusts client-supplied values.
 */

/** Optional URL: treats empty string / null as "absent". */
const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().url("Must be a valid URL").optional()
);

export const REPO_TYPES = ["R", "Python", "Node.js"] as const;

export const packageSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  repoType: z.enum(REPO_TYPES),
  sports: z.string().trim().min(1, "Sport / category is required").max(120),
  content: z.string().trim().min(1, "Description is required").max(2000),
  sourceHref: z.string().trim().url("Source URL must be a valid URL"),
  docsHref: optionalUrl,
  logoHref: optionalUrl,
  dataRepoHref: optionalUrl,
  // No zod default here on purpose: `packageSchema.partial()` (used for PUT)
  // would otherwise re-inject `published: true` on every edit and silently
  // republish a hidden entry. `addPkg` applies the create-time default instead.
  published: z.boolean().optional(),
});

export type PackageInput = z.infer<typeof packageSchema>;

/** Partial variant for PUT (update) — every field optional. */
export const packageUpdateSchema = packageSchema.partial();
export type PackageUpdateInput = z.infer<typeof packageUpdateSchema>;

/** A persisted package document, including server-managed metadata. */
export type PackageDoc = PackageInput & {
  _id: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};
