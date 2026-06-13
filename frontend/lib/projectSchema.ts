import { z } from "zod";

/**
 * Validation schema for a project entry (the MongoDB `projects` collection).
 * Single source of truth for the *editable* fields — the API validates writes
 * against it and the manage form is built from the same set.
 *
 * Server-managed fields (`_id`, `createdBy`, `updatedBy`, `createdAt`,
 * `updatedAt`) are intentionally NOT here — the API stamps them and never
 * trusts client-supplied values. `createdBy` (the creator's GitHub login) is
 * the ownership key: members may edit/delete only their own projects.
 */

/** Optional URL: treats empty string / null as "absent". */
const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().url("Must be a valid URL").optional()
);

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  description: z.string().trim().min(1, "Description is required").max(2000),
  githubURL: z.string().trim().url("GitHub URL must be a valid URL"),
  coverImage: optionalUrl,
  previewURL: optionalUrl,
  tools: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  // No zod default: `projectSchema.partial()` (PUT) would otherwise re-inject
  // pinned:true on every edit and un-hide a hidden project. The create-time
  // default lives in the API instead.
  pinned: z.boolean().optional(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/** Partial variant for PUT (update) — every field optional. */
export const projectUpdateSchema = projectSchema.partial();
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

/** A persisted project document, including server-managed metadata. */
export type ProjectDoc = ProjectInput & {
  _id: string;
  /** GitHub login of the creator — the ownership key for edit/delete. */
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};
