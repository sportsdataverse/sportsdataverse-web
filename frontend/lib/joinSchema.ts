import { z } from "zod";

/**
 * Body of `POST /api/join`. PR 1 accepts the newsletter-only shape; later PRs
 * widen it from `content/survey.ts`. Unknown keys are stripped (zod default).
 */
export const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  wants: z.object({ newsletter: z.boolean() }).default({ newsletter: true }),
  // where the form lived; a person keeps the first one they signed up from
  placement: z.enum(["footer", "about", "join"]).optional(),
});

export type JoinInput = z.infer<typeof joinSchema>;

// RFC 2606 / 6761 reserved names: stored like any signup, never sent to Resend,
// so CI walkthroughs can submit the form without touching the real list.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/i;

export function isReservedEmail(email: string): boolean {
  return RESERVED_DOMAIN.test(email.split("@")[1] ?? "");
}
