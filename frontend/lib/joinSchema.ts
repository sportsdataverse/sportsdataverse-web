import { z } from "zod";
import { identitySchema } from "./identity.ts";
import { packageSubmissionSchema } from "./packageSchema.ts";
import { stickerRequestSchema } from "./stickers.ts";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/**
 * Bodies of the public write endpoints. Question answers are NOT typed here:
 * lib/survey.ts validates `answers` against content/survey.ts so that hidden
 * questions cannot be smuggled in. Unknown keys are stripped (zod default).
 */
export const joinBodySchema = z.object({
  email: emailSchema,
  // PR 1 footer shape: no answers, wants.newsletter true. Keeps PR 1's default
  // (dropping it broke joinSchema.test.ts's "defaults wants.newsletter to true"
  // deepEqual — the field is otherwise unread whenever `answers` is present).
  wants: z.object({ newsletter: z.literal(true) }).default({ newsletter: true }),
  answers: z.record(z.unknown()).optional(),
  /** Required whenever `answers` is present (a questionnaire submission); the
   *  footer newsletter form sends no answers and no identity. Enforced in
   *  handleJoin, where the message can say what is missing. */
  identity: identitySchema.optional(),
  placement: z.enum(["footer", "about", "join"]).optional(),
  /** Present only when answers.wants_package === "yes". Validated by the same
   *  schema the CMS uses; `orgTier` is a request, never a grant. */
  pkg: packageSubmissionSchema.extend({ orgTier: z.boolean().optional() }).optional(),
  /** Present only when answers.wants_stickers === "yes". Stored in
   *  sticker_requests, never on the person — see lib/stickers.ts. */
  sticker: stickerRequestSchema.optional(),
});
export type JoinBody = z.infer<typeof joinBodySchema>;

/** /survey is identified since 2026-09-25: email and identity are required. */
export const surveyBodySchema = z.object({
  email: emailSchema,
  identity: identitySchema,
  answers: z.record(z.unknown()),
});

/** @deprecated PR 1 name; the footer form still sends this shape and joinBodySchema accepts it. */
export const joinSchema = joinBodySchema;

// RFC 2606 / 6761 reserved names: stored like any signup, never sent to Resend,
// so CI walkthroughs can submit the form without touching the real list.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/i;

export function isReservedEmail(email: string): boolean {
  return RESERVED_DOMAIN.test(email.split("@")[1] ?? "");
}
