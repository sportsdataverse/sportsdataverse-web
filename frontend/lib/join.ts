import type { Db } from "mongodb";
import { QUESTIONS, JOIN_SECTIONS, SURVEY_SECTIONS } from "../content/survey.ts";
import { isReservedEmail, joinBodySchema, surveyBodySchema } from "./joinSchema.ts";
import { subscribeToResend } from "./newsletter.ts";
import { allowRequest } from "./rateLimit.ts";
import { contactProperties, projectProfile, validateAnswers, type Profile } from "./survey.ts";
import { signConfirmToken, verifyConfirmToken } from "./confirmToken.ts";
import { confirmEmail, discordInviteEmail, sendEmail } from "./email.ts";
import { createInvite, inviteUrl } from "./discord.ts";
import {
  findPersonById, findPersonByEmail, linkGithubLogin, markConfirmedAt, markNewsletterConfirmed, markNewsletterPending,
  markNewsletterSkipped, markNewsletterSynced, clearNewsletterPending, recordDiscordInvite, recordSurvey, setReviewStatus,
  upsertJoin, upsertNewsletterSignup, type PersonDoc, type PersonId,
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
  /** the signed-in visitor, when there is one: the only source of auto-admit */
  viewer?: { login: string; isOrgMember: boolean; isContributor: boolean } | null;
  discordBotToken?: string;
  discordChannelId?: string;
};

export type JoinResult = { status: 200 | 400 | 429; body: { success: boolean; message: string } };

const JOIN_LIMIT = { limit: 5, windowSec: 3600 };
const SURVEY_LIMIT = { limit: 10, windowSec: 3600 };
const DEFAULT_SITE = "https://www.sportsdataverse.org";
const CONFIRMED_MSG = "You're on the list.";
const PENDING_MSG = "Almost there — check your inbox and confirm your email.";
const SEND_FAILED_MSG = "We couldn't send the confirmation email just now. Please try again in a few minutes.";
const QUEUED_MSG = "Thanks — a member will review your Discord request and email you.";
const CONFIRMED_DISCORD_MSG = "You're already on the list for Discord — check your email for the invite.";

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

/**
 * Discord half of a join. Someone GitHub already vouches for (an org member, or
 * anyone with a merged PR in the org) is admitted immediately; everyone else is
 * queued for a member to review. A Discord outage never costs us the person:
 * the decision is stored first, and a failed or unrecorded invite falls back
 * to the same review queue an unvouched visitor goes through — there is no
 * separate retry path, so "queued" has to be the recovery for both.
 */
async function admitOrQueue(
  deps: JoinDeps,
  personId: PersonId,
  email: string,
  existing: PersonDoc | null
): Promise<string> {
  const now = nowOf(deps);
  const viewer = deps.viewer ?? null;
  const existingStatus = existing?.status;

  // a decision already taken stands: re-submitting is not an appeal
  if (existingStatus === "declined") return QUEUED_MSG;
  if (existingStatus === "approved" || existingStatus === "auto") {
    // they already proved who they are once via OAuth; if we never emailed
    // them (no verified sender configured) the only honest thing to do is
    // hand back the invite we're holding, not repeat a promise we can't keep
    const code = existing?.discord?.code;
    if (!deps.resendFrom && code) return `You're already on the list for Discord — here's your invite: ${inviteUrl(code)}`;
    return CONFIRMED_DISCORD_MSG;
  }

  if (viewer) {
    const linked = await linkGithubLogin(deps.db, personId, viewer.login);
    // this GitHub identity already has a person record under another email —
    // queue instead of minting a second invite for the same human
    if (!linked) return QUEUED_MSG;
  }

  const vouched = Boolean(viewer && (viewer.isOrgMember || viewer.isContributor));
  if (!vouched) return QUEUED_MSG; // upsertJoin already left them "pending"; nothing more to stamp

  await setReviewStatus(deps.db, personId, "auto", viewer!.login, now);
  try {
    const invite = await createInvite({
      botToken: deps.discordBotToken,
      channelId: deps.discordChannelId,
      fetchImpl: deps.fetchImpl,
      now: () => now,
    });
    await recordDiscordInvite(deps.db, personId, invite, now);
    const url = inviteUrl(invite.code);
    if (deps.resendFrom) {
      try {
        await sendEmail({ from: deps.resendFrom, to: email, ...discordInviteEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
      } catch (e) {
        deps.log?.(`discord invite email failed for person ${String(personId)}: ${(e as Error).message}`);
      }
    }
    return `You're in — here's your Discord invite: ${url}`;
  } catch (e) {
    // the invite either never minted or never got recorded — either way, this
    // person must not sit in "auto" with no usable invite and no queue that
    // lists them: put them back in front of a human instead
    deps.log?.(`discord invite failed for person ${String(personId)}: ${(e as Error).message}`);
    await setReviewStatus(deps.db, personId, "pending", null, now);
    return QUEUED_MSG;
  }
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

  const existing = answers && profile ? await findPersonByEmail(deps.db, email) : null;
  const now = nowOf(deps);
  const { personId, newsletter } = answers && profile
    ? await upsertJoin(deps.db, { email, name, answers, profile, wants, placement }, now)
    : await upsertNewsletterSignup(deps.db, { email, placement }, now);

  if (!wants.newsletter && newsletter && "pending" in newsletter) {
    // they turned the newsletter off before confirming: retire the unused invite
    await clearNewsletterPending(deps.db, personId);
  }
  const message = wants.newsletter ? await beginOptIn(deps, personId, email, profile, newsletter) : "Thanks — we've got your answers.";
  const parts = [message];
  if (wants.discord) parts.push(await admitOrQueue(deps, personId, email, existing));
  return { status: 200, body: { success: true, message: parts.filter(Boolean).join(" ") } };
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
