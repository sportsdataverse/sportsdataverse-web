import type { Db } from "mongodb";
import { isReservedEmail, joinSchema } from "./joinSchema.ts";
import { subscribeToResend } from "./newsletter.ts";
import { allowRequest } from "./rateLimit.ts";
import { markNewsletterSkipped, markNewsletterSynced, upsertNewsletterSignup } from "./people.ts";

/**
 * `POST /api/join` as pure logic: validate → rate-limit by IP → save the person
 * → best-effort Resend sync. The person is saved BEFORE Resend is called and a
 * Resend failure never fails the request (spec → Errors): the list of record is ours.
 */
export type JoinDeps = {
  db: Db;
  resendApiKey: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type JoinResult = { status: 200 | 400 | 429; body: { success: boolean; message: string } };

const JOIN_LIMIT = { limit: 5, windowSec: 3600 };

export async function handleJoin(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = joinSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" } };
  }
  const rl = await allowRequest(deps.db, `join:${ip}`, { ...JOIN_LIMIT, now: deps.now });
  if (!rl.allowed) {
    const mins = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
    return { status: 429, body: { success: false, message: `Too many sign-ups from this address. Try again in ${mins} min.` } };
  }

  const { email, placement } = parsed.data;
  const now = (deps.now ?? (() => new Date()))();
  const { personId } = await upsertNewsletterSignup(deps.db, { email, placement }, now);

  if (isReservedEmail(email)) {
    await markNewsletterSkipped(deps.db, personId, "reserved-domain");
  } else {
    try {
      const { contactId, unsubscribed } = await subscribeToResend(email, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
      await markNewsletterSynced(deps.db, personId, contactId, now, unsubscribed);
    } catch (e) {
      // best-effort: the person is saved; an admin "retry sync" lands in PR 2
      deps.log?.(`resend sync failed for person ${String(personId)}: ${(e as Error).message}`);
    }
  }
  return { status: 200, body: { success: true, message: "You're on the list." } };
}
