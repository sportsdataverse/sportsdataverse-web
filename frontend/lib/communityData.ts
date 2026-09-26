import type { Db, ObjectId } from "mongodb";
import { QUESTIONS } from "../content/survey.ts";
import type { CommunityPerson } from "./community.ts";
import { isReservedEmail } from "./joinSchema.ts";
import type { PersonDoc } from "./people.ts";
import type { ResponseDoc } from "./responses.ts";

/**
 * Everything the admin Community browser reads or writes. Admin routes only
 * (app/api/platform/admin/community/**) — never a member route; see
 * test/personDataReaders.test.ts.
 */

// What the browser needs. `discord` is left out: its code is a live bearer credential.
const PERSON_FIELDS = {
  email: 1, name: 1, location: 1, socials: 1, affiliations: 1, answers: 1, profile: 1, wants: 1,
  status: 1, doNotContact: 1, githubLogin: 1, createdAt: 1, updatedAt: 1, lastSubmittedAt: 1,
} as const;

const people = (db: Db) => db.collection<PersonDoc>("people");
const responses = (db: Db) => db.collection<ResponseDoc>("responses");

type IdentityLike = { name?: unknown; location?: unknown; socials?: unknown; affiliations?: unknown };

/** Stable comparison; null and undefined are both absent. */
function canonical(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(canonical);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const c = canonical((v as Record<string, unknown>)[k]);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v;
}
const identityOf = (i: IdentityLike | undefined) =>
  JSON.stringify(canonical({ name: i?.name, location: i?.location, socials: i?.socials, affiliations: i?.affiliations }));

const legacySource = (p: PersonDoc): "join" | "survey" => (p.status === "survey" ? "survey" : "join");

/** Strip the projection's `null`s so every reader sees absent fields as absent. */
function clean<T extends object>(doc: T): T {
  return Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== null)) as T;
}

export async function loadCommunity(db: Db): Promise<CommunityPerson[]> {
  // ponytail: every person plus every response's identity, once per request — fine to tens of thousands
  const [ps, rs] = await Promise.all([
    people(db).find({}, { projection: PERSON_FIELDS }).toArray(),
    responses(db).find({}, { projection: { personId: 1, source: 1, createdAt: 1, identity: 1 } }).toArray(),
  ]);
  const byPerson = new Map<string, ResponseDoc[]>();
  for (const r of rs) {
    const k = String(r.personId);
    (byPerson.get(k) ?? byPerson.set(k, []).get(k)!).push(r);
  }
  for (const list of byPerson.values()) list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return ps.map((raw) => {
    const p = clean(raw) as PersonDoc;
    delete (p as { discord?: unknown }).discord; // defense in depth if a projection is ignored
    const mine = byPerson.get(String(p._id)) ?? [];
    return {
      ...p,
      latestSource: mine[0]?.source ?? legacySource(p),
      identityChanged: mine.length > 1 && identityOf(mine[0].identity) !== identityOf(mine[1].identity),
    };
  });
}

export type HistoryEntry = {
  at: Date | null;
  source: "join" | "survey";
  identity: Record<string, unknown>;
  answers: Record<string, unknown>;
  implicit: boolean;
  identityChanged: boolean;
};

export async function personHistory(db: Db, id: ObjectId): Promise<{ person: CommunityPerson; history: HistoryEntry[] } | null> {
  const raw = await people(db).findOne({ _id: id }, { projection: PERSON_FIELDS });
  if (!raw) return null;
  const p = clean(raw) as PersonDoc;
  delete (p as { discord?: unknown }).discord;
  const rs = (await responses(db).find({ personId: id }).toArray()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const history: HistoryEntry[] = rs.length
    ? rs.map((r, i) => ({
        at: r.createdAt,
        source: r.source,
        identity: canonical(r.identity) as Record<string, unknown>,
        answers: (r.answers ?? {}) as Record<string, unknown>,
        implicit: false,
        identityChanged: i + 1 < rs.length && identityOf(r.identity) !== identityOf(rs[i + 1].identity),
      }))
    : [{
        // before PR 1 there was no history: show what the person record holds, dated when they joined
        at: p.createdAt ?? null,
        source: legacySource(p),
        identity: canonical({ name: p.name, location: p.location, socials: p.socials, affiliations: p.affiliations }) as Record<string, unknown>,
        answers: (p.answers ?? {}) as Record<string, unknown>,
        implicit: true,
        identityChanged: false,
      }];
  const person: CommunityPerson = {
    ...p,
    latestSource: rs[0]?.source ?? legacySource(p),
    identityChanged: history[0]?.identityChanged ?? false,
  };
  return { person, history };
}

/** One table row. No answers, no invite code. */
export function listRow(p: CommunityPerson) {
  const top = p.affiliations?.[0];
  return {
    id: String(p._id),
    name: p.name ?? null,
    email: p.email ?? null,
    affiliation: top ? { type: top.type, org: top.org } : null,
    role: typeof p.answers?.role === "string" ? p.answers.role : null,
    country: p.location?.country ?? null,
    region: p.location?.region ?? null,
    source: p.latestSource,
    lastSubmitted: p.lastSubmittedAt ?? p.createdAt ?? null,
    doNotContact: Boolean(p.doNotContact),
    anonymous: !p.email,
    test: Boolean(p.email && isReservedEmail(p.email)),
    identityChanged: p.identityChanged,
  };
}

export function exportable(p: CommunityPerson): boolean {
  return Boolean(p.email) && !p.doNotContact && !isReservedEmail(p.email!);
}

export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CLOSED = QUESTIONS.filter((qn) => qn.type !== "text");
const HEADER = [
  "name", "email", "country", "region", "city", "github", "bluesky", "x", "linkedin", "website", "affiliations",
  ...CLOSED.map((qn) => qn.id), "source", "last_submitted",
];

export function toCsv(list: CommunityPerson[]): string {
  const rows = list.filter(exportable).map((p) => {
    const answers = (p.answers ?? {}) as Record<string, unknown>;
    return [
      p.name, p.email, p.location?.country, p.location?.region, p.location?.city,
      p.socials?.github, p.socials?.bluesky, p.socials?.x, p.socials?.linkedin, p.socials?.website,
      (p.affiliations ?? []).map((a) => `${a.type}: ${a.org}${a.title ? ` (${a.title})` : ""}`).join("; "),
      ...CLOSED.map((qn) => {
        const v = answers[qn.id];
        return Array.isArray(v) ? v.join("; ") : v;
      }),
      p.latestSource,
      (p.lastSubmittedAt ?? p.createdAt)?.toISOString(),
    ];
  });
  return [HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type AuditEntry = {
  kind: "export" | "dnc_on" | "dnc_off";
  by: string;
  at: Date;
  personId?: ObjectId;
  params?: string;
  count?: number;
};

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.collection<AuditEntry>("admin_audit").insertOne(entry);
}

/** Recorded on the person and in admin_audit; export skips them from the next request on. */
export async function setDoNotContact(db: Db, personId: ObjectId, on: boolean, by: string, now: Date): Promise<boolean> {
  const res = on
    ? await people(db).updateOne({ _id: personId }, { $set: { doNotContact: { at: now, by }, updatedAt: now } })
    : await people(db).updateOne({ _id: personId }, { $unset: { doNotContact: "" }, $set: { updatedAt: now } });
  if (res.matchedCount !== 1) return false;
  await audit(db, { kind: on ? "dnc_on" : "dnc_off", by, at: now, personId });
  return true;
}
