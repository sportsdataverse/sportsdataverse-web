import { z } from "zod";

/**
 * Bodies of the public write endpoints. Question answers are NOT typed here:
 * lib/survey.ts validates `answers` against content/survey.ts so that hidden
 * questions cannot be smuggled in. Unknown keys are stripped (zod default).
 */
export const joinBodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  name: z.string().trim().min(1).max(80).optional(),
  // PR 1 footer shape: no answers, wants.newsletter true. Keeps PR 1's default
  // (dropping it broke joinSchema.test.ts's "defaults wants.newsletter to true"
  // deepEqual — the field is otherwise unread whenever `answers` is present).
  wants: z.object({ newsletter: z.literal(true) }).default({ newsletter: true }),
  answers: z.record(z.unknown()).optional(),
  placement: z.enum(["footer", "about", "join"]).optional(),
});
export type JoinBody = z.infer<typeof joinBodySchema>;

export const surveyBodySchema = z.object({ answers: z.record(z.unknown()) });

/** @deprecated PR 1 name; the footer form still sends this shape and joinBodySchema accepts it. */
export const joinSchema = joinBodySchema;

// RFC 2606 / 6761 reserved names: stored like any signup, never sent to Resend,
// so CI walkthroughs can submit the form without touching the real list.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/i;

export function isReservedEmail(email: string): boolean {
  return RESERVED_DOMAIN.test(email.split("@")[1] ?? "");
}
