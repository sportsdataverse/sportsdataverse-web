import type { Db } from "mongodb";
import { QUESTIONS, JOIN_SECTIONS, SURVEY_SECTIONS } from "../content/survey.ts";
import { isReservedEmail, joinBodySchema, surveyBodySchema } from "./joinSchema.ts";
import { subscribeToResend } from "./newsletter.ts";
import { allowRequest } from "./rateLimit.ts";
import { contactProperties, projectProfile, validateAnswers, type Profile } from "./survey.ts";
import { signConfirmToken, verifyConfirmToken } from "./confirmToken.ts";
import { confirmEmail, sendEmail } from "./email.ts";
import {
  findPersonById, markConfirmedAt, markNewsletterConfirmed, markNewsletterPending, markNewsletterSkipped, markNewsletterSynced,
  clearNewsletterPending, recordSurvey, upsertJoin, upsertNewsletterSignup, type PersonDoc, type PersonId,
} from "./people.ts";

/**
 * The public write endpoints as pure logic. Every path saves the person BEFORE
 * any Resend call and a Resend failure never fails the request (spec → Errors).
 *
 * Newsletter opt-in: with `resendFrom` set (a verified sending domain) a
 * confirmation link is emailed and the Resend contact is created on confirm;
 * without it the contact is created immediately (PR 1 behaviour).
 */
export type JoinDeps = {
  db: Db;
  resendApiKey: string | undefined;
  resendFrom?: string; // e.g. "SportsDataverse <news@sportsdataverse.org>"; undefined = single opt-in
  tokenSecret?: string; // JOIN_TOKEN_SECRET ?? NEXTAUTH_SECRET
  siteUrl?: string; // absolute origin used in the confirm link; defaults to the production site
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type JoinResult = { status: 200 | 400 | 429; body: { success: boolean; message: string } };

const JOIN_LIMIT = { limit: 5, windowSec: 3600 };
const SURVEY_LIMIT = { limit: 10, windowSec: 3600 };
const DEFAULT_SITE = "https://www.sportsdataverse.org";
const CONFIRMED_MSG = "You're on the list.";
const PENDING_MSG = "Almost there — check your inbox and confirm your email.";
const SEND_FAILED_MSG = "We couldn't send the confirmation email just now. Please try again in a few minutes.";

const nowOf = (deps: JoinDeps) => (deps.now ?? (() => new Date()))();

async function limited(deps: JoinDeps, key: string, lim: { limit: number; windowSec: number }): Promise<JoinResult | null> {
  const rl = await allowRequest(deps.db, key, { ...lim, now: deps.now });
  if (rl.allowed) return null;
  const mins = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
  return { status: 429, body: { success: false, message: `Too many submissions from this address. Try again in ${mins} min.` } };
}

/** Immediate contact create (single opt-in, or the confirm step of double opt-in). */
async function syncContact(deps: JoinDeps, personId: PersonId, email: string, profile: Profile | undefined, confirmed: boolean,
  /** an earlier double opt-in on this person; a refresh must not erase it */
  keepConfirmedAt?: Date): Promise<void> {
  const now = nowOf(deps);
  try {
    const props = profile ? contactProperties(profile) : undefined;
    const { contactId, unsubscribed } = await subscribeToResend(
      email,
      { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl, log: deps.log },
      props,
      { resubscribe: confirmed }
    );
    if (confirmed) await markNewsletterConfirmed(deps.db, personId, contactId, now);
    else await markNewsletterSynced(deps.db, personId, contactId, now, unsubscribed, keepConfirmedAt);
  } catch (e) {
    // best-effort: the person is saved; the admin retry-sync (PR 2b) picks it up
    deps.log?.(`resend sync failed for person ${String(personId)}: ${(e as Error).message}`);
  }
}

async function beginOptIn(
  deps: JoinDeps,
  personId: PersonId,
  email: string,
  profile: Profile | undefined,
  existing: PersonDoc["newsletter"] | undefined
): Promise<string> {
  if (existing && "resendContactId" in existing && !existing.unsubscribed) {
    // already synced (e.g. re-signup after confirming once before): refresh properties, don't re-send a
    // link, and keep the confirmation timestamp — it is this person's proof of consent
    await syncContact(deps, personId, email, profile, false, existing.confirmedAt);
    return CONFIRMED_MSG;
  }
  if (isReservedEmail(email)) {
    await markNewsletterSkipped(deps.db, personId, "reserved-domain");
    return CONFIRMED_MSG;
  }
  if (!deps.resendFrom || !deps.tokenSecret) {
    await syncContact(deps, personId, email, profile, false);
    return CONFIRMED_MSG;
  }
  const now = nowOf(deps);
  const token = signConfirmToken(String(personId), deps.tokenSecret, now);
  const url = `${deps.siteUrl ?? DEFAULT_SITE}/api/join/confirm?t=${token}`;
  try {
    await sendEmail({ from: deps.resendFrom, to: email, ...confirmEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    await markNewsletterPending(deps.db, personId, now);
  } catch (e) {
    deps.log?.(`confirmation email failed for person ${String(personId)}: ${(e as Error).message}`);
    return SEND_FAILED_MSG;
  }
  return PENDING_MSG;
}

export async function handleJoin(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = joinBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" } };
  }
  const { email, name, answers: rawAnswers, placement } = parsed.data;

  // full /join: answers present → validate against the question list
  let profile: Profile | undefined;
  let wants = { newsletter: true, discord: false };
  let answers: Record<string, string | string[]> | undefined;
  if (rawAnswers) {
    const v = validateAnswers(QUESTIONS, JOIN_SECTIONS, rawAnswers);
    if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
    answers = v.answers;
    profile = projectProfile(answers);
    wants = { newsletter: answers.wants_newsletter === "yes", discord: answers.wants_discord === "yes" };
  }

  const lim = await limited(deps, `join:${ip}`, JOIN_LIMIT);
  if (lim) return lim;

  const now = nowOf(deps);
  const { personId, newsletter } = answers && profile
    ? await upsertJoin(deps.db, { email, name, answers, profile, wants, placement }, now)
    : await upsertNewsletterSignup(deps.db, { email, placement }, now);

  if (!wants.newsletter && newsletter && "pending" in newsletter) {
    // they turned the newsletter off before confirming: retire the unused invite
    await clearNewsletterPending(deps.db, personId);
  }
  const message = wants.newsletter ? await beginOptIn(deps, personId, email, profile, newsletter) : "Thanks — we've got your answers.";
  return { status: 200, body: { success: true, message } };
}

export async function handleSurvey(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = surveyBodySchema.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { success: false, message: "Invalid request" } };
  const v = validateAnswers(QUESTIONS, SURVEY_SECTIONS, parsed.data.answers);
  if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
  const lim = await limited(deps, `survey:${ip}`, SURVEY_LIMIT);
  if (lim) return lim;
  await recordSurvey(deps.db, { answers: v.answers, profile: projectProfile(v.answers) }, nowOf(deps));
  return { status: 200, body: { success: true, message: "Thanks — that helps us decide what to build next." } };
}

export async function handleConfirm(
  token: string,
  deps: JoinDeps
): Promise<{ redirect: "/join/confirmed" | "/join/confirmed?state=expired" | "/join/confirmed?state=invalid" }> {
  if (!deps.tokenSecret) return { redirect: "/join/confirmed?state=invalid" };
  const v = verifyConfirmToken(token, deps.tokenSecret, nowOf(deps));
  if (!v.ok) return { redirect: v.reason === "expired" ? "/join/confirmed?state=expired" : "/join/confirmed?state=invalid" };
  const person = await findPersonById(deps.db, v.personId);
  if (!person?.email) return { redirect: "/join/confirmed?state=invalid" };
  if (person.newsletter && "skipped" in person.newsletter) return { redirect: "/join/confirmed" }; // reserved-domain: never reaches Resend
  // the person turned the newsletter off after the link was sent: an old link must not subscribe them
  if (person.wants?.newsletter === false) return { redirect: "/join/confirmed?state=invalid" };
  if (person.newsletter && "resendContactId" in person.newsletter && person.newsletter.confirmedAt) return { redirect: "/join/confirmed" }; // idempotent
  await markConfirmedAt(deps.db, person._id, nowOf(deps));
  await syncContact(deps, person._id, person.email, person.profile, true);
  return { redirect: "/join/confirmed" };
}
