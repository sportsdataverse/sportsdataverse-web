import type { PersonDoc } from "./people.ts";

/**
 * The Mongo filter for one People-tab view. Non-admin `all` is narrowed to
 * Discord requesters only — full per-person browsing (every name and email)
 * is admin-only; a member reviewing Discord still needs to find any requester,
 * approved/declined/auto included, not just the pending queue. Queue and
 * Unsynced are unchanged by role: the actions they support already require
 * `wants.discord` (queue) or newsletter opt-in (unsynced), so narrowing them
 * further would just hide rows a member can legitimately act on.
 */
export function peopleViewFilter(view: string, isAdmin: boolean): Record<string, unknown> {
  if (view === "unsynced") return { "wants.newsletter": true, "newsletter.resendContactId": { $exists: false } };
  if (view === "all") return isAdmin ? {} : { "wants.discord": true };
  return { status: "pending", "wants.discord": true };
}

/** The review queue. Any org member may read it: vouching is a community job,
 *  and the page under /platform/people is gated the same way. */
export function personRow(p: PersonDoc) {
  const n = p.newsletter;
  const newsletterState = !n ? "none" : "resendContactId" in n ? "synced" : "pending" in n ? "pending" : "skipped";
  // Self-reported, and only for someone a member is being asked to vouch for.
  // Location and answers never reach this member-readable list.
  const reviewing = p.status === "pending" && Boolean(p.wants?.discord);
  return {
    id: String(p._id),
    email: p.email ?? null,
    name: p.name ?? null,
    githubLogin: p.githubLogin ?? null,
    // a claim, never proof — the UI must render it as unverified
    claimedGithubLogin: p.claimedGithubLogin ?? null,
    status: p.status,
    wantsDiscord: Boolean(p.wants?.discord),
    wantsNewsletter: Boolean(p.wants?.newsletter),
    newsletterState,
    // NOT the code. It is a live 3-use bearer credential and this list is read by
    // every org member; the UI only ever asks whether one exists. The reviewer who
    // needs the actual link gets it in the approve/resend response, for their own action.
    hasInvite: Boolean(p.discord?.code),
    createdAt: p.createdAt,
    reviewedBy: p.reviewedBy ?? null,
    declineReason: p.declineReason ?? null,
    affiliations: reviewing ? p.affiliations ?? null : null,
    socials: reviewing ? p.socials ?? null : null,
  };
}
