# PR 4 — Sticker requests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor ask for stickers through `/join`, hold their postal address only until the stickers ship, and give an admin one place to see what to mail and mark it done.

**Architecture:** Addresses live in their own `sticker_requests` collection and never on the person record. Marking a request shipped removes the address in the same update that records the shipment, so no code path can ship without erasing. The address is readable only through an admin-role endpoint under `/platform/admin`, whose layout already gates the whole tree on the org `admin` role — deliberately NOT on `/platform/people`, which every org member can read since PR #51.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4 + shadcn/ui, MongoDB (`sticker_requests`, `people`), zod, Resend, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-18-community-join-flow-design.md` (delivery order item 4; the `sticker_requests` model; the Stickers flow; Privacy)

**Sequencing:** PR 3 merged as #52 (`166f592`); this branch starts there. Both PRs edit `content/survey.ts`, `lib/joinSchema.ts`, `lib/join.ts`, `lib/people.ts`, `QuestionFlow.tsx`, `test/join.test.ts` and `test/fakeDb.ts`; built in parallel they conflict everywhere. This plan assumes PR 3's `wants_package`, `pkg`, the `$set`/`$setOnInsert` conflict check in `fakeDb`, and `PUBLIC_PACKAGE_FILTER` are already on `main`.

## Global Constraints

- **Conventional Commits. Never add an AI co-author trailer or a "Generated with" footer to any commit** — absolute rule in this repo, overriding any tooling default.
- Stage explicit paths; never `git add -A`. Branch + PR; never push `main`.
- Import siblings in `lib/` with the `.ts` extension.
- **Nothing imported into `test/*.ts` may transitively import `next-auth`.**
- **Load-bearing invariant from PR #48:** `people` is written BEFORE any outbound call; an outbound failure never fails the visitor's request.
- **A postal address never appears in:** a `people` document, a log line, an email body, the member-readable `/platform/people` tab or its API, the Population aggregates, or any error message. It is read in exactly one place — the admin sticker list — and only while the request's `status` is `"requested"`.
- Gate before any task is DONE: `npm run test:lib` green and above the previous count; `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` exits 0 (read the exit code). A gate not run is not DONE.
- A test earns its place only if it fails when the line it covers is deleted or inverted. Each task names its mutations; run them and report red-then-green.
- **The email typed into `/join` is unverified.** Anything keyed on the person it resolves to must never let a later request rewrite that person's data — PR 3's final review found exactly this for package submissions. Sticker requests are therefore FIRST-REQUEST-WINS (Task 1).
- **Every `/join` reply must be identical whatever is stored** — a differing sentence is a membership oracle, and `test/join.test.ts` pins it. The sticker note must not differ between a new request and an existing one.
- **Reserved test addresses** (`example.com`, `.test`, …; `isReservedEmail`) never create a sticker request, exactly as PR 3 made them never create a package — so the PR-evidence walkthrough can fill the address fields without leaving a fake request in production.
- Test tooling from PR 3: `db.failNextWriteTo(collection, err)` arms the next write of any kind on one collection; the fake throws Mongo's path-conflict error on overlapping update paths. The unit tests run in CI (`.github/workflows/unit-tests.yml`) and `lib` is a required check on `main`. Baseline: **172 passing, 0 failing.**
- Run every gate in the FOREGROUND; report the exit code of a finished process; leave no `next build` running.

## Deviations from the spec, decided up front

- **Where the Stickers tab lives.** The spec lists "Queue · Population · Stickers" as tabs of `/platform/people`. Since PR #51 that page is readable by every org member, and a postal address is the most sensitive thing this site will ever hold. The Stickers tab goes to **`/platform/admin/stickers`**, inside the admin layout, with its API at `/api/platform/admin/stickers` — which is also the path the spec's routes table gives it. The admin layout is a structural gate: nothing under that tree renders for a non-admin.
- **`region` and `postal` are optional; `country` is required.** The spec's type lists them as required, but many countries have no postal code or no region, and a required field there turns a real address into a rejected form. `line1`, `city` and `country` stay required.
- **The "got it" email does not repeat the address.** It confirms the request and says how to change it. The typed email address is not verified (the same missing primitive noted on PR #50), so echoing a postal address to it would send one person's address to whatever inbox was typed.
- **The Shop link is deferred.** There is no shop yet. When one exists, it is one entry in `content/support.ts`.
- **First request wins.** The spec imagines a second request updating the first. Because the `/join` email is unverified, that would let anyone who types a stranger's email redirect the stranger's parcel. A second request while one is open changes nothing; a person who moved replies to the confirmation email, or an admin cancels the request and they ask again. A partial unique index enforces one open request per person — PR 3 measured, on real MongoDB, that an upsert without one duplicates under concurrency (28 of 30 trials).
- **`removePerson` must now also remove that person's sticker requests** — see Task 3. The spec's "people deletion on request" predates `sticker_requests`; without this, honouring a deletion request would leave the address behind.

## Review Focus

1. **A deletion request that leaves a postal address behind.** Deleting a person must delete their sticker requests first, and must not delete the person if that fails. Owned by Task 3.
2. **An address surviving a shipment.** Marking shipped must `$unset` the address in the same update that sets `status: "shipped"` — not in a second write that can fail independently. Owned by Task 1.
3. **An address reaching a member.** No member-readable endpoint or page may carry an address, including the People queue row and the Population aggregates. Owned by Task 4, re-checked in Task 5's review.
4. **A second request for the same person while one is open.** It must change nothing — not the address, not the name — and must not queue a second parcel, even under concurrent submission. A stranger who types someone's email must not be able to redirect their stickers. Owned by Task 1.
5. **An international address.** A real address with no postal code or no region must be accepted. Owned by Task 1.

---

### Task 1: `lib/stickers.ts` — the request lifecycle

**Files:**
- Create: `frontend/lib/stickers.ts`
- Create: `frontend/test/stickers.test.ts`

**Interfaces:**
- Produces: `addressSchema` (zod); `stickerRequestSchema` = `{ name, address }`; `type StickerRequestInput`; `type StickerRequestDoc`; `upsertStickerRequest(db: Db, personId: ObjectId, input: StickerRequestInput, now: Date): Promise<{ created: boolean; id?: ObjectId }>`; `ensureStickerIndexes(db: Db): Promise<void>`; `listOpenStickerRequests(db: Db): Promise<StickerRequestDoc[]>`; `countShipped(db: Db): Promise<number>`; `shipStickerRequest(db: Db, id: ObjectId, shippedBy: string, now: Date): Promise<boolean>`; `cancelStickerRequest(db: Db, id: ObjectId): Promise<boolean>`; `deleteStickerRequestsForPerson(db: Db, personId: ObjectId): Promise<number>`.

- [ ] **Step 1: Write the failing test** (`frontend/test/stickers.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import {
  stickerRequestSchema, upsertStickerRequest, listOpenStickerRequests, countShipped,
  shipStickerRequest, cancelStickerRequest, deleteStickerRequestsForPerson,
} from '../lib/stickers.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const US = { name: 'Pat Doe', address: { line1: '1 Main St', city: 'Durham', region: 'NC', postal: '27701', country: 'US' } };

test('shipping erases the address in the same write that records the shipment', async () => {
  const { db, dump } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  assert.equal(await shipStickerRequest(db, id, 'saiemgilani', T0), true);
  const doc = dump('sticker_requests')[0];
  assert.equal(doc.status, 'shipped');
  assert.equal(doc.shippedBy, 'saiemgilani');
  assert.equal('address' in doc, false, 'no address survives a shipment');
  assert.equal(doc.name, 'Pat Doe', 'the name stays, for the record of what was sent');
});

test('shipping is recorded as one update, so there is no window with shipped-plus-address', async () => {
  const { db, dump } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  db.failNextWriteTo('sticker_requests', new Error('mongo down'));
  await assert.rejects(shipStickerRequest(db, id, 'saiemgilani', T0));
  const doc = dump('sticker_requests')[0];
  assert.equal(doc.status, 'requested', 'a failed ship leaves it requested');
  assert.ok(doc.address, 'and the address is still there to ship to');
});

test('shipping twice is a no-op, not an error', async () => {
  const { db } = fakeDb();
  const id = (await upsertStickerRequest(db, new ObjectId(), US, T0)).id!;
  assert.equal(await shipStickerRequest(db, id, 'a', T0), true);
  assert.equal(await shipStickerRequest(db, id, 'b', T0), false);
});

test('a second request while one is open changes nothing: the first address wins', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const first = await upsertStickerRequest(db, person, US, T0);
  const second = await upsertStickerRequest(db, person, { name: 'Someone Else', address: { ...US.address, line1: '9 Attacker Rd' } }, T0);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  const open = await listOpenStickerRequests(db);
  assert.equal(open.length, 1);
  assert.equal(open[0].address!.line1, '1 Main St', 'a stranger typing this email cannot redirect the parcel');
  assert.equal(open[0].name, 'Pat Doe');
  assert.equal(dump('sticker_requests').length, 1);
});

test('a person whose stickers already shipped can ask again', async () => {
  const { db } = fakeDb();
  const person = new ObjectId();
  const first = (await upsertStickerRequest(db, person, US, T0)).id!;
  await shipStickerRequest(db, first, 'a', T0);
  await upsertStickerRequest(db, person, US, T0);
  assert.equal((await listOpenStickerRequests(db)).length, 1);
  assert.equal(await countShipped(db), 1);
});

test('an address with no postal code or region is accepted; one with no country is not', () => {
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { line1: '1 Queen St', city: 'Hong Kong', country: 'HK' } }).success, true);
  assert.equal(stickerRequestSchema.safeParse({ name: 'A', address: { line1: '1 Queen St', city: 'X' } }).success, false);
  assert.equal(stickerRequestSchema.safeParse({ name: '', address: US.address }).success, false);
});

test('cancelling and deleting-for-person remove the address outright', async () => {
  const { db, dump } = fakeDb();
  const a = new ObjectId();
  const id = (await upsertStickerRequest(db, a, US, T0)).id!;
  assert.equal(await cancelStickerRequest(db, id), true);
  assert.equal(dump('sticker_requests').length, 0);
  await upsertStickerRequest(db, a, US, T0);
  assert.equal(await deleteStickerRequestsForPerson(db, a), 1);
  assert.equal(dump('sticker_requests').length, 0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/stickers.ts'`.

- [ ] **Step 3: Write `frontend/lib/stickers.ts`**

```ts
import type { Db, ObjectId } from "mongodb";
import { z } from "zod";

const line = (max: number) => z.string().trim().min(1).max(max);
const optLine = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(max).optional());

/** region and postal are optional: many countries have neither, and a required
 *  field turns a real address into a rejected form. */
export const addressSchema = z.object({
  line1: line(120),
  line2: optLine(120),
  city: line(80),
  region: optLine(80),
  postal: optLine(20),
  country: line(56),
});

export const stickerRequestSchema = z.object({ name: line(80), address: addressSchema });
export type StickerRequestInput = z.infer<typeof stickerRequestSchema>;

export type StickerRequestDoc = {
  _id: ObjectId;
  personId: ObjectId;
  name: string;
  /** present only while status is "requested" — shipping and cancelling remove it */
  address?: z.infer<typeof addressSchema>;
  status: "requested" | "shipped";
  createdAt: Date;
  updatedAt: Date;
  shippedAt?: Date;
  shippedBy?: string;
};

const col = (db: Db) => db.collection<StickerRequestDoc>("sticker_requests");

/**
 * One open request per person, and the FIRST one wins. The person comes from an
 * unverified email typed into /join, so letting a later request update the open
 * one would let anyone who types a stranger's email redirect the stranger's
 * parcel. Everything is written only on insert; a match changes nothing. A
 * shipped request is history, so someone whose stickers went out can ask again.
 * Someone who moved replies to the confirmation email, or an admin cancels the
 * request and they ask again.
 */
export async function upsertStickerRequest(
  db: Db,
  personId: ObjectId,
  input: StickerRequestInput,
  now: Date
): Promise<{ created: boolean; id?: ObjectId }> {
  const res = await col(db).updateOne(
    { personId, status: "requested" },
    { $setOnInsert: { personId, name: input.name, address: input.address, status: "requested", createdAt: now, updatedAt: now } },
    { upsert: true }
  );
  return res.upsertedId ? { created: true, id: res.upsertedId as ObjectId } : { created: false };
}

/**
 * At most one OPEN request per person. The upsert above keys on it, but an
 * upsert is not unique without an index — PR 3 measured duplicates in 28 of 30
 * trials of concurrent upserts on real MongoDB without one. Partial on status
 * "requested", so shipped history does not collide.
 *
 * The key is { personId, status } — EXACTLY the upsert's query fields — on
 * purpose: the server only retries a losing upsert as a no-op update when the
 * query's fields match the unique index's fields; keyed on personId alone, 98
 * of 4,500 concurrent upserts on MongoDB 7 threw E11000 instead of being retried.
 */
export async function ensureStickerIndexes(db: Db): Promise<void> {
  await col(db).createIndex(
    { personId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "requested" } }
  );
}

/** The ONLY read that returns addresses. Its one caller is the admin-gated
 *  sticker route; do not add another. */
export async function listOpenStickerRequests(db: Db): Promise<StickerRequestDoc[]> {
  return col(db).find({ status: "requested" }).sort({ createdAt: 1 }).toArray();
}

export async function countShipped(db: Db): Promise<number> {
  return col(db).countDocuments({ status: "shipped" });
}

/** Records the shipment and erases the address in ONE update, so there is never
 *  a moment where a request is shipped and still holding an address. Matching on
 *  status "requested" makes a second click a no-op. */
export async function shipStickerRequest(db: Db, id: ObjectId, shippedBy: string, now: Date): Promise<boolean> {
  const res = await col(db).updateOne(
    { _id: id, status: "requested" },
    { $set: { status: "shipped", shippedAt: now, shippedBy, updatedAt: now }, $unset: { address: "" } }
  );
  return res.modifiedCount === 1;
}

/** Spam, a duplicate, or a change of heart: drop the request and its address. */
export async function cancelStickerRequest(db: Db, id: ObjectId): Promise<boolean> {
  return (await col(db).deleteOne({ _id: id, status: "requested" })).deletedCount === 1;
}

/** Every request a person made, shipped or not — used when they ask to be deleted. */
export async function deleteStickerRequestsForPerson(db: Db, personId: ObjectId): Promise<number> {
  return (await col(db).deleteMany({ personId })).deletedCount;
}
```

- [ ] **Step 4: Extend `fakeDb` if needed**

These functions use `updateOne` with `upsert` and `upsertedId`, `updateOne` with `$unset` and `modifiedCount`, `deleteOne`/`deleteMany` with `deletedCount`, `countDocuments`, and `createIndex`. PR 3 already added `updateOne` upsert (copying only the filter's equality fields into a new document, as Mongo does), `upsertedId`, `deleteMany`, `$ne`, and `failNextWriteTo(collection, err)`. Add only what is still missing — likely `countDocuments` and a no-op `createIndex` — keeping existing behaviour. The fake does not enforce unique indexes, so the concurrency guarantee of `ensureStickerIndexes` is not provable here; say so in your report rather than writing a test that pretends to.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npm run test:lib`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

(a) Delete `$unset: { address: "" }` from `shipStickerRequest` → the first test must go red. (b) Change the ship filter to `{ _id: id }` → the third test must go red. (c) Change the upsert filter to `{ personId }` (dropping `status: "requested"`) → the fifth test must go red. (d) Make `postal` required → the sixth test must go red. Restore each, confirm green, report all four.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/stickers.ts frontend/test/stickers.test.ts frontend/test/fakeDb.ts
git commit -m "feat(stickers): a request lifecycle that erases the address when it ships"
```

---

### Task 2: The join request carries a sticker request

**Files:**
- Modify: `frontend/content/survey.ts`
- Modify: `frontend/lib/joinSchema.ts`
- Modify: `frontend/lib/people.ts` (`upsertJoin`'s `wants`)
- Modify: `frontend/lib/join.ts` (`handleJoin`)
- Modify: `frontend/lib/email.ts` (append `stickerRequestEmail`)
- Modify: `frontend/test/join.test.ts` (append)

**Interfaces:**
- Consumes: `stickerRequestSchema`, `upsertStickerRequest` (Task 1); `sendEmail` (existing).
- Produces: question id `wants_stickers`; `joinBodySchema.sticker = stickerRequestSchema.optional()`; `upsertJoin`'s `input.wants` gains `stickers: boolean`; `stickerRequestEmail(): { subject; html; text }`.

**The same trap PR 3 hit.** `upsertJoin` still writes `"wants.stickers": false` in `$setOnInsert`. Move it to `$set` **and delete it from `$setOnInsert`**. PR 3 made `fakeDb` throw on a path in both operators, exactly as MongoDB does, so leaving it in both now fails the tests — which is the point.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/join.test.ts`)

```ts
const STICKER = { name: 'Pat Doe', address: { line1: '1 Main St', city: 'Durham', region: 'NC', postal: '27701', country: 'US' } };

test('a sticker request is stored apart from the person, never on it', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  const person = dump('people')[0];
  assert.equal(person.wants.stickers, true);
  assert.equal(JSON.stringify(person).includes('1 Main St'), false, 'no address on the person record');
  const req = dump('sticker_requests')[0];
  assert.equal(String(req.personId), String(person._id));
  assert.equal(req.address.line1, '1 Main St');
});

test('the sticker flag and payload must agree', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', answers: { ...D_ANSWERS, wants_stickers: 'no' }, sticker: STICKER } as never, '1.1.1.1', deps);
  assert.equal(dump('sticker_requests').length, 0, 'an address with the flag off is never stored');
  const r = await handleJoin({ email: 'c@b.co', answers: { ...D_ANSWERS, wants_stickers: 'yes' } } as never, '2.2.2.2', deps);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /address|sticker/i);
});

test('the got-it email never carries the address, and no log line does either', async () => {
  const { db } = fakeDb();
  const sent: string[] = [];
  const logs: string[] = [];
  const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
    sent.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  }) as typeof fetch;
  await handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1',
    { db, resendApiKey: 'k', resendFrom: 'SDV <n@sportsdataverse.org>', tokenSecret: 's', fetchImpl, viewer: null, log: (m) => logs.push(m) }
  );
  for (const blob of [...sent, ...logs]) {
    assert.equal(blob.includes('1 Main St'), false);
    assert.equal(blob.includes('27701'), false);
  }
});

test('no sticker request is stored when the person could not be written', async () => {
  const { db, dump } = fakeDb();
  db.failNextWriteTo('people', new Error('mongo down'));
  await assert.rejects(handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  ));
  assert.equal(dump('sticker_requests').length, 0);
});
```

Add `wants_stickers: 'no'` to **every** `handleJoin` payload that carries the wants section — `D_ANSWERS` and the `FULL`- and `ANSWERS`-based calls PR 3 already updated for `wants_package` — so the existing tests keep validating once the question is required.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL on all four.

- [ ] **Step 3: Add the question** (`frontend/content/survey.ts`, in `QUESTIONS`, directly after `wants_package`)

```ts
  { id: "wants_stickers", section: "wants", type: "single", label: "Would you like some SportsDataverse stickers in the mail?", required: true,
    options: [{ value: "yes", label: "Yes please" }, { value: "no", label: "No thanks" }] },
```

- [ ] **Step 4: Accept the payload** (`frontend/lib/joinSchema.ts`)

Import `stickerRequestSchema` from `./stickers.ts` and add, inside `joinBodySchema`:

```ts
  /** Present only when answers.wants_stickers === "yes". Stored in
   *  sticker_requests, never on the person — see lib/stickers.ts. */
  sticker: stickerRequestSchema.optional(),
```

- [ ] **Step 5: Record `wants.stickers`** (`frontend/lib/people.ts`, `upsertJoin`)

Widen `input.wants` to include `stickers?: boolean` — optional, for the same reason PR 3 made `package` optional (18 direct test callers pass a narrower `wants`, and `tsc` checks `test/`). Add `"wants.stickers": input.wants.stickers ?? false,` to `$set` and **delete** `"wants.stickers": false,` from `$setOnInsert`.

- [ ] **Step 6: The email** (append to `frontend/lib/email.ts`)

```ts
/** Confirms a sticker request. Deliberately does NOT repeat the address: the
 *  typed email is not verified, so echoing it would send one person's postal
 *  address to whatever inbox was typed. */
export function stickerRequestEmail(): { subject: string; html: string; text: string } {
  const body = "Got it — your sticker request is in. We mail them in batches, so it may be a few weeks. If your address changes before they ship, reply to this email and we'll update it.";
  return {
    subject: "Your SportsDataverse sticker request",
    html: `<p>${body}</p>\n<p>— SportsDataverse</p>`,
    text: `${body}\n\n— SportsDataverse`,
  };
}
```

- [ ] **Step 7: Wire it through `handleJoin`** (`frontend/lib/join.ts`)

Add `stickers: answers.wants_stickers === "yes"` to the `wants` derivation and `stickers: false` to its initialiser. Beside PR 3's package flag check, **before** the rate limit:

```ts
  if (wants.stickers && !parsed.data.sticker) {
    return { status: 400, body: { success: false, message: "Add a mailing address for the stickers, or answer no to the sticker question." } };
  }
```

After the `upsertJoin` call and PR 3's package block — a local write, after `people`, before any email:

```ts
  // Reserved test addresses record the answers but never a sticker request, as
  // they never create a package — so the PR-evidence walkthrough leaves nothing.
  // The note is the same whether this request was created or one was already
  // open: a differing sentence would say whether this email has a request.
  let stickerNote = "";
  let stickerCreated = false;
  if (wants.stickers && parsed.data.sticker && !isReservedEmail(email)) {
    try {
      stickerCreated = (await upsertStickerRequest(deps.db, personId, parsed.data.sticker, now)).created;
      stickerNote = "Stickers are on the list.";
    } catch {
      deps.log?.(`sticker request write failed for person ${String(personId)}`);
      stickerNote = "We couldn't record the sticker request — try again in a bit.";
    }
  }
```

After `beginOptIn` and the Discord step, send the confirmation only if a sender is configured and THIS request created the open one — a repeat submission must not mail the address a second time — best-effort, never failing the request, never logging the address or the response body:

```ts
  if (stickerCreated && deps.resendFrom) {
    try {
      await sendEmail({ from: deps.resendFrom, to: email, ...stickerRequestEmail() }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    } catch {
      deps.log?.(`sticker confirmation email failed for person ${String(personId)}`);
    }
  }
  if (stickerNote) parts.push(stickerNote);
```

Import `upsertStickerRequest` from `./stickers.ts` and `stickerRequestEmail` from `./email.ts`; `isReservedEmail` is already imported from `./joinSchema.ts`.

Add `ensureStickerIndexes(db)` to the once-per-process index block in `frontend/app/api/join/route.ts`, beside `ensurePeopleIndexes`, `ensureRateLimitIndex` and `ensurePackageIndexes`.

Add these tests to `test/join.test.ts`:
- a reserved-domain address (`walkthrough@example.com`) with `wants_stickers: 'yes'` and a valid `sticker` stores the person with `wants.stickers: true` and creates NO `sticker_requests` document;
- the same (non-reserved) email submitting twice, the second time with a different address: one request, holding the FIRST address; both replies are byte-identical; with `resendFrom` set, exactly one `/emails` call is made across the two submissions.

- [ ] **Step 8: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 9: Mutation-check**

(a) Put `"wants.stickers": false` back in `$setOnInsert` → a test must go red with the path-conflict error. (b) Delete the sticker flag/payload guard → the second test must go red. (c) Add the address to the email body (`${JSON.stringify(parsed.data.sticker)}`) → the third test must go red. (d) Move the sticker block above `upsertJoin` → the fourth test must go red. Restore each, confirm green, report all four.

- [ ] **Step 10: Commit**

```bash
git add frontend/content/survey.ts frontend/lib/joinSchema.ts frontend/lib/people.ts frontend/lib/join.ts frontend/lib/email.ts frontend/test/join.test.ts
git commit -m "feat(join): take a sticker request on /join, stored apart from the person"
```

---

### Task 3: Deleting a person deletes their address

**Files:**
- Modify: `frontend/lib/review.ts` (`removePerson`, ~283)
- Modify: `frontend/test/review.test.ts` (append)

**Interfaces:**
- Consumes: `deleteStickerRequestsForPerson` (Task 1).

**Order matters.** Delete the sticker requests FIRST, then the person. If the sticker delete fails, stop and do not delete the person: the admin sees an error and retries the whole action. The other order can leave a postal address in the database attached to a person who no longer exists — the one outcome a deletion request must never produce.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/review.test.ts`)

```ts
import { upsertStickerRequest } from '../lib/stickers.ts';

const ADDR = { name: 'Pat', address: { line1: '1 Main St', city: 'Durham', country: 'US' } };

test('deleting a person deletes every sticker request and address they left', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: false, discord: true });
  await upsertStickerRequest(db, id as never, ADDR, T0);
  const r = await removePerson({ db, ...env }, id);
  assert.equal(r.ok, true);
  assert.equal(dump('people').length, 0);
  assert.equal(dump('sticker_requests').length, 0, 'no address outlives a deletion request');
});

test('if the sticker requests cannot be removed, the person is not removed either', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: false, discord: true });
  await upsertStickerRequest(db, id as never, ADDR, T0);
  db.failNextWriteTo('sticker_requests', new Error('mongo down'));
  const r = await removePerson({ db, ...env }, id);
  assert.equal(r.ok, false);
  assert.equal(dump('people').length, 1, 'the person stays so the admin can retry the whole thing');
  assert.equal(dump('sticker_requests').length, 1);
});
```

`failNextWriteTo` (added in PR 3) arms `deleteMany` on `sticker_requests` and leaves the `people` delete untouched — which is exactly what this test needs: the sticker delete fails, the person delete never runs.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — the first leaves a sticker request behind.

- [ ] **Step 3: Cascade in `removePerson`** (`frontend/lib/review.ts`)

PR 3 already made `removePerson` delete the person's pending package submissions before the person. Keep that, and put the sticker deletion FIRST, so the chain is: sticker requests → pending packages → person, each step returning `{ ok: false }` without touching the person if it fails. Addresses go first because they are the most sensitive thing the record points at; a retry is safe because each `deleteMany` of nothing succeeds.

```ts
export async function removePerson(deps: ReviewDeps, personId: PersonId): Promise<{ ok: boolean; message: string }> {
  // Addresses first. If this fails the person is left intact and the admin
  // retries; the reverse order could strand a postal address with no owner.
  try {
    await deleteStickerRequestsForPerson(deps.db, personId as never);
  } catch {
    deps.log?.(`sticker delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't remove their sticker request — nothing was deleted. Try again." };
  }
  // …then PR 3's pending-package deletion, unchanged…
  let gone: boolean;
  try {
    gone = await deletePerson(deps.db, personId);
  } catch {
    deps.log?.(`db delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't delete that record — try again." };
  }
  return gone
    ? { ok: true, message: "Deleted, with any sticker request and pending package. Remove the Resend contact by hand if they had one." }
    : { ok: false, message: "No such person." };
}
```

Read the current function in `lib/review.ts` first and splice the sticker step in above PR 3's package step; do not replace the package step. PR 3's existing tests for it must stay green.

Import `deleteStickerRequestsForPerson` from `./stickers.ts`. Check that `PersonId` and `ObjectId` agree; if `PersonId` is already an `ObjectId`, drop the `as never`.

- [ ] **Step 4: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?`
Expected: all green.

- [ ] **Step 5: Mutation-check**

(a) Delete the sticker-delete block → the first test must go red. (b) Swap the order, deleting the person first → the second test must go red. Restore both, confirm green, report.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/review.ts frontend/test/review.test.ts frontend/test/fakeDb.ts
git commit -m "fix(review): a deletion request removes the person's sticker address too"
```

---

### Task 4: `/join` asks for a mailing address when the visitor wants stickers

**Files:**
- Modify: `frontend/components/site/QuestionFlow.tsx`
- Modify: `frontend/scripts/walkthroughs/join.mjs`

UI; verified by the build, by reading, and by the PR evidence walkthrough.

- [ ] **Step 1: State and body**

Beside PR 3's `pkg` state:

```tsx
  const [sticker, setSticker] = useState({
    name: "", line1: "", line2: "", city: "", region: "", postal: "", country: "",
  });
  const wantsStickers = answers.wants_stickers === "yes";
```

In `submit()`'s join body, beside PR 3's `pkg` spread:

```tsx
          ...(wantsStickers
            ? { sticker: { name: sticker.name, address: {
                line1: sticker.line1, line2: sticker.line2 || undefined, city: sticker.city,
                region: sticker.region || undefined, postal: sticker.postal || undefined, country: sticker.country,
              } } }
            : {}),
```

- [ ] **Step 2: The fieldset, on the last step, after the package fieldset and before "Where can we reach you?"**

Match the contact fieldset's markup and the `Input` component exactly, and give each field the right `autoComplete` so browsers fill it:

```tsx
      {isJoin && last && wantsStickers ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Where should we mail the stickers?</legend>
          <p className="text-sm text-muted-foreground">
            Used only to mail them. We delete the address as soon as they ship.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Name on the envelope" autoComplete="name" required maxLength={80}
              value={sticker.name} onChange={(e) => setSticker((s) => ({ ...s, name: e.target.value }))} />
            <Input placeholder="Country" autoComplete="country-name" required maxLength={56}
              value={sticker.country} onChange={(e) => setSticker((s) => ({ ...s, country: e.target.value }))} />
            <Input placeholder="Address line 1" autoComplete="address-line1" required maxLength={120}
              value={sticker.line1} onChange={(e) => setSticker((s) => ({ ...s, line1: e.target.value }))} />
            <Input placeholder="Address line 2 (optional)" autoComplete="address-line2" maxLength={120}
              value={sticker.line2} onChange={(e) => setSticker((s) => ({ ...s, line2: e.target.value }))} />
            <Input placeholder="City" autoComplete="address-level2" required maxLength={80}
              value={sticker.city} onChange={(e) => setSticker((s) => ({ ...s, city: e.target.value }))} />
            <Input placeholder="State / region (if any)" autoComplete="address-level1" maxLength={80}
              value={sticker.region} onChange={(e) => setSticker((s) => ({ ...s, region: e.target.value }))} />
            <Input placeholder="Postal code (if any)" autoComplete="postal-code" maxLength={20}
              value={sticker.postal} onChange={(e) => setSticker((s) => ({ ...s, postal: e.target.value }))} />
          </div>
        </fieldset>
      ) : null}
```

- [ ] **Step 3: Extend the walkthrough**

In `frontend/scripts/walkthroughs/join.mjs`, answer "Yes please" to the sticker question and fill the address with an obviously fake one (`1 Walkthrough Way`, `Testville`, country `Nowhere`), so the PR evidence shows the new fieldset. The walkthrough submits as `walkthrough@example.com`, a reserved address, so Task 2's rule means NO sticker request is created and nothing is emailed — the same way it already fills the package fieldset without creating a package. Update the script's header comment to say so. The question and option text must match `content/survey.ts` exactly, and the placeholders must match the rendered inputs.

- [ ] **Step 4: Gates and commit**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`

```bash
git add frontend/components/site/QuestionFlow.tsx frontend/scripts/walkthroughs/join.mjs
git commit -m "feat(join): ask for a mailing address when a visitor wants stickers"
```

---

### Task 5: The admin Stickers tab

**Files:**
- Create: `frontend/app/api/platform/admin/stickers/route.ts`
- Create: `frontend/app/api/platform/admin/stickers/[id]/[action]/route.ts`
- Create: `frontend/app/(platform)/platform/admin/stickers/page.tsx`
- Create: `frontend/app/(platform)/platform/admin/stickers/StickersClient.tsx`
- Modify: `frontend/app/(platform)/platform/admin/AdminTabs.tsx`

**Interfaces:**
- Consumes: `listOpenStickerRequests`, `countShipped`, `shipStickerRequest`, `cancelStickerRequest` (Task 1); `requireAdminApp` (`@lib/platform/auth`).

**Admin only, structurally.** Every route calls `requireAdminApp()` before reading the body or touching the database. The page lives under `app/(platform)/platform/admin/`, whose `layout.tsx` refuses to render anything for a non-admin. Do not put a link to this page, or any sticker data, on `/platform/people`.

**A routing note from PR #50:** `app/api/platform/admin/[name]/` is an existing dynamic segment. The static `stickers/` sibling resolves first. Confirm `[name]`'s `NAMES` list does not include `stickers` and that the build lists both routes.

- [ ] **Step 1: The list route** (`app/api/platform/admin/stickers/route.ts`)

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { countShipped, listOpenStickerRequests } from "@lib/stickers";

/** The single place a postal address is readable, and only while unshipped. */
export async function GET() {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const { db } = await connectToDatabase();
  const [open, shipped] = await Promise.all([listOpenStickerRequests(db), countShipped(db)]);
  return NextResponse.json({
    shipped,
    requests: open.map((r) => ({
      id: String(r._id),
      name: r.name,
      address: r.address ?? null,
      createdAt: r.createdAt,
    })),
  });
}
```

- [ ] **Step 2: The action route** (`app/api/platform/admin/stickers/[id]/[action]/route.ts`)

```ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { cancelStickerRequest, shipStickerRequest } from "@lib/stickers";

type Ctx = { params: Promise<{ id: string; action: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  if (!session?.login) return NextResponse.json({ success: false, message: "session has no login" }, { status: 400 });
  const { id, action } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400 });
  const { db } = await connectToDatabase();
  const _id = new ObjectId(id);
  // explicit branches; the default refuses, it never falls through to a destructive action
  if (action === "ship") {
    const ok = await shipStickerRequest(db, _id, session.login, new Date());
    return NextResponse.json({ success: ok, message: ok ? "Marked shipped — the address is gone." : "Already shipped or not found." });
  }
  if (action === "cancel") {
    const ok = await cancelStickerRequest(db, _id);
    return NextResponse.json({ success: ok, message: ok ? "Cancelled — the address is gone." : "Not found." });
  }
  return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
}
```

Match the unauthorized-response shape and the `session?.login` handling of `app/api/platform/people/[id]/[action]/route.ts`; if they differ from this sketch, theirs win.

- [ ] **Step 3: The page and client**

Read `app/(platform)/platform/admin/keys/` and copy its page/client split, loading and empty states, and styling. The client lists each open request as a mailing label (name, then the address lines, one per line, easy to copy), with **Mark shipped** and **Cancel** buttons, both behind a `confirm()` naming the person, and a line reading "N shipped so far". After an action, re-fetch the list; render the returned `message` in an always-mounted `role="status"` region, styled differently for success and failure.

- [ ] **Step 4: The tab** (`AdminTabs.tsx`)

Add `{ href: "/platform/admin/stickers", label: "Stickers" },` in the same style as the existing entries.

- [ ] **Step 5: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`, with `/api/platform/admin/stickers`, `/api/platform/admin/stickers/[id]/[action]` and `/platform/admin/stickers` in the route table.

- [ ] **Step 6: Confirm no address reaches a member surface**

Run: `cd frontend && grep -rn "sticker" app/api/platform/people "app/(platform)/platform/people" lib/population.ts`
Expected: no reads of `sticker_requests` and no `address` field. The only permitted mention is the `wants.stickers` **count** in the Population aggregates.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/api/platform/admin/stickers "frontend/app/(platform)/platform/admin/stickers" "frontend/app/(platform)/platform/admin/AdminTabs.tsx"
git commit -m "feat(stickers): admin tab to mail requests and erase each address as it ships"
```

---

### Task 6: Privacy and docs

**Files:**
- Modify: `frontend/static_pages/privacy-policy.mdx`
- Modify: `frontend/SETUP-community.md`
- Modify: `CLAUDE.md`

**Document the merged code, not this plan.** Read Tasks 1-5 as merged; list every place they differ from this plan in your report.

- [ ] **Step 1: `privacy-policy.mdx`** — a sticker request stores a name and postal address, kept apart from everything else; the address is readable only by org admins; it is deleted the moment the stickers ship or the request is cancelled; asking to be deleted removes it too; it is never emailed back or shared. Only claim what the code does.

- [ ] **Step 2: `SETUP-community.md`** — a "Stickers" section: where requests appear (`/platform/admin/stickers`, admins only, and why it is not on `/platform/people`), what Ship and Cancel do, that Ship erases the address in the same write, that a person can hold one open request at a time and the FIRST request wins (why: the `/join` email is unverified; a person who moved replies to the confirmation email, or an admin cancels and they ask again), that reserved test addresses never create a request, and that deleting a person deletes their sticker requests before anything else.

- [ ] **Step 3: `CLAUDE.md`** — add the routes to the Community line and one sentence of the rule: **a postal address is read only by `listOpenStickerRequests`, whose only caller is the admin sticker route; never add another reader, and never put an address on `people`.**

- [ ] **Step 4: Gate and commit**

Run: `cd frontend && npm run test:lib; echo EXIT=$?` — unchanged count for a docs-only commit.

```bash
git add frontend/static_pages/privacy-policy.mdx frontend/SETUP-community.md CLAUDE.md
git commit -m "docs(stickers): what a sticker request stores, who sees it, and when it goes"
```
