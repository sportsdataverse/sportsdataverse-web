# Community join flow — PR 1: newsletter on Resend + `people` collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working newsletter signup in the site footer that stores every subscriber in a new Mongo `people` collection first and then syncs them to Resend Contacts, replacing two dead integrations (Mailchimp, a Substack form hack), plus Plausible click events on the existing follow/support links.

**Architecture:** Pure logic lives in `frontend/lib/` with the DB handle and `fetch` injected, so it runs under `node --test` with no framework; `app/api/join/route.ts` is a thin wiring layer over `handleJoin()`. The `people` collection is the list of record; Resend is only the sender — Contacts for the list, Broadcasts for issues — chosen because it injects no badge or ad at any tier (best-effort sync, person saved regardless). Click tracking is `next-plausible`'s `usePlausible()` in one tiny client wrapper around `<a>`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4 + shadcn/ui (`Input`, `Button`), zod 3.25, mongodb driver 6.x, `next-plausible` 3.12, Node 22 `node --test` with type stripping.

**Spec:** `docs/superpowers/specs/2026-09-18-community-join-flow-design.md` (sections: Data model → `people`; Flows → Newsletter; Follow and fund; Pages and routes → `POST /api/join`; Errors; Delivery order → PR 1).

## Global Constraints

- All node commands run from `frontend/` (`npm`, `legacy-peer-deps` is in `.npmrc` — never remove it).
- Path aliases (`@lib`, `@components`, `@content`) resolve only inside Next/tsc. Files under test and their tests import each other by **relative path**; never import `@lib/mongodb` from a `lib/` file (it throws at import without env).
- `people` is the list of record: a signup is saved before any Resend call; Resend failure never fails the request (spec → Errors).
- Every UI change is verified in the 4-combination matrix (desktop/mobile × light/dark) and has a walkthrough steps module (repo `CLAUDE.md` → PR evidence). Evidence routes for this PR: `/ /about`; `Walkthrough steps: scripts/walkthroughs/newsletter.mjs`.
- Design adherence: reuse existing tokens/classes (`eyebrow`, `border-border`, `bg-card`, `text-muted-foreground`, `text-primary`) and shadcn `Input`/`Button`; no new colours or fonts. Sentence case; plain, specific copy (`PRODUCT.md` → Voice).
- Conventional Commits; **no AI co-author trailers** anywhere. Stage explicit paths.
- Sponsors and Patreon links are **on hold** (no listing/slug yet): `content/support.ts` is not edited in this PR.
- Env: `RESEND_API_KEY` (server-only; the same key later sends transactional mail). Removed: `MAILCHIMP_API_KEY`, `MAILCHIMP_API_SERVER`, `MAILCHIMP_AUDIENCE_ID`, `NEXT_PUBLIC_NEWSLETTER_URL`.
- Rate limit on `POST /api/join`: 5 per IP per hour, counted in Mongo `rate_limits` with a TTL index (in-process counters don't survive Vercel's per-request isolation).
- Reserved email domains (`example.com/org/net`, `.test`, `.invalid`, `localhost`) are stored but never sent to Resend — so the CI walkthrough can submit the form without polluting the list.

## File structure

| File | Responsibility |
|---|---|
| `frontend/lib/joinSchema.ts` (new) | zod schema for the join body + `isReservedEmail()` |
| `frontend/lib/newsletter.ts` (rewrite) | Resend Contacts client: `subscribeToResend(email, deps)` |
| `frontend/lib/rateLimit.ts` (new) | `allowRequest(db, key, opts)` on `rate_limits` + TTL index |
| `frontend/lib/people.ts` (new) | `people` collection: indexes, `upsertNewsletterSignup`, `markNewsletterSynced`, `markNewsletterSkipped` |
| `frontend/lib/join.ts` (new) | `handleJoin(rawBody, ip, deps)` — the whole request as pure logic |
| `frontend/app/api/join/route.ts` (new) | wires `handleJoin` to Next: DB handle, IP header, JSON response |
| `frontend/test/fakeDb.ts` (new) | in-memory stand-in for the four driver calls the libs use |
| `frontend/test/*.test.ts` (new) | `node --test` suites, one per lib file |
| `frontend/components/site/NewsletterSignup.tsx` (new) | client form → `POST /api/join` |
| `frontend/components/site/TrackedLink.tsx` (new) | `<a>` that fires a Plausible event on click |
| `frontend/components/site/SiteFooter.tsx` (modify) | mount the form; use `TrackedLink` for Community/Support links |
| `frontend/components/site/SupportCallout.tsx` (modify) | use `TrackedLink` |
| `frontend/scripts/walkthroughs/newsletter.mjs` (new) | evidence flow: fill + submit the footer form |
| `frontend/app/api/mailchimp/route.ts`, `frontend/app/api/newsletter/route.ts` (delete) | dead integrations |
| `frontend/package.json`, `frontend/.env.example`, `CLAUDE.md`, `frontend/SETUP-community.md` (new) | deps, env, docs |

---

### Task 1: Test runner + join schema

**Files:**
- Create: `frontend/lib/joinSchema.ts`
- Create: `frontend/test/joinSchema.test.ts`
- Modify: `frontend/package.json` (scripts)

**Interfaces:**
- Produces: `joinSchema: ZodObject` parsing `{ email: string; wants?: { newsletter: boolean }; placement?: "footer" | "about" | "join" }` into `JoinInput = { email: string; wants: { newsletter: boolean }; placement?: ... }` (email trimmed + lowercased); `isReservedEmail(email: string): boolean`.

- [ ] **Step 1: Add the test script**

In `frontend/package.json` `scripts`, after `"test:scripts"`:

```json
    "test:lib": "node --test --experimental-strip-types test/*.test.ts",
```

- [ ] **Step 2: Write the failing test**

`frontend/test/joinSchema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinSchema, isReservedEmail } from '../lib/joinSchema.ts';

test('normalizes the email and defaults wants.newsletter to true', () => {
  const r = joinSchema.safeParse({ email: '  Alice@Example.ORG ' });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, { email: 'alice@example.org', wants: { newsletter: true } });
});

test('rejects a non-email and an unknown placement', () => {
  assert.equal(joinSchema.safeParse({ email: 'not-an-email' }).success, false);
  assert.equal(joinSchema.safeParse({ email: 'a@b.co', placement: 'sidebar' }).success, false);
  assert.equal(joinSchema.safeParse({ email: 'a@b.co', placement: 'footer' }).success, true);
});

test('reserved domains are recognised, real ones are not', () => {
  for (const e of ['x@example.com', 'x@sub.example.org', 'x@foo.test', 'x@bar.invalid', 'x@localhost']) {
    assert.equal(isReservedEmail(e), true, e);
  }
  for (const e of ['x@gmail.com', 'x@example.co.uk', 'x@sportsdataverse.org']) {
    assert.equal(isReservedEmail(e), false, e);
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/joinSchema.ts'`

- [ ] **Step 4: Implement the schema**

`frontend/lib/joinSchema.ts`:

```ts
import { z } from "zod";

/**
 * Body of `POST /api/join`. PR 1 accepts the newsletter-only shape; later PRs
 * widen it from `content/survey.ts`. Unknown keys are stripped (zod default).
 */
export const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  wants: z.object({ newsletter: z.boolean() }).default({ newsletter: true }),
  // where the form lived; a person keeps the first one they signed up from
  placement: z.enum(["footer", "about", "join"]).optional(),
});

export type JoinInput = z.infer<typeof joinSchema>;

// RFC 2606 / 6761 reserved names: stored like any signup, never sent to Resend,
// so CI walkthroughs can submit the form without touching the real list.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/i;

export function isReservedEmail(email: string): boolean {
  return RESERVED_DOMAIN.test(email.split("@")[1] ?? "");
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/joinSchema.ts frontend/test/joinSchema.test.ts frontend/package.json
git commit -m "feat(join): request schema + reserved-domain check, node --test runner for lib"
```

---

### Task 2: Resend Contacts client (replaces the Substack hack in `lib/newsletter.ts`)

**Files:**
- Rewrite: `frontend/lib/newsletter.ts` (currently posts to a Substack `/api/v1/free` endpoint — delete all of it)
- Create: `frontend/test/newsletter.test.ts`

**Interfaces:**
- Produces: `subscribeToResend(email: string, deps: { apiKey: string | undefined; fetchImpl?: typeof fetch }): Promise<{ contactId: string }>` — creates the contact (`POST /contacts`), or on a 409 looks it up (`GET /contacts/{email}`); throws `Error` when the key is missing, a response is non-2xx (other than the 409 path), or no `id` comes back.

- [ ] **Step 1: Write the failing test**

`frontend/test/newsletter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToResend } from '../lib/newsletter.ts';

type Reply = { status: number; body: unknown };
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('creates the contact with a bearer key and returns its id', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { object: 'contact', id: 'c-479e' } }]);
  const r = await subscribeToResend('a@b.co', { apiKey: 're_test', fetchImpl });
  assert.deepEqual(r, { contactId: 'c-479e' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/contacts');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { email: 'a@b.co', unsubscribed: false });
});

test('an existing contact (409) is looked up by email instead', async () => {
  const { fetchImpl, calls } = fakeFetch([
    { status: 409, body: { name: 'conflict', message: 'Contact already exists' } },
    { status: 200, body: { object: 'contact', id: 'c-old', email: 'a@b.co' } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 're_test', fetchImpl });
  assert.deepEqual(r, { contactId: 'c-old' });
  assert.equal(calls[1].url, 'https://api.resend.com/contacts/a%40b.co');
  assert.equal(calls[1].init.method, 'GET');
});

test('throws on a missing key, a non-2xx, and a body without an id', async () => {
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: undefined }), /RESEND_API_KEY/);
  const unauth = fakeFetch([{ status: 401, body: { message: 'API key is invalid' } }]);
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: unauth.fetchImpl }), /Resend 401/);
  const empty = fakeFetch([{ status: 200, body: {} }]);
  await assert.rejects(subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: empty.fetchImpl }), /no contact id/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `subscribeToResend` is not exported (the file still exports `subscribeNewsletter`)

- [ ] **Step 3: Rewrite the client**

Replace the entire contents of `frontend/lib/newsletter.ts`:

```ts
/**
 * Resend Contacts client — the newsletter SENDER. The list of record is the
 * Mongo `people` collection (lib/people.ts); this only mirrors an email into
 * Resend so Broadcasts can reach it. Resend puts no badge in the mail at any
 * tier, which is why it was picked. Docs:
 * https://resend.com/docs/api-reference/contacts/create-contact
 */
const RESEND = "https://api.resend.com";

export type ResendDeps = {
  apiKey: string | undefined; // process.env.RESEND_API_KEY (server-only)
  fetchImpl?: typeof fetch; // injected in tests
};

async function call(deps: ResendDeps, path: string, init: RequestInit): Promise<Response> {
  return (deps.fetchImpl ?? fetch)(`${RESEND}${path}`, {
    ...init,
    headers: { "content-type": "application/json", Authorization: `Bearer ${deps.apiKey}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
}

async function idFrom(res: Response): Promise<string> {
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) throw new Error("Resend response had no contact id");
  return body.id;
}

export async function subscribeToResend(
  email: string,
  deps: ResendDeps
): Promise<{ contactId: string }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const created = await call(deps, "/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  if (created.ok) return { contactId: await idFrom(created) };
  if (created.status === 409) {
    // already a contact: fetch it so the person record can hold the id
    const existing = await call(deps, `/contacts/${encodeURIComponent(email)}`, { method: "GET" });
    if (!existing.ok) throw new Error(`Resend ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
    return { contactId: await idFrom(existing) };
  }
  throw new Error(`Resend ${created.status}: ${(await created.text()).slice(0, 200)}`);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/newsletter.ts frontend/test/newsletter.test.ts
git commit -m "feat(newsletter): Resend Contacts client replaces the Substack form hack"
```

---

### Task 3: In-memory fake DB + rate limiter

**Files:**
- Create: `frontend/test/fakeDb.ts`
- Create: `frontend/lib/rateLimit.ts`
- Create: `frontend/test/rateLimit.test.ts`

**Interfaces:**
- Produces: `fakeDb(): { db: Db-like; dump(name: string): Record<string, unknown>[] }` supporting `collection(name).createIndex()`, `.findOneAndUpdate(filter, update, { upsert, returnDocument, includeResultMetadata })`, `.updateOne(filter, { $set })`, `.findOne(filter)`. Filters are plain equality on top-level keys.
- Produces: `allowRequest(db, key: string, opts: { limit: number; windowSec: number; now?: () => Date }): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }>`; `ensureRateLimitIndex(db): Promise<void>`.

- [ ] **Step 1: Write the fake**

`frontend/test/fakeDb.ts`:

```ts
// The four driver calls lib/ uses, over plain arrays. Filters are equality on
// top-level keys; updates support $set, $setOnInsert, $inc with dotted paths.
type Doc = Record<string, unknown>;

function setPath(doc: Doc, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Doc = doc;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Doc;
  }
  cur[parts[parts.length - 1]] = value;
}

function matches(doc: Doc, filter: Doc) {
  return Object.entries(filter).every(([k, v]) => String(doc[k]) === String(v));
}

function apply(doc: Doc, update: Doc, inserting: boolean) {
  for (const [k, v] of Object.entries((update.$set as Doc) ?? {})) setPath(doc, k, v);
  if (inserting) for (const [k, v] of Object.entries((update.$setOnInsert as Doc) ?? {})) setPath(doc, k, v);
  for (const [k, v] of Object.entries((update.$inc as Doc) ?? {})) {
    setPath(doc, k, (Number(doc[k] ?? 0) + Number(v)));
  }
}

let nextId = 1;

export function fakeDb() {
  const store = new Map<string, Doc[]>();
  const rows = (name: string) => store.get(name) ?? store.set(name, []).get(name)!;
  const db = {
    collection(name: string) {
      return {
        async createIndex() { return `${name}_idx`; },
        async findOne(filter: Doc) { return rows(name).find((d) => matches(d, filter)) ?? null; },
        async updateOne(filter: Doc, update: Doc) {
          const d = rows(name).find((r) => matches(r, filter));
          if (d) apply(d, update, false);
          return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 };
        },
        async findOneAndUpdate(filter: Doc, update: Doc, opts: Doc = {}) {
          let d = rows(name).find((r) => matches(r, filter));
          let upserted = false;
          if (!d && opts.upsert) {
            d = { _id: filter._id ?? `id-${nextId++}`, ...filter };
            apply(d, update, true);
            rows(name).push(d);
            upserted = true;
          } else if (d) {
            apply(d, update, false);
          }
          if (opts.includeResultMetadata) {
            return { value: d ?? null, ok: 1, lastErrorObject: { updatedExisting: !!d && !upserted, upserted: upserted ? d!._id : undefined } };
          }
          return d ?? null;
        },
      };
    },
  };
  return { db: db as unknown as import('mongodb').Db, dump: (name: string) => rows(name) };
}
```

- [ ] **Step 2: Write the failing rate-limit test**

`frontend/test/rateLimit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { allowRequest } from '../lib/rateLimit.ts';

test('allows `limit` hits per window, then refuses with a retry-after, then resets', async () => {
  const { db } = fakeDb();
  let t = Date.UTC(2026, 8, 19, 12, 0, 30); // 12:00:30Z
  const now = () => new Date(t);
  const opts = { limit: 2, windowSec: 3600, now };
  const a = await allowRequest(db, 'join:1.2.3.4', opts);
  const b = await allowRequest(db, 'join:1.2.3.4', opts);
  const c = await allowRequest(db, 'join:1.2.3.4', opts);
  assert.deepEqual([a.allowed, b.allowed, c.allowed], [true, true, false]);
  assert.deepEqual([a.remaining, b.remaining, c.remaining], [1, 0, 0]);
  assert.equal(c.retryAfterSec, 3600 - 30); // to the top of the hour
  // another key is independent
  assert.equal((await allowRequest(db, 'join:5.6.7.8', opts)).allowed, true);
  // next window
  t += 3600 * 1000;
  assert.equal((await allowRequest(db, 'join:1.2.3.4', opts)).allowed, true);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/rateLimit.ts'`

- [ ] **Step 4: Implement the limiter**

`frontend/lib/rateLimit.ts`:

```ts
import type { Db } from "mongodb";

/**
 * Fixed-window counter in Mongo (`rate_limits`), keyed `<key>:<window>`.
 * Mongo rather than memory because each Vercel invocation is its own process.
 * A TTL index on `expiresAt` deletes finished windows.
 */
export type RateLimitOpts = { limit: number; windowSec: number; now?: () => Date };

type Bucket = { _id: string; hits: number; expiresAt: Date };

export async function ensureRateLimitIndex(db: Db): Promise<void> {
  await db.collection<Bucket>("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export async function allowRequest(
  db: Db,
  key: string,
  opts: RateLimitOpts
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const now = (opts.now ?? (() => new Date()))();
  const windowMs = opts.windowSec * 1000;
  const bucket = Math.floor(now.getTime() / windowMs);
  const expiresAt = new Date((bucket + 1) * windowMs);
  const doc = await db.collection<Bucket>("rate_limits").findOneAndUpdate(
    { _id: `${key}:${bucket}` },
    { $inc: { hits: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: "after" }
  );
  const hits = doc?.hits ?? 1;
  return {
    allowed: hits <= opts.limit,
    remaining: Math.max(opts.limit - hits, 0),
    retryAfterSec: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 7`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add frontend/test/fakeDb.ts frontend/lib/rateLimit.ts frontend/test/rateLimit.test.ts
git commit -m "feat(join): Mongo fixed-window rate limiter + in-memory fake db for lib tests"
```

---

### Task 4: `people` collection

**Files:**
- Create: `frontend/lib/people.ts`
- Create: `frontend/test/people.test.ts`

**Interfaces:**
- Consumes: `fakeDb()` from Task 3.
- Produces: `PersonDoc` type; `ensurePeopleIndexes(db)`; `upsertNewsletterSignup(db, { email, ip?, placement? }, now?): Promise<{ personId: PersonId; created: boolean }>`; `markNewsletterSynced(db, personId, resendContactId: string, now?)`; `markNewsletterSkipped(db, personId, reason: string)`. `PersonId = PersonDoc["_id"]`.

- [ ] **Step 1: Write the failing test**

`frontend/test/people.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertNewsletterSignup, markNewsletterSynced, markNewsletterSkipped } from '../lib/people.ts';

const T0 = new Date('2026-09-19T12:00:00Z');
const T1 = new Date('2026-09-19T13:00:00Z');

test('first signup inserts a pending person wanting only the newsletter', async () => {
  const { db, dump } = fakeDb();
  const r = await upsertNewsletterSignup(db, { email: 'a@b.co', ip: '1.2.3.4', placement: 'footer' }, T0);
  assert.equal(r.created, true);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false });
  assert.deepEqual(p.signup, { placement: 'footer' });
  assert.equal(p.ip, '1.2.3.4');
  assert.equal(p.createdAt, T0);
});

test('a second signup with the same email updates, never duplicates', async () => {
  const { db, dump } = fakeDb();
  await upsertNewsletterSignup(db, { email: 'a@b.co', placement: 'footer' }, T0);
  const r = await upsertNewsletterSignup(db, { email: 'a@b.co', placement: 'about' }, T1);
  assert.equal(r.created, false);
  assert.equal(dump('people').length, 1);
  const [p] = dump('people');
  assert.equal(p.createdAt, T0);
  assert.equal(p.updatedAt, T1);
  assert.deepEqual(p.signup, { placement: 'footer' }); // first placement wins
});

test('sync bookkeeping', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertNewsletterSignup(db, { email: 'a@b.co' }, T0);
  await markNewsletterSynced(db, personId, 'c-479e', T1);
  assert.deepEqual(dump('people')[0].newsletter, { resendContactId: 'c-479e', syncedAt: T1 });
  await markNewsletterSkipped(db, personId, 'reserved-domain');
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/people.ts'`

- [ ] **Step 3: Implement**

`frontend/lib/people.ts`:

```ts
import type { Db, ObjectId } from "mongodb";

/**
 * The `people` collection: one doc per applicant / subscriber / respondent —
 * the list of record for every audience the site collects. Spec:
 * docs/superpowers/specs/2026-09-18-community-join-flow-design.md → Data model.
 * PR 1 writes only the newsletter shape; later PRs add profile/answers/discord.
 */
export type PersonDoc = {
  _id: ObjectId;
  email?: string;
  githubLogin?: string;
  name?: string;
  wants: { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };
  // pending = not yet reviewed (the Discord queue filters on wants.discord too)
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  signup?: { placement: string };
  newsletter?: { resendContactId: string; syncedAt: Date } | { skipped: string };
  createdAt: Date;
  updatedAt: Date;
  ip?: string; // abuse handling only; see the privacy page
};

export type PersonId = PersonDoc["_id"];

const people = (db: Db) => db.collection<PersonDoc>("people");

export async function ensurePeopleIndexes(db: Db): Promise<void> {
  const c = people(db);
  await c.createIndex({ email: 1 }, { unique: true, sparse: true });
  await c.createIndex({ githubLogin: 1 }, { unique: true, sparse: true });
  await c.createIndex({ status: 1, createdAt: -1 });
}

export async function upsertNewsletterSignup(
  db: Db,
  input: { email: string; ip?: string; placement?: string },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: { "wants.newsletter": true, updatedAt: now, ...(input.ip ? { ip: input.ip } : {}) },
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
        "wants.discord": false,
        "wants.stickers": false,
        "wants.package": false,
        ...(input.placement ? { "signup.placement": input.placement } : {}),
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
  if (!res.value) throw new Error("people upsert returned no document");
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted) };
}

export async function markNewsletterSynced(
  db: Db,
  personId: PersonId,
  resendContactId: string,
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { resendContactId, syncedAt: now } } });
}

export async function markNewsletterSkipped(db: Db, personId: PersonId, reason: string): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { skipped: reason } } });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 10`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/people.ts frontend/test/people.test.ts
git commit -m "feat(people): list-of-record collection with newsletter upsert + sync bookkeeping"
```

---

### Task 5: `handleJoin` + the route; delete the dead integrations

**Files:**
- Create: `frontend/lib/join.ts`
- Create: `frontend/test/join.test.ts`
- Create: `frontend/app/api/join/route.ts`
- Delete: `frontend/app/api/mailchimp/route.ts`, `frontend/app/api/newsletter/route.ts`
- Modify: `frontend/package.json` (deps), `frontend/.env.example`

**Interfaces:**
- Consumes: `joinSchema`, `isReservedEmail` (Task 1); `subscribeToResend` (Task 2); `allowRequest`, `ensureRateLimitIndex` (Task 3); `upsertNewsletterSignup`, `markNewsletterSynced`, `markNewsletterSkipped`, `ensurePeopleIndexes` (Task 4).
- Produces: `handleJoin(rawBody: unknown, ip: string, deps: JoinDeps): Promise<{ status: 200 | 400 | 429; body: { success: boolean; message: string } }>` with `JoinDeps = { db: Db; resendApiKey: string | undefined; fetchImpl?: typeof fetch; now?: () => Date; log?: (msg: string) => void }`. Route: `POST /api/join` returning that body/status.

- [ ] **Step 1: Write the failing test**

`frontend/test/join.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { handleJoin } from '../lib/join.ts';

function resend(status: number, body: unknown) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}
const okResend = () => resend(200, { object: 'contact', id: 'c-479e' });

test('400 on an invalid body, nothing stored', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'nope' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  assert.equal(r.status, 400);
  assert.equal(r.body.success, false);
  assert.equal(dump('people').length, 0);
});

test('200: person saved, Resend called, sync recorded', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'A@B.co', placement: 'footer' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 1);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-479e');
});

test('Resend failure still returns 200 and keeps the person unsynced', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: resend(500, {}).fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1);
  assert.equal(dump('people')[0].newsletter, undefined);
  assert.match(logs[0], /resend sync failed/);
});

test('a reserved-domain email is stored but never sent to Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'walkthrough@example.com' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});

test('429 after five signups from one address in an hour', async () => {
  const { db } = fakeDb();
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl };
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleJoin({ email: `u${i}@b.co` }, '9.9.9.9', deps)).status, 200);
  }
  const sixth = await handleJoin({ email: 'u6@b.co' }, '9.9.9.9', deps);
  assert.equal(sixth.status, 429);
  assert.equal((await handleJoin({ email: 'u7@b.co' }, '8.8.8.8', deps)).status, 200);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/join.ts'`

- [ ] **Step 3: Implement the handler**

`frontend/lib/join.ts`:

```ts
import type { Db } from "mongodb";
import { isReservedEmail, joinSchema } from "./joinSchema";
import { subscribeToResend } from "./newsletter";
import { allowRequest } from "./rateLimit";
import { markNewsletterSkipped, markNewsletterSynced, upsertNewsletterSignup } from "./people";

/**
 * `POST /api/join` as pure logic: validate → rate-limit by IP → save the person
 * → best-effort Resend sync. The person is saved BEFORE Resend is called and a
 * Resend failure never fails the request (spec → Errors): the list of record is ours.
 */
export type JoinDeps = {
  db: Db;
  resendApiKey: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type JoinResult = { status: 200 | 400 | 429; body: { success: boolean; message: string } };

const JOIN_LIMIT = { limit: 5, windowSec: 3600 };

export async function handleJoin(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = joinSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" } };
  }
  const rl = await allowRequest(deps.db, `join:${ip}`, { ...JOIN_LIMIT, now: deps.now });
  if (!rl.allowed) {
    const mins = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
    return { status: 429, body: { success: false, message: `Too many sign-ups from this address. Try again in ${mins} min.` } };
  }

  const { email, placement } = parsed.data;
  const now = (deps.now ?? (() => new Date()))();
  const { personId } = await upsertNewsletterSignup(deps.db, { email, ip, placement }, now);

  if (isReservedEmail(email)) {
    await markNewsletterSkipped(deps.db, personId, "reserved-domain");
  } else {
    try {
      const { contactId } = await subscribeToResend(email, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
      await markNewsletterSynced(deps.db, personId, contactId, now);
    } catch (e) {
      // best-effort: the person is saved; an admin "retry sync" lands in PR 2
      deps.log?.(`resend sync failed for person ${String(personId)}: ${(e as Error).message}`);
    }
  }
  return { status: 200, body: { success: true, message: "You're on the list." } };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 15`, `# fail 0`

- [ ] **Step 5: Wire the route**

`frontend/app/api/join/route.ts`:

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleJoin } from "@lib/join";
import { ensurePeopleIndexes } from "@lib/people";
import { ensureRateLimitIndex } from "@lib/rateLimit";

// Public write endpoint: no auth, rate-limited per IP inside handleJoin.
// Indexes are ensured once per process (idempotent on the server).
let indexesReady: Promise<void> | null = null;

export async function POST(req: Request) {
  const { db } = await connectToDatabase();
  indexesReady ??= Promise.all([ensurePeopleIndexes(db), ensureRateLimitIndex(db)]).then(() => undefined);
  await indexesReady;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const raw = await req.json().catch(() => ({}));
  const result = await handleJoin(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    log: (m) => console.warn(m),
  });
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 6: Delete the dead integrations and their deps**

```bash
cd frontend
git rm -q app/api/mailchimp/route.ts app/api/newsletter/route.ts
npm uninstall @mailchimp/mailchimp_marketing @types/mailchimp__mailchimp_marketing md5 @types/md5
```

In `frontend/.env.example`, replace the four lines

```
# Mailchimp for Newsletter
MAILCHIMP_API_KEY=
MAILCHIMP_API_SERVER=
MAILCHIMP_AUDIENCE_ID=
```

and the line `NEXT_PUBLIC_NEWSLETTER_URL=` with:

```
# Resend API key — newsletter contacts + (later) transactional mail. The list of
# record is Mongo `people`. Server-only: never NEXT_PUBLIC_. resend.com → API Keys.
RESEND_API_KEY=
```

- [ ] **Step 7: Type-check and lint**

Run: `cd frontend && npm run tsc && npm run lint && npm run test:lib`
Expected: all clean; `# pass 15`. (If `tsc` complains that `test/*.ts` imports end in `.ts`: add `"allowImportingTsExtensions": true` is NOT available with `noEmit: false` — instead confirm `tsconfig.json` has `"noEmit": true` under `compilerOptions`, which Next's config does, then the `.ts` specifiers compile.)

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/join.ts frontend/test/join.test.ts frontend/app/api/join/route.ts frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat(join): POST /api/join stores the person then syncs Resend; remove Mailchimp and Substack routes"
```

---

### Task 6: Footer signup form + walkthrough flow

**Files:**
- Create: `frontend/components/site/NewsletterSignup.tsx`
- Modify: `frontend/components/site/SiteFooter.tsx` (first column, after the blurb)
- Create: `frontend/scripts/walkthroughs/newsletter.mjs`

**Interfaces:**
- Consumes: `POST /api/join` body `{ email, wants: { newsletter: true }, placement }` → `{ success, message }` (Task 5).
- Produces: `<NewsletterSignup placement="footer" | "about" />` client component.

- [ ] **Step 1: Write the component**

`frontend/components/site/NewsletterSignup.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";

type Phase = "idle" | "sending" | "done" | "error";

/**
 * Newsletter signup → POST /api/join. Native email validation; the server
 * stores the person first and syncs Resend second (lib/join.ts).
 */
export default function NewsletterSignup({ placement }: { placement: "footer" | "about" }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email");
    setPhase("sending");
    setMessage("");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, wants: { newsletter: true }, placement }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setPhase(res.ok ? "done" : "error");
      setMessage(body.message ?? (res.ok ? "You're on the list." : "Something went wrong."));
      if (res.ok) form.reset();
    } catch {
      setPhase("error");
      setMessage("Network error. Try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6" aria-label="Newsletter sign-up">
      <label htmlFor={`newsletter-email-${placement}`} className="eyebrow">
        Newsletter
      </label>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        New data, methods posts, and package releases. No spam.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          id={`newsletter-email-${placement}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={phase === "sending"}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={phase === "sending"}>
          {phase === "sending" ? "Sending…" : "Subscribe"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-4 text-xs ${phase === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {message}
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Mount it in the footer**

In `frontend/components/site/SiteFooter.tsx`, add the import at the top:

```tsx
import NewsletterSignup from "@components/site/NewsletterSignup";
```

and inside the first `<div>` of the grid, after the `<p className="mt-3 max-w-xs …">…</p>` blurb:

```tsx
          <NewsletterSignup placement="footer" />
```

Also change the grid classes on the wrapper so the first column has room for the form: `sm:grid-cols-2 md:grid-cols-5` → `sm:grid-cols-2 md:grid-cols-6`, and give the first `<div>` `className="md:col-span-2"`.

- [ ] **Step 3: Run the site and check the form works against a local DB**

Run: `cd frontend && npm run dev` (needs `.env.local` with `MONGODB_URI`, `DB_NAME`; `RESEND_API_KEY` may be blank — the sync then logs and the person is still stored).
In a second shell:

```bash
curl -s -X POST http://localhost:3000/api/join -H 'content-type: application/json' \
  -d '{"email":"walkthrough@example.com","wants":{"newsletter":true},"placement":"footer"}'
```
Expected: `{"success":true,"message":"You're on the list."}` and a `people` doc with `newsletter: { skipped: "reserved-domain" }`.

- [ ] **Step 4: Write the walkthrough flow**

`frontend/scripts/walkthroughs/newsletter.mjs`:

```js
// Footer newsletter signup: scroll to it, submit a reserved-domain address (stored,
// never sent to Resend), and wait for the confirmation line.
export default async (page, base) => {
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Newsletter sign-up' });
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await form.getByRole('textbox').fill('walkthrough@example.com');
  await page.waitForTimeout(500);
  await form.getByRole('button', { name: 'Subscribe' }).click();
  await form.getByRole('status').filter({ hasText: 'on the list' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
};
```

- [ ] **Step 5: Visual matrix + walkthrough locally**

Run (against the dev server or a deployed preview):

```bash
cd frontend
BASE=http://localhost:3000 npm run visual-check -- / /about
BASE=http://localhost:3000 npm run walkthrough -- --steps scripts/walkthroughs/newsletter.mjs
```
Expected: 8 screenshots (the footer form visible and readable in all four combinations, the mobile layout not overflowing), 2 clips (desktop + mobile) ending on "You're on the list." Open `img/visual/home-mobile-dark.png` and confirm the input and button sit on one line with no horizontal scroll.

- [ ] **Step 6: Lint, type-check, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/components/site/NewsletterSignup.tsx frontend/components/site/SiteFooter.tsx frontend/scripts/walkthroughs/newsletter.mjs
git commit -m "feat(site): newsletter signup in the footer, backed by /api/join"
```

---

### Task 7: Click tracking on follow/support links

**Files:**
- Create: `frontend/components/site/TrackedLink.tsx`
- Modify: `frontend/components/site/SiteFooter.tsx` (Community + Support groups, and the bottom "Donate")
- Modify: `frontend/components/site/SupportCallout.tsx`

**Interfaces:**
- Produces: `<TrackedLink event="follow_click" | "support_click" platform="github" placement="footer" href=… >` — an external `<a target="_blank" rel="noopener noreferrer">` that fires the Plausible event on click. Events and props appear in Plausible once goals `follow_click` and `support_click` are created there (Task 8 documents it).

- [ ] **Step 1: Write the wrapper**

`frontend/components/site/TrackedLink.tsx`:

```tsx
"use client";

import { usePlausible } from "next-plausible";
import type { ComponentProps } from "react";

type Props = ComponentProps<"a"> & {
  event: "follow_click" | "support_click";
  platform: string;
  placement: string;
};

/** External link that reports { platform, placement } to Plausible on click. */
export default function TrackedLink({ event, platform, placement, children, ...rest }: Props) {
  const plausible = usePlausible();
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
      onClick={() => plausible(event, { props: { platform, placement } })}
    >
      {children}
    </a>
  );
}
```

- [ ] **Step 2: Use it in the footer**

In `frontend/components/site/SiteFooter.tsx`:

1. Import: `import TrackedLink from "@components/site/TrackedLink";`
2. Extend the link type and the two groups:

```tsx
const GROUPS: {
  title: string;
  links: { href: string; label: string; external?: boolean; track?: { event: "follow_click" | "support_click"; platform: string } }[];
}[] = [
```
Community links become:
```tsx
      { href: "https://github.com/sportsdataverse", label: "GitHub", external: true, track: { event: "follow_click", platform: "github" } },
      { href: "https://bsky.app/profile/sportsdataverse.org", label: "Bluesky — @sportsdataverse.org", external: true, track: { event: "follow_click", platform: "bluesky" } },
      { href: "https://twitter.com/sportsdataverse", label: "Twitter / X", external: true, track: { event: "follow_click", platform: "twitter" } },
```
Support links become:
```tsx
      { href: KOFI_URL, label: "Donate — Ko-fi", external: true, track: { event: "support_click", platform: "kofi" } },
      { href: PAYPAL_URL, label: "PayPal", external: true, track: { event: "support_click", platform: "paypal" } },
      { href: DO_REFERRAL_URL, label: "DigitalOcean credit", external: true, track: { event: "support_click", platform: "digitalocean" } },
```
3. In the render, replace the `l.external ? (<a …>…</a>)` branch with:

```tsx
                  {l.external ? (
                    l.track ? (
                      <TrackedLink
                        href={l.href}
                        event={l.track.event}
                        platform={l.track.platform}
                        placement="footer"
                        className="text-sm text-foreground/80 transition-colors hover:text-primary"
                      >
                        {l.label}
                      </TrackedLink>
                    ) : (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground/80 transition-colors hover:text-primary"
                      >
                        {l.label}
                      </a>
                    )
                  ) : (
```
4. The bottom-bar `Donate` `<a href={KOFI_URL} …>` becomes:

```tsx
        <TrackedLink href={KOFI_URL} event="support_click" platform="kofi" placement="footer-bar" className="transition-colors hover:text-primary">
          Donate
        </TrackedLink>
```

- [ ] **Step 3: Use it in the support callout**

In `frontend/components/site/SupportCallout.tsx`, import `TrackedLink` and replace the `<a key={name} href={url} target="_blank" rel="noopener noreferrer" className={…}>` with:

```tsx
          <TrackedLink
            key={name}
            href={url}
            event="support_click"
            platform={name.toLowerCase().replace(/[^a-z]+/g, "-")}
            placement="callout"
            className={
              i === 0
                ? "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                : "inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {name}
          </TrackedLink>
```

- [ ] **Step 4: Verify the event fires**

Run `npm run dev`, open `http://localhost:3000`, DevTools → Network, click "GitHub" in the footer (it opens a new tab). Expected: a request to `plausible.io/api/event` (or the proxied path) whose body has `"n":"follow_click"` and `"p":"{\"platform\":\"github\",\"placement\":\"footer\"}"`. On `localhost` Plausible logs "Ignoring Event: localhost" in the console instead of sending — that message is the pass signal locally.

- [ ] **Step 5: Lint, type-check, visual check, commit**

Run: `cd frontend && npm run tsc && npm run lint && BASE=http://localhost:3000 npm run visual-check -- / /about`
Expected: clean; the footer and About callout render identically to before (this task changes behaviour, not layout).

```bash
git add frontend/components/site/TrackedLink.tsx frontend/components/site/SiteFooter.tsx frontend/components/site/SupportCallout.tsx
git commit -m "feat(site): Plausible follow_click / support_click events on footer and callout links"
```

---

### Task 8: Docs + PR

**Files:**
- Create: `frontend/SETUP-community.md`
- Modify: `CLAUDE.md` (Backends bullet; the `.env.local` bullet)

- [ ] **Step 1: Write the setup doc**

`frontend/SETUP-community.md`:

```md
# Community features — setup

What an operator does once so the site's people-facing features work. Code
side: `lib/join.ts`, `lib/people.ts`, `lib/newsletter.ts`, `lib/rateLimit.ts`.

## Newsletter (Resend)

Why Resend: no badge or ad in the mail at any tier, and the same key sends the
transactional mail later PRs add.

1. resend.com → Domains → verify `sportsdataverse.org` (DKIM + SPF records in DNS)
   so Broadcasts send from `news@sportsdataverse.org`.
2. resend.com → API Keys → create a key with **full access** (contacts need write).
3. Set `RESEND_API_KEY` locally (`.env.local`) and on Vercel (Production + Preview).
4. Every subscriber is stored in Mongo `people` first, then created as a Resend
   Contact (`POST /contacts`; an existing contact is looked up instead). If Resend is
   down the person is still stored with no `newsletter.syncedAt`; the admin
   "retry sync" arrives with the People tab (PR 2).
5. Reserved test domains (`example.com`, `.test`, …) are stored with
   `newsletter.skipped = "reserved-domain"` and never sent to Resend — that is what
   the CI walkthrough submits.

Sending an issue: resend.com → Broadcasts → New → pick the segment (all contacts
for now; profile-based segments arrive with PR 2), write, send. Resend has no
RSS-to-email; the weekly feed→broadcast job is the release-digest cron in the spec
(later, separate).

## Click tracking (Plausible)

Footer and callout links fire `follow_click` / `support_click` with
`{ platform, placement }`. In Plausible → Site settings → Goals, add both as
custom events so they show up in the dashboard with their props.

## Rate limiting

`POST /api/join` allows 5 sign-ups per IP per hour, counted in the Mongo
`rate_limits` collection (TTL index on `expiresAt`, created on first request).
Nothing to configure.
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md` → Architecture → Backends bullet, change

```
- **Backends:** Supabase (`views` table + `views_sum()` RPC — page-view counter;
  schema in `frontend/supabase/schema.sql`) and **MongoDB** (`MONGODB_URI` + `DB_NAME` —
  packages/projects, NOT Supabase).
```
to
```
- **Backends:** Supabase (`views` table + `views_sum()` RPC — page-view counter;
  schema in `frontend/supabase/schema.sql`) and **MongoDB** (`MONGODB_URI` + `DB_NAME` —
  packages/projects/people/rate_limits, NOT Supabase). Newsletter sender is **Resend**
  (`RESEND_API_KEY`, `lib/newsletter.ts`); the subscriber list of record is Mongo `people`.
  Analytics is **Plausible** (`next-plausible`), not GA.
```
and in the `.env.local` line replace `Mailchimp` with `Resend`.

Under Commands, after `npm run tsc`, add:

```sh
npm run test:lib       # node --test over test/*.test.ts (lib/ logic, no DB needed)
```

- [ ] **Step 3: Full gate**

Run: `cd frontend && npm run lint && npm run tsc && npm run test:lib && npm run test:scripts && npm run build`
Expected: all green; `build` succeeds with `RESEND_API_KEY` unset (it is read at request time only).

- [ ] **Step 4: Commit and open the PR**

```bash
git add frontend/SETUP-community.md CLAUDE.md
git commit -m "docs(community): Resend + Plausible setup; CLAUDE.md backends reflect Resend and people"
git push -u origin feat/join-pr1-newsletter
```

PR description (from the template): summary of the four things (footer signup → `people` → Resend; Mailchimp + Substack removed; click events; rate limit), checks run, and:

```
Evidence routes: / /about
Walkthrough steps: scripts/walkthroughs/newsletter.mjs
```

The evidence comment must show the footer form in all four screenshots and link a `flow-newsletter` clip ending on "You're on the list."

---

## Self-review

- **Spec coverage (PR 1 scope):** newsletter → Resend (T2, T5; sender changed from Kit to Resend on 2026-09-19 — no badge at any tier); delete Mailchimp/Substack + env (T5); `people` list of record with indexes and the newsletter fields (T4); `POST /api/join` minimal shape + IP rate limit via Mongo TTL (T3, T5); footer signup posting to `/api/join` (T6); follow/support click events by placement (T7); `SETUP-community.md` Resend config (T8). Deferred by decision: Sponsors/Patreon links (on hold), FollowUs on thank-you pages and emails (PR 2), Resend segments/properties by profile (PR 2), feed→broadcast cron (release-digest job, later).
- **Placeholders:** none; every step has its code or exact command.
- **Type consistency:** `handleJoin` deps/return match T5 test; `upsertNewsletterSignup` signature `(db, {email, ip?, placement?}, now?)` used identically in T4 test and T5; `fakeDb().findOneAndUpdate` honours `includeResultMetadata` (T4) and plain return (T3); `TrackedLink` props identical in T7 footer and callout.
