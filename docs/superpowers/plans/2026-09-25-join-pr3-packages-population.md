# PR 3 — Package submissions + Population tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor submit their package through `/join`, keep it off the public site until a member approves it in the CMS, and give `/platform/people` a Population tab that answers "who are our users and how do they find us".

**Architecture:** A submission is any `packages` document carrying `submittedBy`; it is publicly visible only once `published === true`. That one rule lives in `lib/packageVisibility.ts` and every public reader uses it — this lands FIRST, before any code path can create a submission. The package payload rides in the existing `POST /api/join` body, validated by the existing `packageSchema`. Population is a pure aggregation module over `people`, plus follow/support click counts read from the Plausible Stats API, exposed by one member-gated read endpoint and rendered as a sub-tab beside the Queue.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4 + shadcn/ui, MongoDB (`packages`, `people`), the Plausible Stats API v2, zod, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-18-community-join-flow-design.md` (delivery order item 3)

## Global Constraints

- **Conventional Commits. Never add an AI co-author trailer or a "Generated with" footer to any commit** — absolute rule in this repo, overriding any tooling default.
- Stage explicit paths; never `git add -A`. Branch + PR; never push `main`.
- Import siblings in `lib/` with the `.ts` extension (`from "./people.ts"`) — repo convention.
- **Nothing imported into `test/*.ts` may transitively import `next-auth`** — it cannot load under `node --test`. `lib/auth.ts` is off-limits to tests.
- **Load-bearing invariant from PR #48:** the `people` document is written BEFORE any outbound network call, and an outbound failure never fails the visitor's request. A package insert is a local write that happens after `people` and before any email.
- `log?()` never receives an email address, an invite code, or a third-party response body — a category and a status only.
- Gate before any task is DONE: `npm run test:lib` green and above the previous count; `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` exits 0 (**read the exit code** — a "Compiled successfully" line can precede a page-data failure). A gate that was not run is not DONE.
- A test earns its place only if it fails when the line it covers is deleted or inverted. Each task names its mutations; run them and report red-then-green.
- `/platform/people` is readable by every org member (~64 people, PR #51). Nothing this plan adds to it may carry a credential or a postal address.

## Findings that shaped this plan

- **`published: false` is NOT a visibility flag in this collection.** `app/(site)/packages/page.tsx:22-24` deliberately has no published filter: *"the legacy docs all carry published: false (the field predates the manage form's published-true default), so it is not a usable visibility flag."* The spec assumed inserting a submission with `published: false` hides it. It would not — it would be indistinguishable from every legacy package and appear on the public site at once. **Four public readers use `find({})`**: the public `/packages` page, `GET /api/packages` (commented "public, read-only"), `lib/packageOptions.ts` (which feeds the survey's "which packages do you use" options to every visitor), and the `/about` package count. Task 1 introduces a real discriminator and applies it to all four before anything can create a submission.
- **`follow_click` / `support_click` go only to Plausible** (`components/site/TrackedLink.tsx`), and there was no server-side Plausible integration. **Decided by the repo owner:** read them from the Plausible Stats API v2 (Task 6) — no new collection, no new public endpoint. That needs a `PLAUSIBLE_API_KEY` the operator must create, so until then the click section reports *not configured* and says so on the tab, rather than rendering an empty chart that reads as "nobody clicked".
- **Deferred, not implemented:** the `/platform/api-key` per-key quota readout. The spec conditions it on sdv-db shipping fields, and nothing in `app/(platform)/platform/api-key/` or `lib/platform/keys-server.ts` reads a quota or usage field today.
- **The spec's `requireWriter()` is not a shared helper.** People routes use `requireMemberApp()` from `@lib/platform/auth`; use that.
- **Spec'd passive signals that do not exist yet.** "CRAN/PyPI downloads from the existing `/api/stats`" — `/api/stats` has only `github/`; no download integration exists, so it is deferred. "Resend contact count" is taken from `people` instead (`newsletter.resendContactId` present, not unsubscribed): `people` is the list of record, and counting it needs no external call. The Discord member count is implemented best-effort and shows "—" until the operator sets `DISCORD_GUILD_ID`.
- **Pre-existing, left alone:** `app/(site)/stats/page.tsx` counts `published: { $ne: false }`, which excludes every legacy package, so the stats page and `/about` already disagree. Out of scope; submissions are excluded from both under this plan, so it gets no worse.

## Review Focus

1. **A stranger's package reaching any public surface** — the `/packages` page, `GET /api/packages`, the survey options list, or the `/about` count — before a member sets `published: true`. Owned by Task 1, and re-checked by Task 3's integration test.
2. **A legacy package disappearing.** Every existing document has `published: false` and no `submittedBy`; the new filter must leave all of them exactly as visible as today. Owned by Task 1.
3. **A package inserted when the `people` write failed**, leaving a `submittedBy` pointing at nothing. Owned by Task 3.
4. **The Population tab on an empty or sparse database** — zero people, people with no profile (footer signups), survey respondents. Every aggregate must return zeroes and render, never divide by zero or throw on `[]`. Owned by Task 7.
5. **Plausible unconfigured, rejecting the key, or down.** The Population tab must still render every other number, and must say *why* the click section is empty — not configured, or the HTTP status Plausible returned — instead of an empty chart that reads as zero clicks. Owned by Task 6, rendered by Task 8.

---

### Task 1: One definition of "publicly visible", on every public reader

**Files:**
- Create: `frontend/lib/packageVisibility.ts`
- Create: `frontend/test/packageVisibility.test.ts`
- Modify: `frontend/app/api/packages/route.ts` (`getPkgs`)
- Modify: `frontend/app/(site)/packages/page.tsx:20-32`
- Modify: `frontend/lib/packageOptions.ts:7`
- Modify: `frontend/app/(site)/about/page.tsx:16`

**Interfaces:**
- Produces: `PUBLIC_PACKAGE_FILTER` (a Mongo filter object); `isPubliclyVisible(pkg: { submittedBy?: unknown; published?: boolean }): boolean`.

- [ ] **Step 1: Write the failing test** (`frontend/test/packageVisibility.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { PUBLIC_PACKAGE_FILTER, isPubliclyVisible } from '../lib/packageVisibility.ts';

const legacy = { title: 'cfbfastR', published: false };              // every existing doc looks like this
const created = { title: 'wehoop', published: true };                // made in the CMS form
const submitted = { title: 'strangerPkg', published: false, submittedBy: new ObjectId() };
const approved = { title: 'approvedPkg', published: true, submittedBy: new ObjectId() };

test('legacy and CMS-created packages stay visible; a submission is hidden until approved', () => {
  assert.equal(isPubliclyVisible(legacy), true, 'a legacy doc must not vanish');
  assert.equal(isPubliclyVisible(created), true);
  assert.equal(isPubliclyVisible(submitted), false, 'a stranger never reaches the public site');
  assert.equal(isPubliclyVisible(approved), true, 'until a member approves it');
});

test('the Mongo filter agrees with the predicate on the same four documents', async () => {
  const { db } = fakeDb();
  for (const d of [legacy, created, submitted, approved]) await db.collection('packages').insertOne({ ...d });
  const titles = (await db.collection('packages').find(PUBLIC_PACKAGE_FILTER).toArray()).map((p) => p.title).sort();
  assert.deepEqual(titles, ['approvedPkg', 'cfbfastR', 'wehoop']);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/packageVisibility.ts'`. If the second test then fails because `fakeDb` does not support `$or` or `$exists` inside it, extend `fakeDb.matches()` to support `$or` (an array of sub-filters, any must match); `$exists` is already supported.

- [ ] **Step 3: Write `frontend/lib/packageVisibility.ts`**

```ts
/**
 * Which `packages` documents the public may see.
 *
 * `published` alone cannot answer this: every legacy document carries
 * `published: false` because the field predates the manage form's default, and
 * the public page has always shown them. A visitor SUBMISSION is what must stay
 * hidden, and a submission is exactly a document with `submittedBy`. So: no
 * `submittedBy` → visible as it always was; a submission → visible only once a
 * member sets `published: true` in the CMS.
 *
 * Every public reader uses this. A reader that does `find({})` on `packages`
 * leaks a stranger's submission to the site.
 */
export const PUBLIC_PACKAGE_FILTER = {
  $or: [{ submittedBy: { $exists: false } }, { published: true }],
} as const;

export function isPubliclyVisible(pkg: { submittedBy?: unknown; published?: boolean }): boolean {
  return pkg.submittedBy == null || pkg.published === true;
}
```

- [ ] **Step 4: Apply it to all four public readers**

`frontend/app/api/packages/route.ts`, in `getPkgs`: replace `.find({})` with `.find(PUBLIC_PACKAGE_FILTER)` and add `import { PUBLIC_PACKAGE_FILTER } from "@lib/packageVisibility";`. Leave the `// Getting all pkgs (public, read-only).` comment, and add beneath it: `// Submissions stay hidden until a member publishes them — see lib/packageVisibility.`

`frontend/app/(site)/packages/page.tsx`: replace `.find({})` with `.find(PUBLIC_PACKAGE_FILTER)`, and replace the three-line "No published filter" comment with:

```ts
    // `published` alone is not a visibility flag here — every legacy doc carries
    // published: false and has always been shown. What must stay hidden is a
    // visitor submission until a member approves it; see lib/packageVisibility.
```

`frontend/lib/packageOptions.ts:7`: `find({}, { projection: … })` → `find(PUBLIC_PACKAGE_FILTER, { projection: … })`. A stranger's package must not appear as an option in every other visitor's survey.

`frontend/app/(site)/about/page.tsx:16`: `countDocuments({})` → `countDocuments(PUBLIC_PACKAGE_FILTER)`.

- [ ] **Step 5: Confirm no public reader was missed**

Run: `cd frontend && grep -rn 'collection("packages")' app lib --include=*.ts --include=*.tsx`
Every hit must be one of: the four readers above (now filtered); `app/(site)/stats/page.tsx` (already filters on `published`, excluding submissions — leave it); `app/(site)/packages/manage/page.tsx` (the member CMS, which must see everything — leave it); or the write paths in `app/api/packages/route.ts` (`addPkg`/`updatePkg`/`deletePkg`). Report any other hit as a finding rather than silently filtering it.

- [ ] **Step 6: Run the gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 7: Mutation-check**

(a) Change `{ published: true }` to `{ published: false }` in the filter → the second test must go red. (b) Change `pkg.submittedBy == null` to `true` in the predicate → the first test must go red on the `submitted` assertion. (c) Drop the `submittedBy` branch so the filter is `{ published: true }` alone → the first test's legacy assertion must go red. Restore each, confirm green, report all three.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/packageVisibility.ts frontend/test/packageVisibility.test.ts frontend/test/fakeDb.ts frontend/app/api/packages/route.ts "frontend/app/(site)/packages/page.tsx" frontend/lib/packageOptions.ts "frontend/app/(site)/about/page.tsx"
git commit -m "fix(packages): define public visibility before anything can submit a package"
```

---

### Task 2: `submitPackage` — store a submission, stamped and unpublished

**Files:**
- Modify: `frontend/lib/packageSchema.ts` (append)
- Create: `frontend/lib/packageSubmission.ts`
- Create: `frontend/test/packageSubmission.test.ts`
- Modify: `frontend/test/fakeDb.ts` (only if `insertOne` cannot yet be made to fail)

**Interfaces:**
- Consumes: `packageSchema` (existing); `isPubliclyVisible` (Task 1).
- Produces: `packageSubmissionSchema` = `packageSchema.omit({ published: true })`; `type PackageSubmissionInput`; `submitPackage(db: Db, input: PackageSubmissionInput, submittedBy: ObjectId, orgTierRequested: boolean, now: Date): Promise<{ ok: boolean; packageId?: ObjectId; message: string }>`.

- [ ] **Step 1: Write the failing test** (`frontend/test/packageSubmission.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { packageSubmissionSchema, submitPackage } from '../lib/packageSubmission.ts';
import { isPubliclyVisible } from '../lib/packageVisibility.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const GOOD = {
  title: 'hoopR', repoType: 'R' as const, sports: 'MBB',
  content: 'Play-by-play and box scores for college and pro basketball.',
  sourceHref: 'https://github.com/sportsdataverse/hoopR',
};

test('a submission is stored hidden, stamped with who sent it and what they asked for', async () => {
  const { db, dump } = fakeDb();
  const person = new ObjectId();
  const r = await submitPackage(db, GOOD, person, true, T0);
  assert.equal(r.ok, true);
  const doc = dump('packages')[0];
  assert.equal(String(doc.submittedBy), String(person));
  assert.equal(doc.orgTierRequested, true);
  assert.equal(isPubliclyVisible(doc), false, 'a stranger never reaches the public site');
});

test('a client-supplied published flag never survives', async () => {
  const parsed = packageSubmissionSchema.safeParse({ ...GOOD, published: true });
  assert.equal(parsed.success, true, 'unknown keys are stripped, not rejected');
  assert.equal('published' in parsed.data!, false);
  // and even if something upstream let it through, the write overrides it
  const { db, dump } = fakeDb();
  await submitPackage(db, { ...GOOD, published: true } as never, new ObjectId(), false, T0);
  assert.equal(dump('packages')[0].published, false);
});

test('a malformed submission is refused', () => {
  assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, sourceHref: 'not-a-url' }).success, false);
  assert.equal(packageSubmissionSchema.safeParse({ ...GOOD, repoType: 'Rust' }).success, false);
});

test('a database failure is reported, never thrown', async () => {
  const { db } = fakeDb();
  db.failNextWriteTo('packages', new Error('mongo down'));
  const r = await submitPackage(db, GOOD, new ObjectId(), false, T0);
  assert.equal(r.ok, false);
  assert.match(r.message, /could not/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/packageSubmission.ts'`.

- [ ] **Step 3: Append to `frontend/lib/packageSchema.ts`**

```ts
/**
 * What a visitor may send through /join: `packageSchema` without `published`.
 * A submission is always created hidden and the API stamps its provenance —
 * the same rule the CMS applies to `createdBy`.
 */
export const packageSubmissionSchema = packageSchema.omit({ published: true });
export type PackageSubmissionInput = z.infer<typeof packageSubmissionSchema>;
```

- [ ] **Step 4: Write `frontend/lib/packageSubmission.ts`**

```ts
import type { Db, ObjectId } from "mongodb";
import { packageSubmissionSchema, type PackageSubmissionInput } from "./packageSchema.ts";

export { packageSubmissionSchema };
export type { PackageSubmissionInput };

/**
 * Store a visitor's package for a member to review.
 *
 * `published: false` comes LAST in the document so no field of the input can
 * override it, and `submittedBy` is what keeps it off the public site (see
 * lib/packageVisibility.ts — `published` alone is not a visibility flag here).
 * Never throws: a submission rides along with a join request, and a failed
 * insert must not fail the visitor.
 */
export async function submitPackage(
  db: Db,
  input: PackageSubmissionInput,
  submittedBy: ObjectId,
  orgTierRequested: boolean,
  now: Date
): Promise<{ ok: boolean; packageId?: ObjectId; message: string }> {
  try {
    const res = await db.collection("packages").insertOne({
      ...input,
      submittedBy,
      orgTierRequested,
      createdAt: now,
      updatedAt: now,
      published: false,
    });
    return { ok: true, packageId: res.insertedId as ObjectId, message: "Your package is queued for a member to review." };
  } catch {
    return { ok: false, message: "We saved your answers but could not record the package — reply to us and we'll add it by hand." };
  }
}
```

- [ ] **Step 5: Give `fakeDb` a failure scoped to one collection**

`failNextUpdateWith` arms only `updateOne` and `deleteOne`, across every collection. That is not enough for this plan, for two reasons: `upsertJoin` writes `people` with `findOneAndUpdate`, which it does not arm; and `handleJoin` calls the rate limiter — a `findOneAndUpdate` on `rate_limits` — BEFORE the `people` write, so arming every write would make a "the person write failed" test pass because the rate limiter failed instead. Add a precise primitive and use it everywhere this plan (and PR 4's) needs a write to fail:

```ts
    /** Arms the next write — updateOne, findOneAndUpdate, insertOne, deleteOne or
     *  deleteMany — on ONE collection to throw `err`. Scoped so a test can fail the
     *  write it is about and not whatever write happens to come first. */
    failNextWriteTo: (collection: string, err: Error) => { nextWriteFailure.set(collection, err); },
```

backed by `const nextWriteFailure = new Map<string, Error>();` and, at the top of each of those five methods on a collection named `name`:

```ts
          const armed = nextWriteFailure.get(name);
          if (armed) { nextWriteFailure.delete(name); throw armed; }
```

Keep `failNextUpdateWith` and `failNextReadWith` exactly as they are — existing tests use them.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npm run test:lib`
Expected: PASS, count above Task 1's.

- [ ] **Step 7: Mutation-check**

(a) Move `published: false` to the top of the object literal, above `...input` → the second test must go red. (b) Remove `submittedBy` from the insert → the first test must go red on the visibility assertion. (c) Remove the `try`/`catch` → the fourth test must go red. Restore each, confirm green, report all three.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/packageSchema.ts frontend/lib/packageSubmission.ts frontend/test/packageSubmission.test.ts frontend/test/fakeDb.ts
git commit -m "feat(packages): store a visitor submission hidden and stamped"
```

---

### Task 3: The join request carries and stores a submission

**Files:**
- Modify: `frontend/content/survey.ts` (add one question)
- Modify: `frontend/lib/joinSchema.ts` (add `pkg`)
- Modify: `frontend/lib/people.ts` (`upsertJoin`'s `wants`)
- Modify: `frontend/lib/join.ts` (`handleJoin`)
- Modify: `frontend/test/fakeDb.ts` (reproduce Mongo's update path conflict)
- Modify: `frontend/test/join.test.ts` (append)

**Interfaces:**
- Consumes: `packageSubmissionSchema`, `submitPackage` (Task 2); `isPubliclyVisible` (Task 1).
- Produces: question id `wants_package` (section `wants`); `joinBodySchema.pkg` = `packageSubmissionSchema.extend({ orgTier: z.boolean().optional() }).optional()`; `upsertJoin`'s `input.wants` becomes `{ newsletter: boolean; discord: boolean; package: boolean }`.

**The trap in this task.** `upsertJoin` (`lib/people.ts`, ~136-165) writes `wants.newsletter` and `wants.discord` in `$set`, and `wants.stickers: false` and `wants.package: false` in `$setOnInsert`. To record `wants.package: true` you must move it to `$set` **and delete it from `$setOnInsert`**. Real MongoDB rejects an update naming the same path in both with *"Updating the path 'wants.package' would create a conflict"* — so leaving it in both makes **every** `/join` submission fail in production. `fakeDb` does not reproduce that today (it applies `$setOnInsert` blindly), so Step 3 makes it throw the way Mongo does before anything else changes. Leave `wants.stickers` in `$setOnInsert`; PR 4 moves it.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/join.test.ts`)

```ts
const PKG = { title: 'hoopR', repoType: 'R', sports: 'MBB', content: 'PBP and box scores.', sourceHref: 'https://github.com/sportsdataverse/hoopR' };

test('a package submitted through /join is stored hidden and linked to the person', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: { ...PKG, orgTier: true } } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  const person = dump('people')[0];
  const pkg = dump('packages')[0];
  assert.equal(person.wants.package, true);
  assert.equal(String(pkg.submittedBy), String(person._id));
  assert.equal(pkg.orgTierRequested, true);
  assert.equal(pkg.published, false);
});

test('a re-submission updates wants.package without a Mongo path conflict', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', answers: { ...D_ANSWERS, wants_package: 'no' } } as never, '1.1.1.1', deps);
  const r = await handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never, '1.1.1.1', deps
  );
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].wants.package, true, 'the second answer is recorded');
});

test('the package flag and payload must agree', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', answers: { ...D_ANSWERS, wants_package: 'no' }, pkg: PKG } as never, '1.1.1.1', deps);
  assert.equal(dump('packages').length, 0, 'a payload with the flag off is not a submission');
  const r = await handleJoin({ email: 'c@b.co', answers: { ...D_ANSWERS, wants_package: 'yes' } } as never, '2.2.2.2', deps);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /package/i);
});

test('no package is stored when the person could not be written', async () => {
  const { db, dump } = fakeDb();
  db.failNextWriteTo('people', new Error('mongo down'));
  await assert.rejects(handleJoin(
    { email: 'a@b.co', answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  ));
  assert.equal(dump('packages').length, 0, 'never a submission pointing at nobody');
});
```

`D_ANSWERS` already exists in the file; it must include `wants_package` for the existing tests to keep validating once the question is `required`. Add `wants_package: 'no'` to its definition and confirm the whole suite still passes.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL on all four new tests.

- [ ] **Step 3: Make `fakeDb` reject what Mongo rejects**

In `frontend/test/fakeDb.ts`, at the top of the update function (before `$set` or `$setOnInsert` is applied), add:

```ts
  // Real MongoDB refuses an update that names the same path in two operators.
  // Mirroring it here is what stops a $set/$setOnInsert collision from passing
  // every test and then failing every write in production.
  const setKeys = Object.keys((update.$set as Doc) ?? {});
  for (const k of Object.keys((update.$setOnInsert as Doc) ?? {})) {
    if (setKeys.includes(k)) throw new Error(`Updating the path '${k}' would create a conflict at '${k}'`);
  }
```

Run the suite: it must stay green. If an existing test now fails, that is a latent production bug the fake was hiding — stop and report it rather than editing the test.

- [ ] **Step 4: Add the question** (`frontend/content/survey.ts`, in `QUESTIONS`, directly after `wants_discord`)

```ts
  { id: "wants_package", section: "wants", type: "single", label: "Have you built a package you'd like listed on sportsdataverse.org?", required: true,
    options: [{ value: "yes", label: "Yes — I'll add the details" }, { value: "no", label: "Not right now" }] },
```

- [ ] **Step 5: Accept the payload** (`frontend/lib/joinSchema.ts`)

Add `import { packageSubmissionSchema } from "./packageSchema.ts";` and, inside `joinBodySchema` after `placement`:

```ts
  /** Present only when answers.wants_package === "yes". Validated by the same
   *  schema the CMS uses; `orgTier` is a request, never a grant. */
  pkg: packageSubmissionSchema.extend({ orgTier: z.boolean().optional() }).optional(),
```

- [ ] **Step 6: Record `wants.package`** (`frontend/lib/people.ts`, `upsertJoin`)

Widen the input type to `wants: { newsletter: boolean; discord: boolean; package: boolean };`, add `"wants.package": input.wants.package,` to `$set`, and **delete** `"wants.package": false,` from `$setOnInsert`.

- [ ] **Step 7: Wire it through `handleJoin`** (`frontend/lib/join.ts`)

Widen the initialiser to `let wants = { newsletter: true, discord: false, package: false };` and the derivation to:

```ts
    wants = {
      newsletter: answers.wants_newsletter === "yes",
      discord: answers.wants_discord === "yes",
      package: answers.wants_package === "yes",
    };
```

Immediately after the `if (rawAnswers) { … }` block and **before** the rate limit, so a malformed request never spends a slot:

```ts
  // The flag and the payload must agree. A flag with no details is a form bug we
  // refuse cleanly rather than store half of; details with the flag off are not
  // a submission and are dropped.
  if (wants.package && !parsed.data.pkg) {
    return { status: 400, body: { success: false, message: "Add your package's details, or answer no to the package question." } };
  }
```

Immediately after the `upsertJoin` / `upsertNewsletterSignup` call and **before** `beginOptIn` — a local write, so it precedes every outbound call, and it runs only once `people` exists:

```ts
  let pkgNote = "";
  if (wants.package && parsed.data.pkg) {
    const { orgTier, ...pkg } = parsed.data.pkg;
    pkgNote = (await submitPackage(deps.db, pkg, personId, Boolean(orgTier), now)).message;
  }
```

Add `submitPackage` to the imports (`from "./packageSubmission.ts"`), and push `pkgNote` into `parts` after the Discord message: `if (pkgNote) parts.push(pkgNote);`.

- [ ] **Step 8: Run the gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 9: Mutation-check**

(a) Put `"wants.package": false` back into `$setOnInsert` → the second test must go red **with the conflict error**, proving the fake now catches it. (b) Delete the flag/payload guard → the third test must go red. (c) Move the `submitPackage` block above the `upsertJoin` call → the fourth test must go red. Restore each, confirm green, report all three.

- [ ] **Step 10: Commit**

```bash
git add frontend/content/survey.ts frontend/lib/joinSchema.ts frontend/lib/people.ts frontend/lib/join.ts frontend/test/fakeDb.ts frontend/test/join.test.ts
git commit -m "feat(join): carry a package submission on /join and store it after the person"
```

---

### Task 4: `/join` shows the package fields when the visitor says yes

**Files:**
- Modify: `frontend/components/site/QuestionFlow.tsx`

**Interfaces:**
- Consumes: `REPO_TYPES` from `lib/packageSchema.ts`; the `pkg` body field (Task 3).
- Produces: nothing new for later tasks.

This is UI; `node --test` cannot load it. It is verified by the build, by reading, and by the PR evidence walkthrough.

- [ ] **Step 1: Hold the package fields in state**

Beside `const [contact, setContact] = useState({ email: "", name: "" });` (~line 33):

```tsx
  const [pkg, setPkg] = useState({
    title: "", repoType: "R" as (typeof REPO_TYPES)[number], sports: "", content: "",
    sourceHref: "", docsHref: "", orgTier: false,
  });
  const wantsPackage = answers.wants_package === "yes";
```

and import `REPO_TYPES` from `@lib/packageSchema`.

- [ ] **Step 2: Send them only when asked for** (the `submit()` body, ~line 71)

```tsx
    const body = isJoin
      ? {
          email: contact.email,
          name: contact.name.trim() || undefined,
          answers,
          placement,
          // omitted entirely unless they said yes, so the flag and the payload agree
          ...(wantsPackage ? { pkg: { ...pkg, docsHref: pkg.docsHref.trim() || undefined } } : {}),
        }
      : { answers };
```

- [ ] **Step 3: Render the fieldset on the last step, above "Where can we reach you?"**

Match the existing contact fieldset's markup exactly — same `fieldset`/`legend` classes, same `Input` component, same grid:

```tsx
      {isJoin && last && wantsPackage ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Your package</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Package name" required maxLength={120} value={pkg.title}
              onChange={(e) => setPkg((p) => ({ ...p, title: e.target.value }))} />
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={pkg.repoType}
              onChange={(e) => setPkg((p) => ({ ...p, repoType: e.target.value as (typeof REPO_TYPES)[number] }))}
              aria-label="Language">
              {REPO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Input placeholder="Sport or category (e.g. MBB)" required maxLength={120} value={pkg.sports}
              onChange={(e) => setPkg((p) => ({ ...p, sports: e.target.value }))} />
            <Input type="url" placeholder="Source repository URL" required value={pkg.sourceHref}
              onChange={(e) => setPkg((p) => ({ ...p, sourceHref: e.target.value }))} />
            <Input type="url" placeholder="Docs URL (optional)" value={pkg.docsHref}
              onChange={(e) => setPkg((p) => ({ ...p, docsHref: e.target.value }))} />
          </div>
          <textarea className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            placeholder="What does it do?" required maxLength={2000} value={pkg.content}
            onChange={(e) => setPkg((p) => ({ ...p, content: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pkg.orgTier} onChange={(e) => setPkg((p) => ({ ...p, orgTier: e.target.checked }))} />
            Consider this for the sportsdataverse GitHub org
          </label>
        </fieldset>
      ) : null}
```

Before writing this, read how the rest of the site styles a `<select>` and a `<textarea>` (search `components/ui/` for `textarea.tsx` / `select.tsx`, and `grep -rn "<textarea\|<select" components app`). If shadcn components exist, use them instead of the raw elements above — match the house style rather than this sketch.

- [ ] **Step 4: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 5: Extend the walkthrough so the PR evidence exercises it**

`frontend/scripts/walkthroughs/join.mjs` drives `/join` end to end with a reserved-domain address. Add an answer of "Yes — I'll add the details" to the package question and fill the fieldset with an obviously fake package (title `walkthrough-test-pkg`, source `https://example.com/walkthrough`). Reserved-domain addresses are never emailed; the package lands hidden and is visible only in the CMS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/site/QuestionFlow.tsx frontend/scripts/walkthroughs/join.mjs
git commit -m "feat(join): ask for package details when a visitor says they have one"
```

---

### Task 5: The CMS shows submissions first, badged, with the org-tier checklist

**Files:**
- Modify: `frontend/app/(site)/packages/manage/page.tsx:30`
- Modify: `frontend/app/(site)/packages/manage/ManagePackagesClient.tsx:188-192`

**Interfaces:**
- Consumes: `isPubliclyVisible` (Task 1).

**A pre-existing UI lie this task fixes.** The row renders a "Hidden" badge whenever `published === false` — which is every legacy package, all of which are publicly visible. After this task "Hidden" means what it says: `!isPubliclyVisible(pkg)`.

- [ ] **Step 1: Sort submissions awaiting review to the top** (`manage/page.tsx:30`)

Replace `.sort({ published: -1 })` with a sort that puts unreviewed submissions first, newest first, then everything else by title:

```ts
        (await db.collection("packages").find({}).toArray())
          .sort((a, b) => {
            const pa = a.submittedBy && a.published !== true ? 0 : 1;
            const pb = b.submittedBy && b.published !== true ? 0 : 1;
            if (pa !== pb) return pa - pb;
            if (pa === 0) return +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0);
            return String(a.title).localeCompare(String(b.title));
          })
```

(This page must keep `find({})` — it is the member CMS and is the one place that sees everything.)

- [ ] **Step 2: Replace the "Hidden" badge with three truthful ones** (`ManagePackagesClient.tsx:188-192`)

```tsx
                    {pkg.submittedBy && pkg.published !== true ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        Submitted
                      </span>
                    ) : null}
                    {pkg.orgTierRequested ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                        Org tier
                      </span>
                    ) : null}
                    {!isPubliclyVisible(pkg) ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Hidden
                      </span>
                    ) : null}
```

Import `isPubliclyVisible` from `@lib/packageVisibility`. Add `submittedBy?: string; orgTierRequested?: boolean; createdAt?: string` to the package row type if it is typed.

- [ ] **Step 3: The org-tier checklist**

Below the description line of any row with `pkg.orgTierRequested`, render a short list the reviewing member ticks before publishing. It is informational only — the spec says "no enforcement", so the ticks live in component state, are not saved, and never block the Publish action:

```tsx
                  {pkg.orgTierRequested ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground" aria-label="Org tier checklist">
                      {["An OSI license file", "A named maintainer who will stay", "Tests that run", "CI on the default branch"].map((item) => (
                        <li key={item}>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" /> {item}
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
```

- [ ] **Step 4: Approving is the existing publish action**

The spec says approving is flipping `published` with the existing PUT. Confirm the edit form's published control sets `published: true` through `updatePkg`, and that after it does, `isPubliclyVisible` returns true for that submission. No new endpoint.

- [ ] **Step 5: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(site)/packages/manage/page.tsx" "frontend/app/(site)/packages/manage/ManagePackagesClient.tsx"
git commit -m "feat(packages): surface submissions first in the CMS with truthful badges"
```

---

### Task 6: Click counts from the Plausible Stats API

**Files:**
- Create: `frontend/lib/plausible.ts`
- Create: `frontend/test/plausible.test.ts`
- Modify: `frontend/.env.example` (add `PLAUSIBLE_API_KEY`, `PLAUSIBLE_SITE_ID`)

**Interfaces:**
- Produces: `type ClickCounts = { status: "unconfigured" | "ok" | "error"; httpStatus?: number; rows: { event: string; platform: string; placement: string; count: number }[] }`; `fetchClickCounts(deps: { apiKey?: string; siteId?: string; fetchImpl?: typeof fetch }): Promise<ClickCounts>`.

**Decided by the repo owner:** follow/support clicks come from Plausible, which already records them (`components/site/TrackedLink.tsx` sends `follow_click` / `support_click` with `platform` and `placement` props). No new collection and no new public endpoint. Until the operator creates `PLAUSIBLE_API_KEY`, the section reports `unconfigured` — and **the tab says so and why**, rather than showing an empty chart that reads as "nobody clicked".

**The request, from the Plausible Stats API v2 docs** (`POST https://plausible.io/api/v2/query`, `Authorization: Bearer <key>`):

```json
{
  "site_id": "sportsdataverse.org",
  "metrics": ["events"],
  "date_range": "91d",
  "filters": [["is", "event:goal", ["follow_click", "support_click"]]],
  "dimensions": ["event:goal", "event:props:platform", "event:props:placement"]
}
```

The response is `{ results: [{ dimensions: [goal, platform, placement], metrics: [events] }], meta, query }`. Two things to get exactly right, both from the docs: the preset is **`"91d"`** (there is no `"90d"`; a wrong preset fails the query), and `site_id` is the domain the app reports under, which is `sportsdataverse.org` (`app/providers.tsx`: `<PlausibleProvider domain="sportsdataverse.org">`).

**This client cannot be run against the real API in this PR** — no key exists. So it is built to diagnose itself once the operator adds one: a non-200 is reported as `status: "error"` with the HTTP status (never the response body), and the tab shows it.

- [ ] **Step 1: Write the failing test** (`frontend/test/plausible.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchClickCounts } from '../lib/plausible.ts';

function fakePlausible(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('without a key it reports unconfigured and makes no request', async () => {
  const { fetchImpl, calls } = fakePlausible(200, {});
  const r = await fetchClickCounts({ apiKey: undefined, fetchImpl });
  assert.equal(r.status, 'unconfigured');
  assert.deepEqual(r.rows, []);
  assert.equal(calls.length, 0);
});

test('it sends the documented v2 query and maps the rows', async () => {
  const { fetchImpl, calls } = fakePlausible(200, {
    results: [
      { dimensions: ['follow_click', 'github', 'footer'], metrics: [42] },
      { dimensions: ['support_click', 'kofi', 'callout'], metrics: [7] },
    ],
  });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.rows, [
    { event: 'follow_click', platform: 'github', placement: 'footer', count: 42 },
    { event: 'support_click', platform: 'kofi', placement: 'callout', count: 7 },
  ]);
  assert.equal(calls[0].url, 'https://plausible.io/api/v2/query');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer k');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.site_id, 'sportsdataverse.org');
  assert.equal(body.date_range, '91d', 'there is no 90d preset');
  assert.deepEqual(body.metrics, ['events']);
  assert.deepEqual(body.filters, [['is', 'event:goal', ['follow_click', 'support_click']]]);
  assert.deepEqual(body.dimensions, ['event:goal', 'event:props:platform', 'event:props:placement']);
});

test('a Plausible error is reported with its status and never its body', async () => {
  const { fetchImpl } = fakePlausible(401, { error: 'Invalid API key secret-looking-thing' });
  const r = await fetchClickCounts({ apiKey: 'bad', fetchImpl });
  assert.equal(r.status, 'error');
  assert.equal(r.httpStatus, 401);
  assert.equal(JSON.stringify(r).includes('secret-looking-thing'), false);
});

test('a network failure or a malformed body is an error, never a throw', async () => {
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  assert.equal((await fetchClickCounts({ apiKey: 'k', fetchImpl: boom })).status, 'error');
  const { fetchImpl } = fakePlausible(200, { results: 'not-an-array' });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.status, 'error');
  assert.deepEqual(r.rows, []);
});

test('rows with an unexpected shape are skipped rather than trusted', async () => {
  const { fetchImpl } = fakePlausible(200, {
    results: [
      { dimensions: ['follow_click', 'github', 'footer'], metrics: [3] },
      { dimensions: ['follow_click'], metrics: [9] },
      { dimensions: ['follow_click', 'github', 'footer'], metrics: ['nine'] },
    ],
  });
  const r = await fetchClickCounts({ apiKey: 'k', fetchImpl });
  assert.equal(r.rows.length, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/plausible.ts'`.

- [ ] **Step 3: Write `frontend/lib/plausible.ts`**

```ts
export type ClickRow = { event: string; platform: string; placement: string; count: number };
export type ClickCounts = { status: "unconfigured" | "ok" | "error"; httpStatus?: number; rows: ClickRow[] };

const ENDPOINT = "https://plausible.io/api/v2/query";
const DEFAULT_SITE = "sportsdataverse.org"; // app/providers.tsx reports under this domain

/**
 * follow_click / support_click totals by platform and placement, last 91 days,
 * from the Plausible Stats API v2. Never throws. Reports WHY it has no numbers —
 * unconfigured, or the HTTP status Plausible returned — so the tab can say so
 * instead of drawing an empty chart that reads as "nobody clicked". A response
 * body is never passed through: it is third-party text.
 */
export async function fetchClickCounts(deps: { apiKey?: string; siteId?: string; fetchImpl?: typeof fetch }): Promise<ClickCounts> {
  if (!deps.apiKey) return { status: "unconfigured", rows: [] };
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        site_id: deps.siteId || DEFAULT_SITE,
        metrics: ["events"],
        date_range: "91d", // Plausible's preset; there is no "90d"
        filters: [["is", "event:goal", ["follow_click", "support_click"]]],
        dimensions: ["event:goal", "event:props:platform", "event:props:placement"],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: "error", rows: [] };
  }
  if (!res.ok) return { status: "error", httpStatus: res.status, rows: [] };
  let body: { results?: unknown };
  try {
    body = (await res.json()) as { results?: unknown };
  } catch {
    return { status: "error", httpStatus: res.status, rows: [] };
  }
  if (!Array.isArray(body.results)) return { status: "error", httpStatus: res.status, rows: [] };
  const rows: ClickRow[] = [];
  for (const r of body.results as { dimensions?: unknown; metrics?: unknown }[]) {
    const d = r?.dimensions;
    const m = r?.metrics;
    if (!Array.isArray(d) || d.length !== 3 || !d.every((x) => typeof x === "string")) continue;
    if (!Array.isArray(m) || typeof m[0] !== "number") continue;
    rows.push({ event: d[0], platform: d[1], placement: d[2], count: m[0] });
  }
  rows.sort((a, b) => b.count - a.count);
  return { status: "ok", rows };
}
```

- [ ] **Step 4: Document the variables** (`frontend/.env.example`)

```
# Plausible Stats API key, for the follow/support click counts on
# /platform/people's Population tab. Optional: without it that section says
# "not configured". Create it in Plausible → Account settings → API keys (Stats API).
# In the site's settings, follow_click and support_click must exist as custom
# event goals, and platform / placement as custom properties.
PLAUSIBLE_API_KEY=
# Defaults to sportsdataverse.org, the domain app/providers.tsx reports under.
PLAUSIBLE_SITE_ID=
```

- [ ] **Step 5: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 6: Mutation-check**

(a) Change `"91d"` to `"90d"` → the second test must go red. (b) Remove the `if (!deps.apiKey)` line → the first test must go red. (c) Return `{ status: "ok", rows: [] }` on a non-200 → the third test must go red. (d) Drop the `d.length !== 3` check → the fifth test must go red. Restore each, confirm green, report.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/plausible.ts frontend/test/plausible.test.ts frontend/.env.example
git commit -m "feat(people): read follow and support click counts from the Plausible Stats API"
```

---

### Task 7: Population aggregation and its endpoint

**Files:**
- Create: `frontend/lib/population.ts`
- Create: `frontend/test/population.test.ts`
- Create: `frontend/app/api/platform/people/population/route.ts`
- Modify: `frontend/lib/discord.ts` (append `fetchMemberCount`)
- Modify: `frontend/.env.example` (add `DISCORD_GUILD_ID`)

**Interfaces:**
- Consumes: `PersonDoc` (`lib/people.ts`); `fetchClickCounts`, `ClickCounts` (Task 6); `requireMemberApp` (`@lib/platform/auth`).
- Produces: `type Count = { key: string; count: number }`; `type Population` (below); `aggregatePopulation(people: PersonDoc[]): Omit<Population, "passive" | "clicks">`; `loadPopulation(db: Db, deps: { discordBotToken?: string; discordGuildId?: string; plausibleApiKey?: string; plausibleSiteId?: string; fetchImpl?: typeof fetch }): Promise<Population>`; `fetchMemberCount(deps: { botToken?: string; guildId?: string; fetchImpl?: typeof fetch }): Promise<number | null>`.

**Every number is a count.** The endpoint is readable by every org member; it returns aggregates only — never a row, a name, an email or a handle.

- [ ] **Step 1: Write the failing test** (`frontend/test/population.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePopulation } from '../lib/population.ts';
import { fetchMemberCount } from '../lib/discord.ts';

const profile = (o: Record<string, unknown> = {}) => ({
  role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['twitter'], newsChannel: 'email', ...o,
});
const person = (o: Record<string, unknown> = {}) => ({
  status: 'pending', wants: { discord: true, newsletter: true, package: false, stickers: false }, profile: profile(), ...o,
});

test('an empty database aggregates to zeroes and never throws', () => {
  const p = aggregatePopulation([]);
  assert.equal(p.totals.people, 0);
  assert.deepEqual(p.byRole, []);
  assert.deepEqual(p.funnel.discoveredVia, []);
  assert.equal(p.wants.discord, 0);
});

test('people without a profile are counted in the total but not the breakdowns', () => {
  const footerSignup = { status: 'pending', wants: { discord: false, newsletter: true, package: false, stickers: false } };
  const p = aggregatePopulation([footerSignup, person()] as never);
  assert.equal(p.totals.people, 2);
  assert.equal(p.totals.withProfile, 1);
  assert.deepEqual(p.byRole, [{ key: 'developer', count: 1 }]);
});

test('multi-answer questions count every answer, and results sort by count', () => {
  const p = aggregatePopulation([
    person({ profile: profile({ languages: ['R', 'Python'] }) }),
    person({ profile: profile({ languages: ['Python'] }) }),
  ] as never);
  assert.deepEqual(p.byLanguage, [{ key: 'Python', count: 2 }, { key: 'R', count: 1 }]);
});

test('the channel funnel is counted', () => {
  const p = aggregatePopulation([person(), person({ profile: profile({ discoveredVia: 'twitter' }) })] as never);
  assert.deepEqual(p.funnel.discoveredVia.map((c) => c.key).sort(), ['github', 'twitter']);
});

test('no identifying field ever appears in the output', () => {
  const p = aggregatePopulation([person({ email: 'secret@b.co', name: 'Secret Name', githubLogin: 'secretlogin' })] as never);
  const s = JSON.stringify(p);
  for (const leak of ['secret@b.co', 'Secret Name', 'secretlogin']) assert.equal(s.includes(leak), false);
});

test('the Discord member count is null when unconfigured or failing, never an error', async () => {
  assert.equal(await fetchMemberCount({ botToken: undefined, guildId: undefined }), null);
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: boom }), null);
  const ok = (async () => new Response(JSON.stringify({ approximate_member_count: 412 }), { status: 200 })) as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: ok }), 412);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/population.ts'`.

- [ ] **Step 3: Write `frontend/lib/population.ts`**

```ts
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
    if (!n) continue;
    if ("resendContactId" in n) (n.unsubscribed ? nl.unsubscribed++ : nl.synced++);
    else if ("pending" in n) nl.pending++;
    else if ("skipped" in n) nl.skipped++;
  }
  return {
    totals: { people: people.length, withProfile: profiled.length },
    byRole: tally(pf.map((p) => p.role)),
    byLanguage: tally(pf.flatMap((p) => p.languages)),
    bySport: tally(pf.flatMap((p) => p.sports)),
    byStatus: tally(people.map((p) => p.status)),
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
  // project only what is counted — the identifying fields never leave Mongo
  const people = (await db
    .collection("people")
    .find({}, { projection: { status: 1, wants: 1, profile: 1, newsletter: 1 } })
    .toArray()) as unknown as PersonDoc[];
  // both external calls are best-effort and bounded by their own timeouts
  const [clicks, discordMembers] = await Promise.all([
    fetchClickCounts({ apiKey: deps.plausibleApiKey, siteId: deps.plausibleSiteId, fetchImpl: deps.fetchImpl }),
    fetchMemberCount({ botToken: deps.discordBotToken, guildId: deps.discordGuildId, fetchImpl: deps.fetchImpl }),
  ]);
  return { ...aggregatePopulation(people), clicks, passive: { discordMembers } };
}
```

Check the `profile` field names against `Profile` in `lib/survey.ts` (`role`, `languages`, `sports`, `discoveredVia`, `updatesVia`, `newsChannel`) and against `PersonDoc.newsletter`'s union in `lib/people.ts`; if either differs, the source files win.

- [ ] **Step 4: Append `fetchMemberCount` to `frontend/lib/discord.ts`**

```ts
/** Approximate member count for the Population tab. Best-effort and quiet:
 *  null when unconfigured, on any error, or after 5 seconds — a slow Discord
 *  must never hold up the page. */
export async function fetchMemberCount(deps: { botToken?: string; guildId?: string; fetchImpl?: typeof fetch }): Promise<number | null> {
  if (!deps.botToken || !deps.guildId) return null;
  try {
    const res = await (deps.fetchImpl ?? fetch)(`${API}/guilds/${deps.guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${deps.botToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { approximate_member_count?: unknown };
    return typeof body.approximate_member_count === "number" ? body.approximate_member_count : null;
  } catch {
    return null;
  }
}
```

`API` is the base-URL constant already defined at the top of `lib/discord.ts`; confirm its name before using it.

- [ ] **Step 5: Write `frontend/app/api/platform/people/population/route.ts`**

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireMemberApp } from "@lib/platform/auth";
import { loadPopulation } from "@lib/population";

/** Aggregates only — every org member may read it, so it carries counts and
 *  nothing that identifies a person. */
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { db } = await connectToDatabase();
  const population = await loadPopulation(db, {
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordGuildId: process.env.DISCORD_GUILD_ID,
    plausibleApiKey: process.env.PLAUSIBLE_API_KEY,
    plausibleSiteId: process.env.PLAUSIBLE_SITE_ID,
  });
  return NextResponse.json({ population });
}
```

Add to `frontend/.env.example`, beside the other Discord variables:

```
# The Discord server's id, for the member count on /platform/people's Population
# tab. Optional: without it the count shows as unavailable.
DISCORD_GUILD_ID=
```

- [ ] **Step 6: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`, and `/api/platform/people/population` in the route table.

- [ ] **Step 7: Mutation-check**

(a) In `aggregatePopulation`, change `pf.flatMap((p) => p.languages)` to `pf.map((p) => p.languages[0])` → the third test must go red. (b) Add `email: people[0]?.email` to the returned object → the fifth test must go red. (c) Remove the `if (!deps.botToken || !deps.guildId) return null;` line → the last test must go red. Restore each, confirm green, report.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/population.ts frontend/test/population.test.ts "frontend/app/api/platform/people/population/route.ts" frontend/lib/discord.ts frontend/.env.example
git commit -m "feat(people): count who our users are and how they find us"
```

---

### Task 8: The Population tab

**Files:**
- Create: `frontend/app/(platform)/platform/people/PopulationPanel.tsx`
- Modify: `frontend/app/(platform)/platform/people/PeopleClient.tsx`

**Interfaces:**
- Consumes: `GET /api/platform/people/population` → `{ population: Population }` (Task 7); the `Population` type (import it as a type only from `@lib/population` — a type-only import pulls nothing server-side into the client bundle; confirm the build agrees).

UI; `node --test` cannot load it. Verified by the build and by reading.

- [ ] **Step 1: Read the existing tab strip first**

In `PeopleClient.tsx`, find how the Queue / Unsynced / All views are declared and switched. Add `"population"` as a fourth view **the same way** — same button component, same active styling. When it is selected, render `<PopulationPanel />` in place of the people list, and do not fetch the people list.

- [ ] **Step 2: Write `PopulationPanel.tsx`**

No chart library exists in this repo; do not add one. Bars are a `div` whose width is the share of the largest count:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Count, Population } from "@lib/population";

function Bars({ title, counts }: { title: string; counts: Count[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <section className="space-y-2">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide">{title}</h3>
      {counts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No answers yet.</p>
      ) : (
        <ul className="space-y-1">
          {counts.map((c) => (
            <li key={c.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
              <span className="truncate">{c.key}</span>
              <span className="h-2 rounded bg-primary/70" style={{ width: `${(c.count / max) * 100}%` }} aria-hidden />
              <span className="text-right tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PopulationPanel() {
  const [data, setData] = useState<Population | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/people/population")
      .then(async (r) => (r.ok ? ((await r.json()) as { population: Population }).population : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError("Couldn't load the population numbers."));
  }, []);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["People", data.totals.people],
          ["Answered the survey", data.totals.withProfile],
          ["Newsletter (synced)", data.newsletter.synced],
          ["Discord members", data.passive.discordMembers ?? "—"],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-8 md:grid-cols-2">
        <Bars title="First found us via" counts={data.funnel.discoveredVia} />
        <Bars title="Hears about updates via" counts={data.funnel.updatesVia} />
        <Bars title="Wants news delivered by" counts={data.funnel.newsChannel} />
        <Bars title="Role" counts={data.byRole} />
        <Bars title="Language" counts={data.byLanguage} />
        <Bars title="Sport" counts={data.bySport} />
        <Bars title="Status" counts={data.byStatus} />
        <section className="space-y-2">
          {data.clicks.status === "ok" ? (
            <Bars
              title="Follow / support clicks (last 91 days)"
              counts={data.clicks.rows.map((r) => ({ key: `${r.platform} · ${r.placement}`, count: r.count }))}
            />
          ) : (
            <>
              <h3 className="font-display text-sm font-bold uppercase tracking-wide">Follow / support clicks</h3>
              {/* say WHY it is empty — an empty chart would read as "nobody clicked" */}
              <p className="text-sm text-muted-foreground">
                {data.clicks.status === "unconfigured"
                  ? "Not configured — set PLAUSIBLE_API_KEY on Vercel to see these."
                  : `Plausible didn't answer${data.clicks.httpStatus ? ` (HTTP ${data.clicks.httpStatus})` : ""}. Check the API key and the site's goals.`}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
```

Before writing, read one existing platform page for its heading, card and spacing classes and match them — this sketch is a starting point, not the house style.

- [ ] **Step 3: Gates**

Run: `cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && npm run build; echo EXIT=$?`
Expected: all green, `EXIT=0`.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(platform)/platform/people/PopulationPanel.tsx" "frontend/app/(platform)/platform/people/PeopleClient.tsx"
git commit -m "feat(people): Population tab — the channel funnel and who our users are"
```

---

### Task 9: Docs

**Files:**
- Modify: `frontend/SETUP-community.md`
- Modify: `CLAUDE.md`
- Modify: `frontend/static_pages/privacy-policy.mdx`

**Document what the code does, not what this plan says.** Read the merged code from Tasks 1-8 first. If it disagrees with this plan anywhere, the code is what you describe, and you list each disagreement in your report.

- [ ] **Step 1: `SETUP-community.md`** — add a "Package submissions" section: a submission is a `packages` doc with `submittedBy`; it is hidden from every public surface until a member publishes it in `/packages/manage`; `published: false` alone does NOT hide a package in this collection, and `lib/packageVisibility.ts` is the one rule every public reader must use. Add a "Population" section: what it counts, that it is counts only, that `DISCORD_GUILD_ID` is optional and the member count shows "—" without it, and how to switch on the click counts: create a Stats API key in Plausible → Account settings → API keys and set `PLAUSIBLE_API_KEY` on Vercel (then redeploy), and in the Plausible site settings add `follow_click` and `support_click` as custom event goals and `platform` / `placement` as custom properties. Say plainly that until then the tab reports the section as not configured.

- [ ] **Step 2: `CLAUDE.md`** — in the Community line, add the new route (`GET /api/platform/people/population`) and one sentence of the non-obvious rule: **any new public reader of `packages` must filter with `PUBLIC_PACKAGE_FILTER`**, because a bare `find({})` publishes strangers' submissions.

- [ ] **Step 3: `privacy-policy.mdx`** — state that a submitted package's details are stored and shown publicly only if a member approves it. Clicks on follow/support links are already reported to Plausible (unchanged by this PR); if the policy does not yet say that Plausible counts them by platform and placement and never by person, add it. Only claim what the code does.

- [ ] **Step 4: Gate and commit**

Run: `cd frontend && npm run test:lib; echo EXIT=$?` — the count must be unchanged by a docs-only commit.

```bash
git add frontend/SETUP-community.md CLAUDE.md frontend/static_pages/privacy-policy.mdx
git commit -m "docs(community): package submissions, visibility, and the Population tab"
```
