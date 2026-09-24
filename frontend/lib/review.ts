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

async function mintAndSend(deps: ReviewDeps, person: PersonDoc, now: Date): Promise<InviteResult> {
  const existing = liveInvite(person, now);
  let code: string;
  if (existing) {
    code = existing.code;
  } else {
    try {
      const invite = await createInvite({
        botToken: deps.discordBotToken,
        channelId: deps.discordChannelId,
        fetchImpl: deps.fetchImpl,
        now: () => now,
      });
      await recordDiscordInvite(deps.db, person._id, invite, now);
      code = invite.code;
    } catch (e) {
      const msg = (e as Error).message;
      deps.log?.(`discord invite failed for person ${String(person._id)}: ${msg}`);
      return { ok: false, emailed: false, message: msg };
    }
  }
  const url = inviteUrl(code);
  if (!deps.resendFrom || !person.email) {
    return { ok: true, inviteUrl: url, emailed: false, message: "Invite ready — send it yourself (no sender configured)." };
  }
  try {
    await sendEmail({ from: deps.resendFrom, to: person.email, ...discordInviteEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    return { ok: true, inviteUrl: url, emailed: true, message: "Invite emailed." };
  } catch (e) {
    deps.log?.(`discord invite email failed for person ${String(person._id)}: ${(e as Error).message}`);
    return { ok: true, inviteUrl: url, emailed: false, message: "Invite ready, but the email failed — send it yourself." };
  }
}

export async function approve(deps: ReviewDeps, personId: PersonId): Promise<InviteResult> {
  const now = nowOf(deps);
  const person = await findPersonById(deps.db, String(personId));
  if (!person) return { ok: false, emailed: false, message: "No such person." };
  await setReviewStatus(deps.db, person._id, "approved", deps.reviewer, now);
  return mintAndSend(deps, (await findPersonById(deps.db, String(personId))) ?? person, now);
}

export async function resendInvite(deps: ReviewDeps, personId: PersonId): Promise<InviteResult> {
  const now = nowOf(deps);
  const person = await findPersonById(deps.db, String(personId));
  if (!person) return { ok: false, emailed: false, message: "No such person." };
  return mintAndSend(deps, person, now);
}

export async function decline(
  deps: ReviewDeps,
  personId: PersonId,
  reason: string,
  notify: boolean
): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const person = await findPersonById(deps.db, String(personId));
  if (!person) return { ok: false, message: "No such person." };
  await setReviewStatus(deps.db, person._id, "declined", deps.reviewer, now, reason);
  if (!notify || !deps.resendFrom || !person.email) return { ok: true, message: "Declined." };
  try {
    await sendEmail(
      {
        from: deps.resendFrom,
        to: person.email,
        subject: "About your SportsDataverse Discord request",
        html: `<p>Thanks for asking to join our Discord. We're not able to add you right now.</p><p>${reason}</p><p>— SportsDataverse</p>`,
        text: `Thanks for asking to join our Discord. We're not able to add you right now.\n\n${reason}\n\n— SportsDataverse`,
      },
      { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl }
    );
    return { ok: true, message: "Declined and notified." };
  } catch (e) {
    deps.log?.(`decline email failed for person ${String(personId)}: ${(e as Error).message}`);
    return { ok: true, message: "Declined; the email failed." };
  }
}

export async function retrySync(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  const now = nowOf(deps);
  const person = await findPersonById(deps.db, String(personId));
  if (!person?.email) return { ok: false, message: "No such person." };
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
    deps.log?.(`retry sync failed for person ${String(personId)}: ${(e as Error).message}`);
    return { ok: false, message: (e as Error).message };
  }
}

export async function removePerson(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  const gone = await deletePerson(deps.db, personId);
  return gone
    ? { ok: true, message: "Deleted. Remove the Resend contact by hand if they had one." }
    : { ok: false, message: "No such person." };
}
