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
  // Present only on a visitor submission (see lib/packageSubmission.ts /
  // lib/packageVisibility.ts) — absent on a member-created row.
  submittedBy?: string | null;
  orgTierRequested?: boolean;
};

/**
 * Links a stranger may submit: http(s) only. zod's `.url()` just checks that
 * `new URL()` parses, so on its own it accepts `javascript:`, `data:` and
 * `vbscript:`. React 19 blocks `javascript:` hrefs in our own markup, but not
 * `data:`, and not for anything else that renders the public /api/packages JSON.
 *
 * The member CMS keeps `packageSchema`'s looser rule for now: its existing rows
 * could not be inspected, and tightening it would re-validate them on every edit.
 */
const httpUrl = (message: string) =>
  z
    .string()
    .trim()
    .url(message)
    .refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://");
const optionalHttpUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  httpUrl("Must be a valid URL").optional()
);

/**
 * What a visitor may send through /join: `packageSchema` without `published`,
 * with every link restricted to http(s). A submission is always created hidden
 * and the API stamps its provenance — the same rule the CMS applies to `createdBy`.
 */
export const packageSubmissionSchema = packageSchema.omit({ published: true }).extend({
  sourceHref: httpUrl("Source URL must be a valid URL"),
  docsHref: optionalHttpUrl,
  logoHref: optionalHttpUrl,
  dataRepoHref: optionalHttpUrl,
});
export type PackageSubmissionInput = z.infer<typeof packageSubmissionSchema>;
