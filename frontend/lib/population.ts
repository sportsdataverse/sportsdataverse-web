import type { Db } from "mongodb";
import type { PersonDoc } from "./people.ts";
import { fetchClickCounts, type ClickCounts } from "./plausible.ts";
import { fetchMemberCount } from "./discord.ts";

export type Count = { key: string; count: number };

export type Population = {
  totals: { people: number; withProfile: number };
  byRole: Count[];
  byLanguage: Count[];
  bySport: Count[];
  byStatus: Count[];
  funnel: { discoveredVia: Count[]; updatesVia: Count[]; newsChannel: Count[] };
  wants: { newsletter: number; discord: number; package: number; stickers: number };
  newsletter: { synced: number; pending: number; skipped: number; unsubscribed: number };
  /** from Plausible; carries its own status so the tab can say why it is empty */
  clicks: ClickCounts;
  passive: { discordMembers: number | null };
};

function tally(values: string[]): Count[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Pure: counts only. It never copies a name, email or handle into the result,
 * because the Population tab is read by every org member.
 *
 * ponytail: in-memory aggregation over a projected find — fine to tens of
 * thousands of people; move to a $group pipeline if `people` outgrows that.
 */
export function aggregatePopulation(people: PersonDoc[]): Omit<Population, "passive" | "clicks"> {
  const profiled = people.filter((p) => p.profile);
  const pf = profiled.map((p) => p.profile!);
  const nl = { synced: 0, pending: 0, skipped: 0, unsubscribed: 0 };
  for (const p of people) {
    const n = p.newsletter;
    if (!n || typeof n !== "object") continue;
    if ("resendContactId" in n) (n.unsubscribed ? nl.unsubscribed++ : nl.synced++);
    else if ("pending" in n) nl.pending++;
    else if ("skipped" in n) nl.skipped++;
  }
  return {
    totals: { people: people.length, withProfile: profiled.length },
    byRole: tally(pf.map((p) => p.role)),
    byLanguage: tally(pf.flatMap((p) => p.languages)),
    bySport: tally(pf.flatMap((p) => p.sports)),
    // status as stored means "Discord admission state" only for people who asked
    // for Discord — a footer newsletter signup or a non-Discord /join applicant
    // is stamped "pending" too, and pooling them would read as a review backlog
    // that isn't there (the Queue tab shows the real one)
    byStatus: tally(people.filter((p) => p.wants?.discord).map((p) => p.status)),
    funnel: {
      discoveredVia: tally(pf.map((p) => p.discoveredVia)),
      updatesVia: tally(pf.flatMap((p) => p.updatesVia)),
      newsChannel: tally(pf.map((p) => p.newsChannel)),
    },
    wants: {
      newsletter: people.filter((p) => p.wants?.newsletter).length,
      discord: people.filter((p) => p.wants?.discord).length,
      package: people.filter((p) => p.wants?.package).length,
      stickers: people.filter((p) => p.wants?.stickers).length,
    },
    newsletter: nl,
  };
}

export async function loadPopulation(
  db: Db,
  deps: { discordBotToken?: string; discordGuildId?: string; plausibleApiKey?: string; plausibleSiteId?: string; fetchImpl?: typeof fetch }
): Promise<Population> {
  // project only what is counted — name/email/handles/answers never leave Mongo.
  // `newsletter` is the one exception: it is projected whole, so a
  // resendContactId or a skip reason does reach process memory here, but
  // aggregatePopulation only tests key presence on it, so neither reaches the
  // response.
  // Mongo and both external calls run concurrently — each external call is
  // best-effort and bounded by its own timeout, and none of the three should
  // wait on another.
  const [peopleRaw, clicks, discordMembers] = await Promise.all([
    db
      .collection("people")
      .find({}, { projection: { status: 1, wants: 1, profile: 1, newsletter: 1 } })
      .toArray(),
    fetchClickCounts({ apiKey: deps.plausibleApiKey, siteId: deps.plausibleSiteId, fetchImpl: deps.fetchImpl }),
    fetchMemberCount({ botToken: deps.discordBotToken, guildId: deps.discordGuildId, fetchImpl: deps.fetchImpl }),
  ]);
  const people = peopleRaw as unknown as PersonDoc[];
  return { ...aggregatePopulation(people), clicks, passive: { discordMembers } };
}
