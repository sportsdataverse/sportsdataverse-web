import type { Db } from "mongodb";
import { createInvite, inviteUrl } from "./discord.ts";
import { discordInviteEmail, sendEmail } from "./email.ts";
import { subscribeToResend } from "./newsletter.ts";
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
  try {
    await setReviewStatus(deps.db, found.person._id, "approved", deps.reviewer, now);
  } catch {
    deps.log?.(`db write failed for person ${String(personId)}`);
    return { ok: false, emailed: false, message: "Couldn't save that decision — try again." };
  }
  // best-effort refresh: the decision already landed, so a failed re-read falls
  // back to the pre-write snapshot rather than reporting the approval as failed
  let refreshed: PersonDoc | null = null;
  try {
    refreshed = await findPersonById(deps.db, String(personId));
  } catch {
    deps.log?.(`db read failed for person ${String(personId)}`);
  }
  return mintAndSend(deps, refreshed ?? found.person, now);
}

export async function resendInvite(deps: ReviewDeps, personId: PersonId): Promise<InviteResult> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return { ok: false, emailed: false, message: found.message };
  const { person } = found;
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

export async function retrySync(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const found = await safeFindPerson(deps, personId);
  if (!found.ok) return found;
  const { person } = found;
  if (!person.email) return { ok: false, message: "This person has no email on file to sync." };
  // the double opt-in design exists so we never hold an address nobody offered —
  // an admin retry button must not be the one path that skips consent
  if (!person.wants.newsletter) return { ok: false, message: "This person didn't ask for the newsletter — nothing to sync." };
  if (person.newsletter && "unsubscribed" in person.newsletter && person.newsletter.unsubscribed) {
    return { ok: false, message: "This person unsubscribed from the newsletter — a retry won't resubscribe them." };
  }
  try {
    const props = person.profile ? contactProperties(person.profile) : undefined;
    const { contactId, unsubscribed } = await subscribeToResend(
      person.email,
      { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl, log: deps.log },
      props
    );
    const confirmedAt = person.newsletter && "confirmedAt" in person.newsletter ? person.newsletter.confirmedAt : undefined;
    await markNewsletterSynced(deps.db, person._id, contactId, now, unsubscribed, confirmedAt);
    return { ok: true, message: unsubscribed ? "Synced — the contact is unsubscribed in Resend." : "Synced." };
  } catch (e) {
    deps.log?.(`retry sync failed for person ${String(personId)}: ${summarizeError(e)}`);
    return { ok: false, message: (e as Error).message };
  }
}

export async function removePerson(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  let gone: boolean;
  try {
    gone = await deletePerson(deps.db, personId);
  } catch {
    deps.log?.(`db delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't delete that record — try again." };
  }
  return gone
    ? { ok: true, message: "Deleted. Remove the Resend contact by hand if they had one." }
    : { ok: false, message: "No such person." };
}
