# Community identity — PR 2 (Browse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give org admins a Community tab to page through people, filter by any answer, search, see aggregates with a pick-two cross-tab, open a person's full submission history, mark someone do-not-contact, and export a contact list as CSV.

**Architecture:** One pure module (`lib/community.ts`) defines every filterable dimension, parses the URL query through an allowlist, filters, pages, aggregates and cross-tabs people in memory — the same approach `lib/population.ts` already takes. A data module (`lib/communityData.ts`) loads a projected view of `people` plus each person's `responses`, builds histories, writes the do-not-contact flag and an audit trail, and renders CSV. Thin admin-only routes call those two; one client page and one person page render them.

**Tech Stack:** Next.js 16 App Router, React 19, SWR (via `useAdmin`), TypeScript, MongoDB driver 6, `node --test --experimental-strip-types` with `test/fakeDb.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-community-identity-and-browser-design.md` (section "PR 2 — Browse"). PR 1 (#55) is merged.

## Global Constraints

- All node commands run from `frontend/`. Gates: `npm run test:lib` (0 failing), `npx tsc --noEmit`, `npm run lint`, and — for tasks touching `app/` or `components/` — `timeout 600 npm run build; echo EXIT=$?` in the FOREGROUND with Bash timeout 600000; afterwards `ps aux | grep "[n]ext build"` shows nothing of yours.
- **Admin only, structurally:** every route under `app/api/platform/admin/community/**` calls `requireAdminApp()` before reading the body or touching the database, sends `Cache-Control: no-store`, and wraps its database work in try/catch returning JSON (never an HTML 500). Pages live under `app/(platform)/platform/admin/`, whose layout refuses non-admins.
- **No person data on member surfaces:** nothing under `lib/communityData.ts` is imported by a route that uses `requireMemberApp`, and the `responses` collection is read only by `lib/responses.ts` and `lib/communityData.ts`.
- **Never return the Discord invite code** — the person projection leaves `discord` out entirely.
- **Exports exclude** anyone marked do-not-contact, anonymous legacy rows (no email) and reserved test addresses (`isReservedEmail`). The count shown on the button equals the rows exported. Every export writes an `admin_audit` entry BEFORE the file is returned.
- **CSV cells** starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`; cells containing `"`, `,`, CR or LF are quoted with `"` doubled.
- **Absent means absent:** optional fields may be missing OR `null` (hand-built requests); readers treat `null` like `undefined` everywhere (display, search, export, filters).
- No raw URL key or value ever reaches a Mongo query: the URL is parsed through `parseCommunityQuery`'s allowlist and filtering happens in memory.
- Log lines carry ids and counts only — never a name, email, address or answer.
- Commits: Conventional Commits, explicit paths only, NO co-author trailer and NO "Generated with" footer. Do not push. Implementers never dispatch subagents. Never type a backslash-u escape into a tool parameter.

## Review Focus

1. A legacy person (no `responses`, maybe no profile, no email) renders in the list, counts in aggregates, and opens with one implicit submission — pinned in Tasks 1–2.
2. Optional fields stored as `null` behave like absent in search, display and CSV — pinned in Task 2.
3. A formula-looking or comma/quote/newline-bearing value is escaped in CSV — pinned in Task 2.
4. A multi-choice answer counts once per chosen option, and a person without an answer is left out of that dimension's counts — pinned in Task 1.
5. Marking someone do-not-contact removes them from the very next export and from the button's count — pinned in Task 2 and wired in Task 3.

---

### Task 1: The dimension model, query parsing, filtering, paging and aggregates

**Files:**
- Create: `frontend/lib/community.ts`
- Modify: `frontend/lib/people.ts` (`PersonDoc`: add `doNotContact?: { at: Date; by: string };` after `lastSubmittedAt`)
- Test: `frontend/test/community.test.ts` (new)

**Interfaces:**
- Produces: `type CommunityPerson = PersonDoc & { latestSource: "join" | "survey"; identityChanged: boolean }`; `type Dim`; `DIMENSIONS: Dim[]`; `dimension(key): Dim | undefined`; `type CommunityQuery = { filters: Record<string, string[]>; q: string; from?: string; to?: string; page: number; x?: string; y?: string }`; `PAGE_SIZE = 50`; `parseCommunityQuery(sp: URLSearchParams): CommunityQuery`; `matches(p: CommunityPerson, q: CommunityQuery): boolean`; `paginate(people: CommunityPerson[], page: number): { total; page; pages; rows }`; `labelOf(d: Dim, value: string): string`; `aggregate(people): { key; label; counts: { value; label; count }[] }[]`; `crossTab(people, xKey, yKey): { x: string[]; y: string[]; cells: Record<string, Record<string, number>> } | null`.

- [ ] **Step 1: Write the failing tests** (`test/community.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  DIMENSIONS, parseCommunityQuery, matches, paginate, aggregate, crossTab, labelOf, dimension, PAGE_SIZE,
  type CommunityPerson,
} from '../lib/community.ts';

const T = (d: string) => new Date(`${d}T12:00:00Z`);
const person = (over: Partial<CommunityPerson> = {}): CommunityPerson => ({
  _id: new ObjectId(), email: 'a@b.co', name: 'Pat Doe', status: 'pending',
  wants: { discord: true, newsletter: false, stickers: false, package: false },
  answers: { role: 'developer', languages: ['R', 'Python'], sports: ['NBA'] },
  location: { country: 'US', region: 'TX', city: 'Austin' },
  affiliations: [{ type: 'media', org: 'The Ringer' }],
  socials: { github: 'octocat' },
  createdAt: T('2026-09-01'), updatedAt: T('2026-09-01'), lastSubmittedAt: T('2026-09-20'),
  latestSource: 'join', identityChanged: false,
  ...over,
} as CommunityPerson);
const q = (s: string) => parseCommunityQuery(new URLSearchParams(s));

test('every closed-list question is a dimension, plus the identity and state dimensions', () => {
  const keys = DIMENSIONS.map((d) => d.key);
  for (const k of ['q.role', 'q.languages', 'q.sports', 'q.discoveredVia', 'q.wants_discord', 'affiliation', 'country', 'region', 'source', 'wants', 'discordStatus', 'identified', 'test', 'dnc']) {
    assert.ok(keys.includes(k), k);
  }
});

test('the query parser keeps only allowlisted keys and known option values', () => {
  const r = q('f.q.role=developer&f.q.role=nope&f.bogus=1&f.country=US&q=%20ringer%20&page=2&x=q.role&y=hax&from=2026-09-01&to=bad');
  assert.deepEqual(r.filters, { 'q.role': ['developer'], country: ['US'] });
  assert.equal(r.q, 'ringer');
  assert.equal(r.page, 2);
  assert.equal(r.x, 'q.role');
  assert.equal(r.y, undefined);
  assert.equal(r.from, '2026-09-01');
  assert.equal(r.to, undefined);
  assert.equal(q('page=-3').page, 1);
  assert.equal(q('page=abc').page, 1);
});

test('filters: OR within a dimension, AND across dimensions', () => {
  const p = person();
  assert.equal(matches(p, q('f.q.languages=Python&f.q.languages=JS')), true, 'multi-choice includes any');
  assert.equal(matches(p, q('f.q.languages=JS')), false);
  assert.equal(matches(p, q('f.q.role=developer&f.country=GB')), false, 'AND across');
  assert.equal(matches(p, q('f.region=US:TX')), true);
  assert.equal(matches(p, q('f.affiliation=media')), true);
  assert.equal(matches(p, q('f.wants=discord')), true);
  assert.equal(matches(p, q('f.discordStatus=pending')), true);
  assert.equal(matches(p, q('f.dnc=no')), true);
  assert.equal(matches(person({ doNotContact: { at: T('2026-09-21'), by: 'admin' } }), q('f.dnc=no')), false);
});

test('search is case-insensitive over name, email, city, organization and handles — and treats null as absent', () => {
  assert.equal(matches(person(), q('q=RINGER')), true);
  assert.equal(matches(person(), q('q=octo')), true);
  assert.equal(matches(person(), q('q=austin')), true);
  assert.equal(matches(person(), q('q=nobody')), false);
  const nulls = person({ name: null as never, socials: null as never, location: { country: 'GB', city: null } as never, affiliations: null as never });
  assert.equal(matches(nulls, q('q=null')), false, 'a null field never matches the text "null"');
  assert.equal(matches(nulls, q('q=a@b')), true);
});

test('date range filters on the latest submission day, falling back to createdAt', () => {
  assert.equal(matches(person(), q('from=2026-09-20')), true);
  assert.equal(matches(person(), q('from=2026-09-21')), false);
  assert.equal(matches(person({ lastSubmittedAt: undefined }), q('to=2026-09-01')), true);
});

test('a legacy anonymous row matches only the dimensions it has', () => {
  const legacy = person({ email: undefined, name: undefined, location: undefined, affiliations: undefined, socials: undefined,
    status: 'survey', wants: { discord: false, newsletter: false, stickers: false, package: false }, latestSource: 'survey' });
  assert.equal(matches(legacy, q('f.identified=anonymous')), true);
  assert.equal(matches(legacy, q('f.country=US')), false);
  assert.equal(matches(legacy, q('f.discordStatus=pending')), false, 'no Discord request, no Discord status');
});

test('paginate: newest submission first, 50 per page, clamps the page', () => {
  const many = Array.from({ length: 120 }, (_, i) => person({ lastSubmittedAt: new Date(Date.UTC(2026, 0, 1 + i)) }));
  const p1 = paginate(many, 1);
  assert.equal(p1.total, 120);
  assert.equal(p1.pages, 3);
  assert.equal(p1.rows.length, PAGE_SIZE);
  assert.ok(p1.rows[0].lastSubmittedAt! > p1.rows[1].lastSubmittedAt!);
  assert.equal(paginate(many, 99).page, 3);
  assert.equal(paginate([], 1).pages, 1);
});

test('aggregate counts a multi-choice answer once per option and skips people without it', () => {
  const agg = aggregate([person(), person({ answers: { role: 'student', languages: ['R'] } }), person({ answers: {} })]);
  const langs = agg.find((a) => a.key === 'q.languages')!.counts;
  assert.deepEqual(langs.map((c) => [c.value, c.count]), [['R', 2], ['Python', 1]]);
  const role = agg.find((a) => a.key === 'q.role')!.counts;
  assert.equal(role.reduce((s, c) => s + c.count, 0), 2, 'the person with no role is not counted');
  assert.equal(role.find((c) => c.value === 'developer')!.label, 'Developer / engineer');
});

test('labels: options, then regions by name, then the raw value', () => {
  assert.equal(labelOf(dimension('region')!, 'US:TX'), 'Texas');
  assert.equal(labelOf(dimension('affiliation')!, 'media'), 'Media or journalism');
  assert.equal(labelOf(dimension('country')!, 'GB'), 'GB');
});

test('crossTab counts pairs, and refuses unknown or identical dimensions', () => {
  const t = crossTab([person(), person({ answers: { role: 'student', sports: ['NBA', 'CFB'] } })], 'q.role', 'q.sports')!;
  assert.deepEqual(t.cells.developer, { NBA: 1 });
  assert.deepEqual(t.cells.student, { NBA: 1, CFB: 1 });
  assert.equal(crossTab([person()], 'q.role', 'nope'), null);
  assert.equal(crossTab([person()], 'q.role', 'q.role'), null);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && node --test --experimental-strip-types test/community.test.ts`
Expected: FAIL — `Cannot find module '../lib/community.ts'`.

- [ ] **Step 3: Write `lib/community.ts`**

```ts
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
export type CommunityPerson = PersonDoc & { latestSource: "join" | "survey"; identityChanged: boolean };

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
    options: [{ value: "join", label: "/join" }, { value: "survey", label: "/survey" }],
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

/** Option label, then a region's name, then the raw value (the client names countries with Intl.DisplayNames). */
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
```

Add to `PersonDoc` in `lib/people.ts`, right after `lastSubmittedAt?: Date;`:

```ts
  /** set by an admin when someone asks not to be contacted; excluded from every export (lib/communityData.ts) */
  doNotContact?: { at: Date; by: string };
```

- [ ] **Step 4: Run the tests and make them pass**

Run: `cd frontend && node --test --experimental-strip-types test/community.test.ts`
Expected: all PASS. If an exact label differs (e.g. the role option's label), read `content/survey.ts` and fix the TEST only where the test guessed a label the content file defines differently — say so in the report.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?
git add lib/community.ts lib/people.ts test/community.test.ts
git commit -m "feat(community): filter, page and count people by any answer, in memory"
```

---

### Task 2: Loading, history, do-not-contact, audit and CSV

**Files:**
- Create: `frontend/lib/communityData.ts`
- Test: `frontend/test/communityData.test.ts` (new)

**Interfaces:**
- Consumes: `CommunityPerson`, `DIMENSIONS`, `dimension` (Task 1); `ResponseDoc` (`lib/responses.ts`); `isReservedEmail`.
- Produces: `loadCommunity(db: Db): Promise<CommunityPerson[]>`; `type HistoryEntry = { at: Date | null; source: "join" | "survey"; identity: Record<string, unknown>; answers: Record<string, unknown>; implicit: boolean; identityChanged: boolean }`; `personHistory(db: Db, id: ObjectId): Promise<{ person: CommunityPerson; history: HistoryEntry[] } | null>`; `listRow(p: CommunityPerson)`; `exportable(p: CommunityPerson): boolean`; `csvCell(v: unknown): string`; `toCsv(people: CommunityPerson[]): string`; `setDoNotContact(db, personId: ObjectId, on: boolean, by: string, now: Date): Promise<boolean>`; `audit(db, entry: AuditEntry): Promise<void>` with `type AuditEntry = { kind: "export" | "dnc_on" | "dnc_off"; by: string; at: Date; personId?: ObjectId; params?: string; count?: number }`.

- [ ] **Step 1: Write the failing tests** (`test/communityData.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { loadCommunity, personHistory, listRow, exportable, csvCell, toCsv, setDoNotContact } from '../lib/communityData.ts';

const T = (d: string) => new Date(`${d}T12:00:00Z`);
const ID1 = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };
const ID2 = { name: 'Pat D.', location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' } };

async function seed() {
  const { db, dump } = fakeDb();
  const people = db.collection('people');
  const pat = (await people.insertOne({ email: 'pat@real.org', name: 'Pat D.', status: 'pending', wants: { discord: true, newsletter: false, stickers: false, package: false },
    answers: { role: 'developer' }, location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' },
    discord: { code: 'SECRET', expiresAt: T('2026-10-01'), invitedAt: T('2026-09-24') },
    createdAt: T('2026-09-01'), updatedAt: T('2026-09-21'), lastSubmittedAt: T('2026-09-21') })).insertedId as ObjectId;
  const legacy = (await people.insertOne({ status: 'survey', answers: { role: 'hobbyist' }, wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T('2025-01-01') })).insertedId as ObjectId;
  const test = (await people.insertOne({ email: 'walkthrough@example.com', name: 'W', status: 'pending', wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T('2026-09-22') })).insertedId as ObjectId;
  const resp = db.collection('responses');
  await resp.insertOne({ personId: pat, source: 'survey', createdAt: T('2026-09-10'), identity: ID1, answers: { role: 'student' }, profile: {} });
  await resp.insertOne({ personId: pat, source: 'join', createdAt: T('2026-09-21'), identity: ID2, answers: { role: 'developer' }, profile: {} });
  return { db, dump, pat, legacy, test };
}

test('loadCommunity: latest source and identity change from responses; legacy falls back to status', async () => {
  const { db, pat, legacy } = await seed();
  const all = await loadCommunity(db);
  const p = all.find((x) => String(x._id) === String(pat))!;
  assert.equal(p.latestSource, 'join');
  assert.equal(p.identityChanged, true);
  assert.equal('discord' in p, false, 'the invite code never leaves the database layer');
  const l = all.find((x) => String(x._id) === String(legacy))!;
  assert.equal(l.latestSource, 'survey');
  assert.equal(l.identityChanged, false);
});

test('personHistory: newest first, identity changes marked; a legacy person gets one implicit entry', async () => {
  const { db, pat, legacy } = await seed();
  const h = (await personHistory(db, pat))!;
  assert.deepEqual(h.history.map((e) => [e.source, e.implicit, e.identityChanged]), [['join', false, true], ['survey', false, false]]);
  const l = (await personHistory(db, legacy))!;
  assert.equal(l.history.length, 1);
  assert.equal(l.history[0].implicit, true);
  assert.equal(l.history[0].source, 'survey');
  assert.equal(await personHistory(db, new ObjectId()), null);
});

test('listRow carries what the table shows, and nothing it does not', async () => {
  const { db, pat } = await seed();
  const row = listRow((await loadCommunity(db)).find((x) => String(x._id) === String(pat))!) as Record<string, unknown>;
  assert.equal(row.id, String(pat));
  assert.equal(row.email, 'pat@real.org');
  assert.equal(row.identityChanged, true);
  assert.equal('answers' in row, false);
  assert.ok(!JSON.stringify(row).includes('SECRET'));
});

test('exportable: never do-not-contact, anonymous or test addresses', async () => {
  const { db } = await seed();
  const all = await loadCommunity(db);
  assert.deepEqual(all.filter(exportable).map((p) => p.email), ['pat@real.org']);
});

test('do-not-contact takes effect on the very next export, both directions are audited', async () => {
  const { db, dump, pat } = await seed();
  assert.equal(await setDoNotContact(db, pat, true, 'saiem', T('2026-09-25')), true);
  assert.equal((await loadCommunity(db)).filter(exportable).length, 0);
  assert.equal(await setDoNotContact(db, pat, false, 'saiem', T('2026-09-26')), true);
  assert.equal((await loadCommunity(db)).filter(exportable).length, 1);
  assert.deepEqual(dump('admin_audit').map((a) => a.kind), ['dnc_on', 'dnc_off']);
  assert.equal(await setDoNotContact(db, new ObjectId(), true, 'saiem', T('2026-09-25')), false);
  assert.equal(dump('admin_audit').length, 2, 'no audit entry for a person who does not exist');
});

test('csvCell neutralizes formulas and quotes separators', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('toCsv: header, exportable rows only, null fields empty', async () => {
  const { db, pat } = await seed();
  await db.collection('people').updateOne({ _id: pat }, { $set: { socials: null, affiliations: null } });
  const csv = toCsv(await loadCommunity(db));
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^name,email,country,region,city,github,bluesky,x,linkedin,website,affiliations,/);
  assert.ok(lines[1].startsWith('Pat D.,pat@real.org,US,TX,,,,,,,,'));
  assert.ok(!csv.includes('null'));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && node --test --experimental-strip-types test/communityData.test.ts`
Expected: FAIL — cannot find `lib/communityData.ts`.

- [ ] **Step 3: Write `lib/communityData.ts`**

```ts
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
```

Check against `test/fakeDb.ts` before relying on them: `find(filter, options)` may ignore `projection` (that's why `loadCommunity` also deletes `discord` — keep that line), and `findOne` may not accept options. If a fake method lacks something real MongoDB has and a test needs it, extend the fake to mirror Mongo — never bend the code to the fake.

- [ ] **Step 4: Run the tests and make them pass**

Run: `cd frontend && node --test --experimental-strip-types test/communityData.test.ts test/community.test.ts`
Expected: all PASS.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?
git add lib/communityData.ts test/communityData.test.ts
git commit -m "feat(community): load people with their history, do-not-contact, audit, and CSV"
```

---

### Task 3: The admin API and its guard test

**Files:**
- Create: `frontend/app/api/platform/admin/community/route.ts` (GET list)
- Create: `frontend/app/api/platform/admin/community/[id]/route.ts` (GET person)
- Create: `frontend/app/api/platform/admin/community/[id]/do-not-contact/route.ts` (POST)
- Create: `frontend/app/api/platform/admin/community/export/route.ts` (GET CSV)
- Test: `frontend/test/personDataReaders.test.ts` (new, source scan)

**Interfaces:**
- Consumes: `parseCommunityQuery`, `matches`, `paginate`, `aggregate`, `crossTab` (Task 1); `loadCommunity`, `personHistory`, `listRow`, `exportable`, `toCsv`, `setDoNotContact`, `audit` (Task 2); `requireAdminApp` (`@lib/platform/auth`); `connectToDatabase` (`@lib/mongodb`).
- Produces: `GET /api/platform/admin/community?<query>` → `{ total, page, pages, exportable, rows, aggregates, crossTab }`; `GET /api/platform/admin/community/[id]` → `{ person, history }`; `POST /api/platform/admin/community/[id]/do-not-contact` body `{ on: boolean }` → `{ success, message }`; `GET /api/platform/admin/community/export?<query>` → `text/csv`.

`app/api/platform/admin/[name]/` is an existing dynamic segment; the static `community/` directory resolves first. Leave `[name]`'s `NAMES` alone; confirm the build lists all four routes.

- [ ] **Step 1: Write the failing guard test** (`test/personDataReaders.test.ts`)

Model it on `test/stickerAddressReaders.test.ts` (read it first; reuse its file walk). Over every non-test `.ts`/`.tsx` under `frontend/app`, `frontend/lib`, `frontend/components`:
1. the string literal `"responses"` / `'responses'` as a collection name appears only in `lib/responses.ts` and `lib/communityData.ts` — "the response history is admin-only";
2. `lib/communityData` is imported only by files under `app/api/platform/admin/community/` — "person data leaves the database only through admin routes";
3. every `route.ts` under `app/api/platform/admin/community/` contains `requireAdminApp()` and does not mention `requireMemberApp` — "the Community browser is admin-only";
4. no file that mentions `requireMemberApp` imports `lib/communityData` or `lib/community`.

Run it now: it passes (rule 3 is vacuous while no community route exists). Its job is to stay green through Steps 2–3 and to go red under the mutations in Step 4 — that is how you know it bites.

- [ ] **Step 2: `route.ts` — the list**

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { aggregate, crossTab, matches, paginate, parseCommunityQuery } from "@lib/community";
import { exportable, listRow, loadCommunity } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };

/** Admin-only: every person, filtered by the allowlisted URL query (lib/community.ts). */
export async function GET(req: Request) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  try {
    const query = parseCommunityQuery(new URL(req.url).searchParams);
    const { db } = await connectToDatabase();
    const hits = (await loadCommunity(db)).filter((p) => matches(p, query));
    const pg = paginate(hits, query.page);
    return NextResponse.json(
      {
        total: pg.total,
        page: pg.page,
        pages: pg.pages,
        exportable: hits.filter(exportable).length,
        rows: pg.rows.map(listRow),
        aggregates: aggregate(hits),
        crossTab: query.x && query.y ? crossTab(hits, query.x, query.y) : null,
      },
      { headers: NO_STORE }
    );
  } catch {
    console.warn("community list failed");
    return NextResponse.json({ error: "Couldn't load people." }, { status: 500, headers: NO_STORE });
  }
}
```

- [ ] **Step 3: The other three routes**

`[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { personHistory } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400, headers: NO_STORE });
  try {
    const { db } = await connectToDatabase();
    const found = await personHistory(db, new ObjectId(id));
    if (!found) return NextResponse.json({ error: "No such person." }, { status: 404, headers: NO_STORE });
    return NextResponse.json(found, { headers: NO_STORE });
  } catch {
    console.warn(`community person ${id} failed`);
    return NextResponse.json({ error: "Couldn't load that person." }, { status: 500, headers: NO_STORE });
  }
}
```

`[id]/do-not-contact/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { setDoNotContact } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ on: z.boolean() });

export async function POST(req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  // the audit trail names who did it; never fabricate one
  if (!session?.login) return NextResponse.json({ success: false, message: "session has no login" }, { status: 400, headers: NO_STORE });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400, headers: NO_STORE });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, message: "bad request body" }, { status: 400, headers: NO_STORE });
  try {
    const { db } = await connectToDatabase();
    const ok = await setDoNotContact(db, new ObjectId(id), parsed.data.on, session.login, new Date());
    return NextResponse.json(
      { success: ok, message: ok ? (parsed.data.on ? "Marked do-not-contact — left out of every export." : "Contactable again.") : "No such person." },
      { status: ok ? 200 : 404, headers: NO_STORE }
    );
  } catch {
    console.warn(`do-not-contact failed for person ${id}`);
    return NextResponse.json({ success: false, message: "Couldn't update — try again." }, { status: 500, headers: NO_STORE });
  }
}
```

`export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { matches, parseCommunityQuery } from "@lib/community";
import { audit, exportable, loadCommunity, toCsv } from "@lib/communityData";

/** CSV of the filtered, exportable people. Audited before the file is returned. */
export async function GET(req: Request) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  if (!session?.login) return NextResponse.json({ error: "session has no login" }, { status: 400 });
  try {
    const sp = new URL(req.url).searchParams;
    const query = parseCommunityQuery(sp);
    const { db } = await connectToDatabase();
    const hits = (await loadCommunity(db)).filter((p) => matches(p, query));
    const now = new Date();
    await audit(db, { kind: "export", by: session.login, at: now, params: sp.toString(), count: hits.filter(exportable).length });
    return new Response(toCsv(hits), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sdv-community-${now.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.warn("community export failed");
    return NextResponse.json({ error: "Couldn't build the export." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Gates, mutations, commit**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && timeout 600 npm run build; echo EXIT=$?` — the route table must list `/api/platform/admin/community`, `/api/platform/admin/community/[id]`, `/api/platform/admin/community/[id]/do-not-contact`, `/api/platform/admin/community/export`.
Mutations, each red then restored: (a) replace `requireAdminApp` with `requireMemberApp` in the list route → rule 3; (b) `import { loadCommunity } from "@lib/communityData"` in `app/api/platform/people/route.ts` → rules 2 and 4; (c) a `db.collection("responses")` line in `lib/population.ts` → rule 1.

```bash
git add "app/api/platform/admin/community" test/personDataReaders.test.ts
git commit -m "feat(community): admin-only API for the Community browser, guarded by a source scan"
```

---

### Task 4: The Community tab and the person page

**Files:**
- Create: `frontend/app/(platform)/platform/admin/community/page.tsx`
- Create: `frontend/app/(platform)/platform/admin/community/CommunityClient.tsx`
- Create: `frontend/app/(platform)/platform/admin/community/[id]/page.tsx`
- Create: `frontend/app/(platform)/platform/admin/community/[id]/PersonClient.tsx`
- Modify: `frontend/app/(platform)/platform/admin/AdminTabs.tsx` (add the tab)

**Interfaces:**
- Consumes: the four API routes (Task 3); `useAdmin` from `../AdminOverviewClient` (`useAdmin<T>(name, params)` fetches `/api/platform/admin/${name}${params}` with SWR); `DIMENSIONS`, `labelOf`, `dimension` (`@lib/community`); `AFFILIATION_LABELS`, `socialLinks` (`@lib/identity`).

UI; verified by the build, by reading, and by a hand-recorded clip (the page is behind admin auth, so the PR-evidence workflow cannot reach it). Copy the page/client split, loading/empty/error states and card styling of `app/(platform)/platform/admin/stickers/` and `keys/` (read both first). Country names come from `new Intl.DisplayNames(["en"], { type: "region" })`.

- [ ] **Step 1: The tab** — in `AdminTabs.tsx` add `{ href: "/platform/admin/community", label: "Community" },` after Stickers.

- [ ] **Step 2: `community/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import CommunityClient from "./CommunityClient";

export const metadata: Metadata = { title: "Community" };

// useSearchParams in the client needs a Suspense boundary
export default function PlatformAdminCommunityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <CommunityClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: `CommunityClient.tsx`** — the URL is the state: every control writes the URL with `router.replace`, and the list reads it.

Required behavior (build it with the stickers/keys styling):
- **Filters** (left column on desktop, a collapsible `<details>` on mobile): one `<details>` per dimension in `DIMENSIONS` order. A dimension with `options` lists checkboxes for each option (checked = its value is in `f.<key>`). A dimension without options (country, region, packages) lists the values present in the current `aggregates` for that key, labelled with `labelOf` (countries through `Intl.DisplayNames`), each with its count. Toggling a checkbox adds or removes `f.<key>=<value>` and resets `page`.
- **Search**: one input bound to `q`, applied on submit (Enter), not on each keystroke.
- **Date range**: two `<input type="date">` bound to `from` / `to`.
- **List**: a table with name (links to `/platform/admin/community/<id>`), email, top affiliation (`AFFILIATION_LABELS[type] · org`), role label, country/region, source, last submitted (local date), and badges: "Do not contact", "Anonymous", "Test address", "Identity changed". Show `total` people · page `page` of `pages`, with Previous/Next buttons writing `page`.
- **Aggregates**: a collapsible panel listing, per dimension, its counts (label — count). Above it, two `<select>`s choosing `x` and `y` from `DIMENSIONS`; when both are set, render `crossTab` as a table (rows `x`, columns `y`, blank cells for zero).
- **Export**: a button "Export <exportable> to CSV". On click, `confirm(\`Export ${exportable} people to CSV? People marked do-not-contact, anonymous rows and test addresses are left out.\`)`, then `window.location.href = "/api/platform/admin/community/export?" + <current query string without page, x, y>`. Disabled while `exportable === 0`.
- **States**: loading, error ("Couldn't load people."), and empty ("No one matches these filters.").
- Fetch with `useAdmin<ListResponse>("community", "?" + searchParams.toString())`.

- [ ] **Step 4: `[id]/page.tsx` and `PersonClient.tsx`**

`[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import PersonClient from "./PersonClient";

export const metadata: Metadata = { title: "Person" };

export default async function PlatformAdminCommunityPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonClient id={id} />;
}
```

`PersonClient.tsx` required behavior: fetch `useAdmin<{ person; history }>(\`community/${id}\`)`. Show a back link to `/platform/admin/community` (keeping no filters), then: name, email, location (country via `Intl.DisplayNames`, region, city), socials as links from `socialLinks` (`target="_blank" rel="noopener noreferrer nofollow"`), affiliations (`AFFILIATION_LABELS[type] · org — title`), what they asked for and their Discord status, and a **Do not contact** toggle: a button reading "Mark do-not-contact" or "Clear do-not-contact"; on click, `confirm(...)`, POST `{ on }` to `/api/platform/admin/community/${id}/do-not-contact`, show the returned `message` in an always-mounted `role="status"` region, then `mutate()`. Below, **Submissions**, newest first: date (or "before history was kept" for an implicit entry), source, a "identity changed" marker when set, the identity fields, and the answers as label → value(s) using the question labels from `content/survey.ts` via `@content/survey`'s `QUESTIONS`. All values render as text (never HTML).

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && timeout 600 npm run build; echo EXIT=$?
ps aux | grep "[n]ext build"   # nothing
git add "app/(platform)/platform/admin/community" "app/(platform)/platform/admin/AdminTabs.tsx"
git commit -m "feat(community): the admin Community tab and person page"
```

---

### Task 5: Docs, privacy page, and two PR 1 follow-ups

**Files:**
- Modify: `frontend/static_pages/privacy-policy.mdx`
- Modify: `frontend/SETUP-community.md`
- Modify: `CLAUDE.md`
- Modify: `frontend/lib/joinSchema.ts` (`surveyBodySchema.identity` optional), `frontend/lib/join.ts` (`handleSurvey` names the missing identity) + `frontend/test/join.test.ts`

**Document the merged code, not this plan.** Read Tasks 1–4 as merged.

- [ ] **Step 1: `/survey` without an identity says what is missing (PR 1 minor M3).** Today a body with no `identity` gets zod's bare "Required". Mirror `/join`: make `surveyBodySchema.identity` `identitySchema.optional()`, and in `handleSurvey`, right after `validateAnswers` succeeds and before the affiliation check, `if (!parsed.data.identity) return { status: 400, body: { success: false, message: "Add your name and where you're based." } };` — then use the narrowed identity below. Test first in `test/join.test.ts`: `handleSurvey({ email: 's@b.co', answers: S_ANSWERS }, …)` → 400 with exactly that message, and `people` and `responses` empty; the existing "requires an email and identity" test stays green.

- [ ] **Step 2: Privacy page.**
  - "Survey and join": replace "Everything you submit is stored in our database, which SportsDataverse's maintainers can access directly to run the site." with a true description of PR 2: SportsDataverse admins can look through what people submit, one person at a time, and export contact lists for outreach; anyone who has asked us not to contact them is left out of every export, and every export is recorded.
  - "Discord" paragraph: "Your survey answers are never shown there person by person; they are combined into totals that organization members can see." — still true for members; make clear it describes the member review tool, not the admin browser.
  - Newsletter paragraph: it lists "packages you use" among what Resend receives, but `contactProperties` (`lib/survey.ts:81`) sends role, languages, sports, how you found us and how you'd like to hear from us — no packages. Remove "and packages" there.
  Every sentence must trace to code; list the file:line for each in your report.

- [ ] **Step 3: `SETUP-community.md`** — a "## Community browser (admins)" section: where it is, admin-only and why, the filters and search, aggregates and cross-tabs (admin-only; never on Population), the person page and its history (implicit entry for legacy people), do-not-contact (how to honor a "stop contacting me" email: find the person by email, mark do-not-contact), export (what it excludes, that it is audited in `admin_audit`).

- [ ] **Step 4: `CLAUDE.md`** — add the four `/api/platform/admin/community/**` routes and `/platform/admin/community` to the Community bullet; extend the "Identity visibility" bullet: person data is read for display only through `lib/communityData.ts`, from admin routes (`test/personDataReaders.test.ts` checks it); exports skip do-not-contact, anonymous and test rows and are audited.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?
git add lib/joinSchema.ts lib/join.ts test/join.test.ts static_pages/privacy-policy.mdx SETUP-community.md ../CLAUDE.md
git commit -m "docs(community): the admin browser, do-not-contact and exports, and a clearer /survey refusal"
```
