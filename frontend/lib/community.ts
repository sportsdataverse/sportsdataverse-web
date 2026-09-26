import { QUESTIONS, type Answers } from "../content/survey.ts";
import { SUBDIVISIONS } from "../content/geo.ts";
import { AFFILIATION_LABELS, AFFILIATION_TYPES } from "./identity.ts";
import { isReservedEmail } from "./joinSchema.ts";
import type { PersonDoc } from "./people.ts";

/**
 * The admin Community browser's model. Pure: filtering, paging and counting
 * happen in memory over a projected load (lib/communityData.ts), the approach
 * lib/population.ts already takes, so no URL key or value ever reaches Mongo.
 *
 * ponytail: in-memory over every person — fine to tens of thousands; move the
 * filter into a Mongo query built from the same DIMENSIONS if `people` outgrows it.
 */
export type CommunityPerson = PersonDoc & { latestSource: "join" | "survey" | "newsletter"; identityChanged: boolean };

export type Option = { value: string; label: string };
export type Dim = { key: string; label: string; options?: Option[]; values: (p: CommunityPerson) => string[] };

// null and undefined are both "absent" (hand-built requests can store null)
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : typeof v === "string" && v ? [v] : [];

const WANTS = ["discord", "newsletter", "package", "stickers"] as const;
const STATUSES = ["pending", "approved", "declined", "auto"];

export const DIMENSIONS: Dim[] = [
  ...QUESTIONS.filter((qn) => qn.type !== "text").map(
    (qn): Dim => ({
      key: `q.${qn.id}`,
      label: qn.label,
      options: qn.options,
      values: (p) => list((p.answers as Answers | null | undefined)?.[qn.id]),
    })
  ),
  {
    key: "affiliation",
    label: "Affiliation type",
    options: AFFILIATION_TYPES.map((t) => ({ value: t, label: AFFILIATION_LABELS[t] })),
    values: (p) => [...new Set((p.affiliations ?? []).map((a) => a.type))],
  },
  { key: "country", label: "Country", values: (p) => list(p.location?.country) },
  {
    key: "region",
    label: "State / province",
    values: (p) => (p.location?.country && p.location.region ? [`${p.location.country}:${p.location.region}`] : []),
  },
  {
    key: "source",
    label: "Latest submission",
    options: [{ value: "join", label: "/join" }, { value: "survey", label: "/survey" }, { value: "newsletter", label: "Newsletter sign-up" }],
    values: (p) => [p.latestSource],
  },
  {
    key: "wants",
    label: "Asked for",
    options: WANTS.map((w) => ({ value: w, label: w })),
    values: (p) => WANTS.filter((w) => p.wants?.[w]),
  },
  {
    key: "discordStatus",
    label: "Discord status",
    options: STATUSES.map((s) => ({ value: s, label: s })),
    values: (p) => (p.wants?.discord ? [p.status] : []),
  },
  {
    key: "identified",
    label: "Identified",
    options: [{ value: "identified", label: "Has an email" }, { value: "anonymous", label: "Anonymous (before names were required)" }],
    values: (p) => [p.email ? "identified" : "anonymous"],
  },
  {
    key: "test",
    label: "Test address",
    options: [{ value: "real", label: "Real address" }, { value: "test", label: "Test address" }],
    values: (p) => [p.email && isReservedEmail(p.email) ? "test" : "real"],
  },
  {
    key: "dnc",
    label: "Do not contact",
    options: [{ value: "no", label: "Contactable" }, { value: "yes", label: "Do not contact" }],
    values: (p) => [p.doNotContact ? "yes" : "no"],
  },
];

const BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));
export const dimension = (key: string): Dim | undefined => BY_KEY.get(key);

export type CommunityQuery = {
  filters: Record<string, string[]>;
  q: string;
  from?: string;
  to?: string;
  page: number;
  x?: string;
  y?: string;
};

export const PAGE_SIZE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The allowlist: unknown keys are dropped; a dimension with fixed options keeps only known values. */
export function parseCommunityQuery(sp: URLSearchParams): CommunityQuery {
  const filters: Record<string, string[]> = {};
  for (const d of DIMENSIONS) {
    const allowed = d.options ? new Set(d.options.map((o) => o.value)) : null;
    const vals = [...new Set(sp.getAll(`f.${d.key}`))]
      .filter((v) => v.length > 0 && v.length <= 120 && (!allowed || allowed.has(v)))
      .slice(0, 50);
    if (vals.length) filters[d.key] = vals;
  }
  const page = Number.parseInt(sp.get("page") ?? "1", 10);
  const day = (k: string) => {
    const v = sp.get(k) ?? "";
    return DAY.test(v) ? v : undefined;
  };
  const dim = (k: string) => {
    const v = sp.get(k) ?? "";
    return BY_KEY.has(v) ? v : undefined;
  };
  return {
    filters,
    q: (sp.get("q") ?? "").trim().slice(0, 100),
    from: day("from"),
    to: day("to"),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    x: dim("x"),
    y: dim("y"),
  };
}

const text = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");

function haystack(p: CommunityPerson): string[] {
  return [
    p.name,
    p.email,
    p.location?.city,
    ...(p.affiliations ?? []).map((a) => a.org),
    ...Object.values(p.socials ?? {}),
  ]
    .map(text)
    .filter(Boolean);
}

const stamp = (p: CommunityPerson): Date | undefined => p.lastSubmittedAt ?? p.createdAt ?? undefined;

export function matches(p: CommunityPerson, q: CommunityQuery): boolean {
  for (const [key, want] of Object.entries(q.filters)) {
    const have = BY_KEY.get(key)?.values(p) ?? [];
    if (!want.some((w) => have.includes(w))) return false;
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    if (!haystack(p).some((s) => s.includes(needle))) return false;
  }
  const day = stamp(p)?.toISOString().slice(0, 10);
  if (q.from && (!day || day < q.from)) return false;
  if (q.to && (!day || day > q.to)) return false;
  return true;
}

export function paginate(people: CommunityPerson[], page: number) {
  const sorted = [...people].sort((a, b) => (stamp(b)?.getTime() ?? 0) - (stamp(a)?.getTime() ?? 0));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(Math.max(1, page), pages);
  return { total: sorted.length, page: cur, pages, rows: sorted.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE) };
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** Country code -> display name. The one implementation every Community
 *  component used to carry its own copy of — Intl.DisplayNames at render/read
 *  time, never a bundled name list, falling back to the raw code for
 *  anything Intl can't resolve. */
export function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Option label, then a region's name, then the raw value — country codes are
 *  named separately, with `countryName` above. */
export function labelOf(d: Dim, value: string): string {
  const o = d.options?.find((x) => x.value === value);
  if (o) return o.label;
  if (d.key === "region") {
    const [country, region] = value.split(":");
    return SUBDIVISIONS[country]?.find(([code]) => code === region)?.[1] ?? `${country} ${region}`;
  }
  return value;
}

export type Count = { value: string; label: string; count: number };

export function aggregate(people: CommunityPerson[]): { key: string; label: string; counts: Count[] }[] {
  return DIMENSIONS.map((d) => {
    const m = new Map<string, number>();
    for (const p of people) for (const v of new Set(d.values(p))) m.set(v, (m.get(v) ?? 0) + 1);
    const counts = [...m]
      .map(([value, count]) => ({ value, label: labelOf(d, value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"));
    return { key: d.key, label: d.label, counts };
  });
}

/** Unfiltered choices for the dimensions with no fixed option list (country,
 *  region, the two free-text package questions): computed over every person,
 *  never the filtered hits, so ticking one value never hides the others and
 *  an empty result never hides the active filter (I1). */
export function freeValueOptions(people: CommunityPerson[]): Record<string, Count[]> {
  const out: Record<string, Count[]> = {};
  for (const { key, counts } of aggregate(people)) {
    if (!BY_KEY.get(key)?.options) out[key] = counts;
  }
  return out;
}

/** Admin-only: pairs are allowed here (never on the member Population tab). */
export function crossTab(people: CommunityPerson[], xKey: string, yKey: string) {
  const dx = BY_KEY.get(xKey);
  const dy = BY_KEY.get(yKey);
  if (!dx || !dy || xKey === yKey) return null;
  const cells: Record<string, Record<string, number>> = {};
  const xs = new Map<string, number>();
  const ys = new Map<string, number>();
  for (const p of people) {
    for (const a of new Set(dx.values(p))) {
      for (const b of new Set(dy.values(p))) {
        (cells[a] ??= {})[b] = (cells[a][b] ?? 0) + 1;
        xs.set(a, (xs.get(a) ?? 0) + 1);
        ys.set(b, (ys.get(b) ?? 0) + 1);
      }
    }
  }
  const order = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).map(([k]) => k);
  return { x: order(xs), y: order(ys), cells };
}
