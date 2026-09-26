import type { Db } from "mongodb";
import { createInvite, inviteUrl } from "./discord.ts";
import { discordInviteEmail, sendEmail } from "./email.ts";
import { subscribeToResend } from "./newsletter.ts";
import { deleteResponsesForPerson } from "./responses.ts";
import { deleteStickerRequestsForPerson } from "./stickers.ts";
import { contactProperties } from "./survey.ts";
import {
  deletePerson, findPersonById, markNewsletterSynced, recordDiscordInvite, setReviewStatus,
  type PersonDoc, type PersonId,
} from "./people.ts";

/**
 * Every reviewer action, as pure logic over an injected db and fetch — the same
 * shape as lib/join.ts, for the same reason: the admin routes stay thin and the
 * decisions are testable without a database or a Discord server.
 *
 * The order never changes: record the decision first, then attempt the outbound
 * work. A Discord outage or a missing sender costs an invite, never a decision.
 * None of the five exported functions may throw — a database read or write that
 * fails resolves to a result object like everything else, because the admin UI
 * has nothing to render for a rejected promise.
 */
export type ReviewDeps = {
  db: Db;
  reviewer: string;
  resendApiKey?: string;
  resendFrom?: string;
  discordBotToken?: string;
  discordChannelId?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (m: string) => void;
};

export type InviteResult = { ok: boolean; inviteUrl?: string; emailed: boolean; message: string };

const nowOf = (deps: ReviewDeps) => (deps.now ?? (() => new Date()))();

function liveInvite(person: PersonDoc | null, now: Date): { code: string } | null {
  if (!person?.discord) return null;
  return person.discord.expiresAt.getTime() > now.getTime() ? { code: person.discord.code } : null;
}

/**
 * For a log sink, not a response: reduce a caught error down to a category and
 * an HTTP status, never the raw body. Resend's own error responses can echo
 * the request back on a validation failure, and that request carries the
 * person's email address — the response returned to the admin (who already
 * knows who they're acting on) is unaffected by this, only what reaches `log`.
 */
function summarizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const http = /^(Discord|Resend) (\d{3}):/.exec(msg);
  if (http) return `${http[1]} ${http[2]}`;
  if (/not set$/.test(msg)) return "missing config";
  return "request failed";
}

type FoundPerson = { ok: true; person: PersonDoc } | { ok: false; message: string };

/** Every function's first step: look a person up without ever throwing. */
async function safeFindPerson(deps: ReviewDeps, personId: PersonId): Promise<FoundPerson> {
  let person: PersonDoc | null;
  try {
    person = await findPersonById(deps.db, String(personId));
  } catch {
    deps.log?.(`db read failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't read that record — try again." };
  }
  if (!person) return { ok: false, message: "No such person." };
  return { ok: true, person };
}

async function mintAndSend(deps: ReviewDeps, person: PersonDoc, now: Date): Promise<InviteResult> {
  const existing = liveInvite(person, now);
  let code: string;
  if (existing) {
    code = existing.code;
  } else {
    let invite: { code: string; expiresAt: Date };
    try {
      invite = await createInvite({
        botToken: deps.discordBotToken,
        channelId: deps.discordChannelId,
        fetchImpl: deps.fetchImpl,
        now: () => now,
      });
    } catch (e) {
      const msg = (e as Error).message;
      deps.log?.(`discord invite failed for person ${String(person._id)}: ${msg}`);
      return { ok: false, emailed: false, message: msg };
    }
    try {
      await recordDiscordInvite(deps.db, person._id, invite, now);
    } catch {
      // Discord already issued this code — and burned one of its 3 uses — before
      // the write failed. Reporting this as "Discord failed" would send the admin
      // to re-mint, orphaning the first invite for good; say what actually broke.
      deps.log?.(`discord invite record failed for person ${String(person._id)}`);
      return {
        ok: false,
        emailed: false,
        inviteUrl: inviteUrl(invite.code),
        message: `Discord issued an invite but we couldn't save it — record this code by hand: ${inviteUrl(invite.code)}`,
      };
    }
    code = invite.code;
  }
  const url = inviteUrl(code);
  if (!deps.resendFrom || !person.email) {
    return { ok: true, inviteUrl: url, emailed: false, message: "Invite ready — send it yourself (no sender configured)." };
  }
  try {
    await sendEmail({ from: deps.resendFrom, to: person.email, ...discordInviteEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    return { ok: true, inviteUrl: url, emailed: true, message: "Invite emailed." };
  } catch (e) {
    deps.log?.(`discord invite email failed for person ${String(person._id)}: ${summarizeError(e)}`);
    return { ok: true, inviteUrl: url, emailed: false, message: "Invite ready, but the email failed — send it yourself." };
  }
}

export async function approve(deps: ReviewDeps, personId: PersonId): Promise<InviteResult> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return { ok: false, emailed: false, message: found.message };
  // approve mints and sends a Discord invite — never for someone who did not
  // ask for one, no matter which admin view the button was clicked from
  if (!found.person.wants.discord) {
    return { ok: false, emailed: false, message: "This person didn't ask for Discord — nothing to approve." };
  }
  // spec -> Errors: "Never mark approved without a stored invite code." The
  // invite comes first because the decision's meaning depends on it: the Queue
  // view lists only `status: "pending"`, so stamping `approved` on a mint that
  // failed would drop someone holding nothing out of the one view an admin
  // works from. lib/join.ts rolls the same failure back to `pending` already.
  const minted = await mintAndSend(deps, found.person, now);
  if (!minted.ok) return { ...minted, message: `${minted.message} They stay in the queue.` };
  try {
    await setReviewStatus(deps.db, found.person._id, "approved", deps.reviewer, now);
  } catch {
    deps.log?.(`db write failed for person ${String(personId)}`);
    return { ...minted, ok: false, message: `${minted.message} The approval itself didn't save — try Approve again.` };
  }
  return minted;
}

export async function resendInvite(deps: ReviewDeps, personId: PersonId): Promise<InviteResult> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return { ok: false, emailed: false, message: found.message };
  const { person } = found;
  // the same gate approve has: a resend mints against the current answer, so
  // someone whose latest /join said "no Discord" must not get a fresh invite
  if (!person.wants.discord) {
    return { ok: false, emailed: false, message: "This person didn't ask for Discord — nothing to resend." };
  }
  // the human-review gate is the point: a resend must never be a back door
  // around a decision that already stands, or around one never made at all
  if (person.status === "declined") {
    return { ok: false, emailed: false, message: "This person was declined — resend is not available." };
  }
  if (person.status !== "approved" && person.status !== "auto") {
    return { ok: false, emailed: false, message: "Not yet approved — approve them first, then resend." };
  }
  return mintAndSend(deps, person, now);
}

export async function decline(
  deps: ReviewDeps,
  personId: PersonId,
  reason: string,
  notify: boolean
): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return found;
  // `declined` is the Discord decision, and every newsletter and survey row is
  // stamped `pending` too — declining one of those says nothing true, mails a
  // Discord refusal to someone who never mentioned Discord, and (before
  // requeue existed) locked a future request out for good. Same gate approve has.
  if (!found.person.wants.discord) {
    return { ok: false, message: "This person didn't ask for Discord — nothing to decline." };
  }
  try {
    await setReviewStatus(deps.db, found.person._id, "declined", deps.reviewer, now, reason);
  } catch {
    deps.log?.(`db write failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't save that decision — try again." };
  }
  if (!notify || !deps.resendFrom || !found.person.email) return { ok: true, message: "Declined." };
  try {
    await sendEmail(
      {
        from: deps.resendFrom,
        to: found.person.email,
        subject: "About your SportsDataverse Discord request",
        html: `<p>Thanks for asking to join our Discord. We're not able to add you right now.</p><p>${reason}</p><p>— SportsDataverse</p>`,
        text: `Thanks for asking to join our Discord. We're not able to add you right now.\n\n${reason}\n\n— SportsDataverse`,
      },
      { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl }
    );
    return { ok: true, message: "Declined and notified." };
  } catch (e) {
    deps.log?.(`decline email failed for person ${String(personId)}: ${summarizeError(e)}`);
    return { ok: true, message: "Declined; the email failed." };
  }
}

/**
 * The way back out of `declined`. Without it the state is terminal: no view's
 * queue lists a declined person, `/join` will not re-open them, and the only
 * other exit is Delete, which also destroys their newsletter record. A misclick
 * is not a lifetime ban, and someone declined in 2026 may be an org member in
 * 2027 — this puts them back in front of the next admin.
 */
export async function requeue(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return found;
  if (found.person.status !== "declined") {
    return { ok: false, message: "Only a declined person can be put back in the queue." };
  }
  // the same gate approve, decline and resend have: the Queue view asks for
  // `wants.discord: true`, so requeueing someone whose latest answer is "no"
  // would drop them into `pending` where no view looks — invisible to everyone
  if (!found.person.wants.discord) {
    return { ok: false, message: "This person didn't ask for Discord — nothing to put back in the queue." };
  }
  try {
    await setReviewStatus(deps.db, found.person._id, "pending", deps.reviewer, now);
  } catch {
    deps.log?.(`db write failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't save that decision — try again." };
  }
  return { ok: true, message: "Back in the queue." };
}

export async function retrySync(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return found;
  const { person } = found;
  if (!person.email) return { ok: false, message: "This person has no email on file to sync." };
  // the double opt-in design exists so we never hold an address nobody offered —
  // an admin retry button must not be the one path that skips consent
  if (!person.wants.newsletter) return { ok: false, message: "This person didn't ask for the newsletter — nothing to sync." };
  // a reserved domain (@example.com and friends, from CI walkthroughs) was kept
  // off the real list on purpose; a retry must not be the way it gets there
  if (person.newsletter && "skipped" in person.newsletter) {
    return { ok: false, message: "This address is a reserved domain — it is never sent to Resend." };
  }
  // a confirmation was sent and never clicked: syncing now would hand Resend an address
  // whose owner never agreed. Single opt-in never writes `pending`, so it is unaffected.
  if (person.newsletter && "pending" in person.newsletter && !person.newsletter.confirmedAt) {
    return { ok: false, message: "This person hasn't confirmed their newsletter subscription yet — a retry won't add them." };
  }
  if (person.newsletter && "unsubscribed" in person.newsletter && person.newsletter.unsubscribed) {
    return { ok: false, message: "This person unsubscribed from the newsletter — a retry won't resubscribe them." };
  }
  let contactId: string, unsubscribed: boolean;
  try {
    const props = person.profile ? contactProperties(person.profile) : undefined;
    ({ contactId, unsubscribed } = await subscribeToResend(
      person.email,
      { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl, log: deps.log },
      props
    ));
  } catch (e) {
    deps.log?.(`retry sync failed for person ${String(personId)}: ${summarizeError(e)}`);
    return { ok: false, message: (e as Error).message };
  }
  const confirmedAt = person.newsletter && "confirmedAt" in person.newsletter ? person.newsletter.confirmedAt : undefined;
  try {
    await markNewsletterSynced(deps.db, person._id, contactId, now, unsubscribed, confirmedAt);
  } catch {
    // subscribeToResend is a create-or-find by email — a later retry finds the
    // same contact rather than duplicating it, so this is safe to say plainly
    deps.log?.(`retry sync record failed for person ${String(personId)}`);
    return { ok: false, message: "Resend has the contact, but we couldn't record it here — try Retry sync again." };
  }
  return { ok: true, message: unsubscribed ? "Synced — the contact is unsubscribed in Resend." : "Synced." };
}

/**
 * Erase a person, and first their sticker requests and package submissions
 * still awaiting review. Addresses go first because they are the most
 * sensitive thing the record points at — left behind, a postal address
 * would be stranded with no owner; a pending package, left behind, would
 * stay publishable in the CMS pointing at nobody. If any delete fails, the
 * person is kept, so a retry can finish the rest. A published package stays:
 * it is a public org listing, not the person's record.
 */
export async function removePerson(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  try {
    await deleteStickerRequestsForPerson(deps.db, personId);
  } catch {
    deps.log?.(`sticker delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't remove their sticker request — nothing was deleted. Try again." };
  }
  try {
    await deleteResponsesForPerson(deps.db, personId);
  } catch {
    deps.log?.(`response delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't remove their survey responses, so the record was kept — try again." };
  }
  try {
    await deps.db.collection("packages").deleteMany({ submittedBy: personId, published: { $ne: true } });
  } catch {
    deps.log?.(`package delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't delete that person's pending package submissions, so the record was kept — try again." };
  }
  let gone: boolean;
  try {
    gone = await deletePerson(deps.db, personId);
  } catch {
    deps.log?.(`db delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't delete that record — try again." };
  }
  return gone
    ? { ok: true, message: "Deleted, with their responses, any sticker request and pending package. Remove the Resend contact by hand if they had one." }
    : { ok: false, message: "No such person." };
}
