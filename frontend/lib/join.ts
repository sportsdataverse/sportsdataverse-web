import type { Db } from "mongodb";
import { CONTACT_EMAIL } from "../content/links.ts";
import { QUESTIONS, JOIN_SECTIONS, SURVEY_SECTIONS } from "../content/survey.ts";
import { isReservedEmail, joinBodySchema, surveyBodySchema } from "./joinSchema.ts";
import { subscribeToResend } from "./newsletter.ts";
import { allowRequest } from "./rateLimit.ts";
import { contactProperties, projectProfile, validateAnswers, type Profile } from "./survey.ts";
import { signConfirmToken, verifyConfirmToken } from "./confirmToken.ts";
import { confirmEmail, discordInviteEmail, sendEmail, stickerRequestEmail } from "./email.ts";
import { createInvite, inviteUrl } from "./discord.ts";
import { submitPackage } from "./packageSubmission.ts";
import { upsertStickerRequest } from "./stickers.ts";
import {
  findPersonById, findPersonByEmail, linkGithubLogin, markConfirmedAt, markNewsletterConfirmed, markNewsletterPending,
  markNewsletterSkipped, markNewsletterSynced, clearNewsletterPending, recordDiscordInvite, recordSurvey, setReviewStatus,
  upsertJoin, upsertNewsletterSignup, type PersonDoc, type PersonId,
  recordClaimedLogin,
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
/**
 * One sentence for "we just sent you a link" and for "this address is already
 * confirmed": with double opt-in live, two different sentences would tell an
 * anonymous caller which addresses are on the list — the same oracle the
 * Discord half closes, on the newsletter half.
 */
const PENDING_MSG = "Thanks — if this address still needs confirming, check your inbox for the link.";
const SEND_FAILED_MSG = "We couldn't send the confirmation email just now. Please try again in a few minutes.";
const QUEUED_MSG = "Thanks — a member will review your Discord request and email you.";
const CONFIRMED_DISCORD_MSG = "You're already on the list for Discord — check your email for the invite.";
/**
 * The one answer every caller this request cannot identify gets, whatever the
 * stored record says. An email address in a POST body is not proof of anything,
 * so "we already admitted this address" and "we have never seen it" must read
 * identically — otherwise the endpoint is a free membership oracle for anyone
 * with a list of addresses, and (worse) a way to ask for someone else's invite.
 */
const ON_FILE_MSG = "Thanks — your Discord request is on file. If we can add you, you'll get an email.";

const nowOf = (deps: JoinDeps) => (deps.now ?? (() => new Date()))();

/** GitHub handles are case-insensitive: `OctoCat` and `octocat` are one person. */
const sameLogin = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

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
    // under double opt-in, answer exactly as an unknown address is answered
    return deps.resendFrom && deps.tokenSecret ? PENDING_MSG : CONFIRMED_MSG;
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
    // The marker is written BEFORE the send: it records "we asked this person to
    // confirm", which is true the moment we try. Writing it only on success left
    // a failed send indistinguishable from an ordinary unsynced row, and the
    // admin Retry-sync consent gate (lib/review.ts) keys on exactly this marker —
    // without it, one click subscribes an address whose owner never confirmed.
    // Never over a stronger record, though: `newsletter` is one state, not a bag
    // (people.ts), and both of its readers key on `"pending" in newsletter`, so a
    // record that kept `resendContactId` alongside a marker would be $unset
    // wholesale by clearNewsletterPending. The only record that reaches here
    // holding a contact is an unsubscribed one, and retrySync already refuses
    // that on its own gate — so its proof of consent is kept, not overwritten.
    if (!existing || ("pending" in existing && !existing.confirmedAt))
      await markNewsletterPending(deps.db, personId, now);
    await sendEmail({ from: deps.resendFrom, to: email, ...confirmEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
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

  // The echo is for a SELF-admission and nothing else: `auto` plus a reviewer
  // stamp equal to the caller means this record's login was bound inside the
  // same OAuth-vouched request that minted this invite, so the record's own
  // history proves the binding. Matching `githubLogin` alone would not — it is
  // written from a request whose email came out of the body (see
  // linkGithubLogin), so it is a claim, not a proof. Someone an admin approved
  // is relayed the link by hand, which is already the documented flow.
  const selfAdmitted = Boolean(
    viewer && existingStatus === "auto" && sameLogin(existing?.reviewedBy, viewer.login)
  );

  // a decision already taken stands: re-submitting is not an appeal
  if (existingStatus === "declined") return ON_FILE_MSG;
  if (existingStatus === "approved" || existingStatus === "auto") {
    if (!selfAdmitted) return ON_FILE_MSG;
    // this is their own admission; if we never emailed them (no verified sender
    // configured) the only honest thing to do is hand back the invite we're
    // holding, not repeat a promise we can't keep
    // only an invite minted for THIS admission and still alive: a failed rollback
    // can leave a previous occupant's code on the row, and a 7-day invite dies
    const d = existing?.discord;
    const ours = Boolean(
      d &&
        d.expiresAt.getTime() > now.getTime() &&
        existing?.reviewedAt &&
        d.invitedAt.getTime() >= existing.reviewedAt.getTime()
    );
    if (!deps.resendFrom && ours && d) return `You're already on the list for Discord — here's your invite: ${inviteUrl(d.code)}`;
    return CONFIRMED_DISCORD_MSG;
  }

  // What they said they are, for the member who will work this row. A claim, not
  // a key: recorded before the vouch, never compared, never an ownership test.
  if (viewer) await recordClaimedLogin(deps.db, personId, viewer.login);

  const vouched = Boolean(viewer && (viewer.isOrgMember || viewer.isContributor));
  if (!vouched) return ON_FILE_MSG; // upsertJoin already left them "pending"; nothing more to stamp

  // Bind the handle only here, behind the vouch. `githubLogin` is the record's
  // ownership key, so only a session GitHub vouches for may write it: a
  // signed-in stranger could otherwise stamp their handle on a queued person's
  // row, locking the rightful person out of linking their own and showing the
  // reviewing admin a handle that reads as identity and is not.
  const linked = await linkGithubLogin(deps.db, personId, viewer!.login);
  // this GitHub identity already has a person record under another email —
  // queue instead of minting a second invite for the same human
  if (!linked) return ON_FILE_MSG;

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
  let wants = { newsletter: true, discord: false, package: false, stickers: false };
  let answers: Record<string, string | string[]> | undefined;
  if (rawAnswers) {
    const v = validateAnswers(QUESTIONS, JOIN_SECTIONS, rawAnswers);
    if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
    answers = v.answers;
    profile = projectProfile(answers);
    wants = {
      newsletter: answers.wants_newsletter === "yes",
      discord: answers.wants_discord === "yes",
      package: answers.wants_package === "yes",
      stickers: answers.wants_stickers === "yes",
    };
  }

  // The flag and the payload must agree. A flag with no details is a form bug we
  // refuse cleanly rather than store half of; details with the flag off are not
  // a submission and are dropped.
  if (wants.package && !parsed.data.pkg) {
    return { status: 400, body: { success: false, message: "Add your package's details, or answer no to the package question." } };
  }
  if (wants.stickers && !parsed.data.sticker) {
    return { status: 400, body: { success: false, message: "Add a mailing address for the stickers, or answer no to the sticker question." } };
  }

  const lim = await limited(deps, `join:${ip}`, JOIN_LIMIT);
  if (lim) return lim;

  const existing = answers && profile ? await findPersonByEmail(deps.db, email) : null;
  const now = nowOf(deps);
  const { personId, newsletter } = answers && profile
    ? await upsertJoin(deps.db, { email, name, answers, profile, wants, placement }, now)
    : await upsertNewsletterSignup(deps.db, { email, placement }, now);

  let pkgNote = "";
  // Reserved-domain addresses (walkthrough@example.com and friends) are stored like any
  // signup but never reach an outbound side effect — see isReservedEmail's other callers
  // in beginOptIn/handleConfirm. A package submission is exactly that kind of side effect
  // (it lands in the member CMS queue), so the PR-evidence walkthrough can exercise this
  // whole flow, including the fieldset, without dropping a fake package in front of a reviewer.
  if (wants.package && parsed.data.pkg && !isReservedEmail(email)) {
    const { orgTier, ...pkg } = parsed.data.pkg;
    const pkgRes = await submitPackage(deps.db, pkg, personId, Boolean(orgTier), now);
    if (!pkgRes.ok) deps.log?.(`package submission failed for person ${String(personId)}`);
    pkgNote = pkgRes.message;
  }

  // The note is the same whether this request was created or one was already
  // open: a differing sentence would say whether this email has a request.
  // Reserved test addresses get the same note but never a sticker request, as
  // they never create a package — so the PR-evidence walkthrough shows the
  // sentence a visitor sees and leaves nothing behind.
  let stickerNote = "";
  let stickerCreated = false;
  if (wants.stickers && parsed.data.sticker) {
    stickerNote = `Stickers are on the list. If you'd already asked, we'll use the first address you gave — to change it, write to ${CONTACT_EMAIL}.`;
    if (!isReservedEmail(email)) {
      try {
        stickerCreated = (await upsertStickerRequest(deps.db, personId, parsed.data.sticker, now)).created;
      } catch {
        deps.log?.(`sticker request write failed for person ${String(personId)}`);
        stickerNote = "We couldn't record the sticker request — try again in a bit.";
      }
    }
  }

  if (!wants.newsletter && newsletter && "pending" in newsletter) {
    // they turned the newsletter off before confirming: retire the unused invite
    await clearNewsletterPending(deps.db, personId);
  }
  const message = wants.newsletter ? await beginOptIn(deps, personId, email, profile, newsletter) : "Thanks — we've got your answers.";
  const parts = [message];
  if (wants.discord) parts.push(await admitOrQueue(deps, personId, email, existing));
  if (stickerCreated && deps.resendFrom) {
    try {
      await sendEmail({ from: deps.resendFrom, to: email, ...stickerRequestEmail() }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    } catch {
      deps.log?.(`sticker confirmation email failed for person ${String(personId)}`);
    }
  }
  if (stickerNote) parts.push(stickerNote);
  if (pkgNote) parts.push(pkgNote);
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
  // idempotent — but an unsubscribed contact re-signing up and clicking the new
  // link is asking to come back, and their earlier confirmation must not be read
  // as "nothing to do" (it survives the re-signup now that the record is kept)
  if (person.newsletter && "resendContactId" in person.newsletter && person.newsletter.confirmedAt && !person.newsletter.unsubscribed) {
    return { redirect: "/join/confirmed" };
  }
  await markConfirmedAt(deps.db, person._id, nowOf(deps));
  await syncContact(deps, person._id, person.email, person.profile, true);
  return { redirect: "/join/confirmed" };
}
