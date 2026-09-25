# Community join flow — PR 2b: Discord admission + the people review queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "I'd like a Discord invite" on `/join` into either an immediate bot-minted invite (for people GitHub already vouches for) or a queued request an admin approves from `/platform/admin/people` — and give that page the two housekeeping actions the live newsletter now needs: retry a failed Resend sync, and delete a person on request.

**Architecture:** A thin Discord REST client (`lib/discord.ts`) mints a 3-use / 7-day channel invite; `lib/review.ts` holds every reviewer decision as pure logic over an injected `db` and `fetch`, exactly like `lib/join.ts`; `people` gains the review fields and the queries the queue reads. Auto-admit is decided from the signed-in viewer (`isOrgMember || isContributor`, both already on the Auth.js JWT after this PR), passed into `handleJoin` by the route — the page stays usable signed-out. Every outbound side effect degrades: no bot token means the decision is still recorded, no `RESEND_FROM` means the invite link is shown to the reviewer instead of emailed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4 + shadcn/ui, Auth.js v5 (GitHub OAuth), zod 3.25, mongodb 6.x, Discord REST v10, Resend REST, `node --test` with type stripping (`npm run test:lib`).

**Spec:** `docs/superpowers/specs/2026-09-18-community-join-flow-design.md` — Flows → Discord admission; Data model → `people`; Pages and routes; Errors; Privacy. The Population tab and package submissions stay in PR 3.

## Global Constraints

- All node commands run from `frontend/`; `legacy-peer-deps` stays in `.npmrc`.
- Relative imports among `lib/*.ts`, `content/*.ts` and from `test/*.ts` carry an explicit `.ts` extension; type-only imports use `import type`. Route and page files use `@lib` / `@components` / `@content` aliases and never a `.ts` suffix.
- `people` is the list of record. Every handler writes the person's state **before** any outbound call, and an outbound failure never fails the request or loses the decision (spec → Errors).
- Invite: `POST https://discord.com/api/v10/channels/{DISCORD_INVITE_CHANNEL_ID}/invites`, header `Authorization: Bot <DISCORD_BOT_TOKEN>`, body `{ "max_uses": 3, "max_age": 604800, "unique": true }`. The bot needs *Create Instant Invite* on that channel only. Invite URL is `https://discord.gg/<code>`.
- Auto-admit signal, exactly as the spec words it: `isOrgMember || isContributor`, where `isContributor` is one call to `GET /search/issues?q=author:{login}+org:sportsdataverse+is:pr+is:merged` with the viewer's own token, `total_count > 0`, cached on the JWT beside `isOrgMember`.
- Statuses: `auto` (admitted without review), `pending` (queued), `approved`, `declined`, `survey`. The queue is `status: "pending"` **and** `wants.discord: true`.
- `people.githubLogin` carries a **unique sparse** index, as does `email`. Two different emails for one GitHub login must not throw a duplicate-key error at a visitor.
- Reviewer identity is `session.login`, stamped as `reviewedBy` with `reviewedAt`; a decline stores `declineReason`.
- The admin area is already gated `session.role === "admin"` by `app/(platform)/platform/admin/layout.tsx`. The People API routes use `requireAdminApp()` to match it. (The spec wrote `requireWriter()` — org member. Matching the existing admin gate is the tighter of the two and is the direction the org-hardening runbook takes; noted in the PR description.)
- Rate limits reuse `allowRequest` from `lib/rateLimit.ts`; `POST /api/join` keeps 5/IP/hour.
- Design adherence: existing tokens/classes and shadcn `Button` / `Input` / `Badge` / `Table` only; `PageHeader` is for public pages, admin panels follow the existing `KeysClient` shape. Sentence case, plain copy (`PRODUCT.md`).
- Every UI change is seen in the four-combination matrix. `/platform/**` is behind GitHub org auth, so the evidence workflow cannot shoot it: evidence routes stay public (`/join /survey`), and the admin screenshots are taken by hand from a signed-in local session and attached to the PR.
- Conventional Commits; **no AI co-author trailers**; explicit paths staged; never commit `img/`.

## Review Focus

1. **`DISCORD_BOT_TOKEN` unset, or Discord answers 403/429** — approve must still record `approved` + `reviewedBy` and tell the reviewer no invite was minted, never 500 and never silently look successful. *(Task 5, "approve survives a Discord failure")*
2. **The same person approved twice** (double-clicked button, or a retry) — must not mint a second invite, must not email twice; the stored unexpired code is reused. *(Task 5, "approving twice reuses the stored invite")*
3. **One GitHub login, two email addresses** — a signed-in member who joined before with another address must not hit the `githubLogin` unique index and 500. *(Task 4, "a second email for the same GitHub login does not collide")*
4. **`RESEND_FROM` unset** (today's production state) — an approved invite cannot be emailed; the code must still be stored and surfaced to the reviewer to send by hand. *(Task 5, "no sender configured still mints and stores the invite")*
5. **A declined person re-submitting `/join`** — the spec re-opens a decline only after 30 days; sooner than that the request must not silently jump back into the queue. *(Task 4, "a recent decline is not re-opened")*

---

### Task 1: Discord invite client

**Files:**
- Create: `frontend/lib/discord.ts`
- Create: `frontend/test/discord.test.ts`

**Interfaces:**
- Produces: `type DiscordDeps = { botToken: string | undefined; channelId: string | undefined; fetchImpl?: typeof fetch }`; `createInvite(deps: DiscordDeps): Promise<{ code: string; expiresAt: Date }>` — throws when either env is missing or Discord answers non-2xx; `inviteUrl(code: string): string`; `INVITE_MAX_USES = 3`; `INVITE_MAX_AGE_SEC = 604800`.

- [ ] **Step 1: Write the failing test**

`frontend/test/discord.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvite, inviteUrl, INVITE_MAX_AGE_SEC, INVITE_MAX_USES } from '../lib/discord.ts';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('mints a 3-use, 7-day invite on the configured channel', async () => {
  const expires = new Date(Date.now() + INVITE_MAX_AGE_SEC * 1000).toISOString();
  const { fetchImpl, calls } = fakeFetch(200, { code: 'abc123', expires_at: expires });
  const r = await createInvite({ botToken: 'tok', channelId: '42', fetchImpl });
  assert.equal(r.code, 'abc123');
  assert.equal(r.expiresAt.toISOString(), expires);
  assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/42/invites');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bot tok');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { max_uses: INVITE_MAX_USES, max_age: INVITE_MAX_AGE_SEC, unique: true });
});

test('falls back to a computed expiry when Discord omits expires_at', async () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const { fetchImpl } = fakeFetch(200, { code: 'abc123' });
  const r = await createInvite({ botToken: 'tok', channelId: '42', fetchImpl, now: () => now } as never);
  assert.equal(r.expiresAt.getTime(), now.getTime() + INVITE_MAX_AGE_SEC * 1000);
});

test('missing configuration and Discord errors throw with a usable message', async () => {
  await assert.rejects(createInvite({ botToken: undefined, channelId: '42' }), /DISCORD_BOT_TOKEN/);
  await assert.rejects(createInvite({ botToken: 'tok', channelId: undefined }), /DISCORD_INVITE_CHANNEL_ID/);
  const denied = fakeFetch(403, { message: 'Missing Permissions', code: 50013 });
  await assert.rejects(createInvite({ botToken: 'tok', channelId: '42', fetchImpl: denied.fetchImpl }), /Discord 403/);
  const empty = fakeFetch(200, {});
  await assert.rejects(createInvite({ botToken: 'tok', channelId: '42', fetchImpl: empty.fetchImpl }), /no invite code/);
});

test('inviteUrl builds the public join link', () => {
  assert.equal(inviteUrl('abc123'), 'https://discord.gg/abc123');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/discord.ts'`

- [ ] **Step 3: Implement**

`frontend/lib/discord.ts`:

```ts
/**
 * Discord invite minting. One endpoint, one shape: a 3-use, 7-day invite on a
 * single welcome channel, so the bot needs only *Create Instant Invite* there.
 * No invite link is ever public — every code is minted for one person.
 * Docs: https://discord.com/developers/docs/resources/channel#create-channel-invite
 */
const API = "https://discord.com/api/v10";

export const INVITE_MAX_USES = 3; // a couple of spare uses: people mis-click, links get re-opened
export const INVITE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export type DiscordDeps = {
  botToken: string | undefined;
  channelId: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export function inviteUrl(code: string): string {
  return `https://discord.gg/${code}`;
}

export async function createInvite(deps: DiscordDeps): Promise<{ code: string; expiresAt: Date }> {
  if (!deps.botToken) throw new Error("DISCORD_BOT_TOKEN is not set");
  if (!deps.channelId) throw new Error("DISCORD_INVITE_CHANNEL_ID is not set");
  const res = await (deps.fetchImpl ?? fetch)(`${API}/channels/${deps.channelId}/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bot ${deps.botToken}` },
    body: JSON.stringify({ max_uses: INVITE_MAX_USES, max_age: INVITE_MAX_AGE_SEC, unique: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { code?: unknown; expires_at?: unknown };
  if (typeof body.code !== "string" || !body.code) throw new Error("Discord response had no invite code");
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt =
    typeof body.expires_at === "string" ? new Date(body.expires_at) : new Date(now.getTime() + INVITE_MAX_AGE_SEC * 1000);
  return { code: body.code, expiresAt };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 52` (48 existing + 4), `# fail 0`

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/discord.ts frontend/test/discord.test.ts
git commit -m "feat(discord): invite client — 3 uses, 7 days, one welcome channel"
```

---

### Task 2: `people` — review fields, queue queries, transitions

**Files:**
- Modify: `frontend/lib/people.ts`
- Modify: `frontend/test/people.test.ts` (append)

**Interfaces:**
- Consumes: `PersonDoc`, `PersonId`, `people(db)` (existing).
- Produces: `PersonDoc` gains `discord?: { code: string; expiresAt: Date; invitedAt: Date }`, `reviewedBy?: string`, `reviewedAt?: Date`, `declineReason?: string`; `listPeople(db, filter: { status?: PersonDoc["status"]; wantsDiscord?: boolean; limit?: number }): Promise<PersonDoc[]>` (newest first, hard cap 200); `setReviewStatus(db, personId, status: "approved" | "declined" | "auto", by: string | null, now?: Date, declineReason?: string): Promise<void>`; `recordDiscordInvite(db, personId, invite: { code: string; expiresAt: Date }, now?: Date): Promise<void>`; `linkGithubLogin(db, personId, login: string): Promise<boolean>` (false when the login already belongs to another person — never throws); `listUnsyncedNewsletter(db, limit?): Promise<PersonDoc[]>`; `deletePerson(db, personId): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/people.test.ts`)

```ts
import {
  listPeople, setReviewStatus, recordDiscordInvite, linkGithubLogin,
  listUnsyncedNewsletter, deletePerson,
} from '../lib/people.ts';

const PROFILE2 = { role: 'student', languages: ['Python'], sports: ['NBA'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as const;

test('the queue lists pending people who asked for Discord, newest first', async () => {
  const { db } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T1);
  const queue = await listPeople(db, { status: 'pending', wantsDiscord: true });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].email, 'a@b.co');
});

test('a review stamps who decided, when, and why', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  await setReviewStatus(db, personId, 'declined', 'saiemgilani', T1, 'no vouch');
  const [p] = dump('people');
  assert.equal(p.status, 'declined');
  assert.equal(p.reviewedBy, 'saiemgilani');
  assert.equal((p.reviewedAt as Date).getTime(), T1.getTime());
  assert.equal(p.declineReason, 'no vouch');
});

test('an invite is stored with its expiry', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  const expiresAt = new Date(T1.getTime() + 604800_000);
  await recordDiscordInvite(db, personId, { code: 'abc123', expiresAt }, T1);
  const d = dump('people')[0].discord as { code: string; expiresAt: Date; invitedAt: Date };
  assert.equal(d.code, 'abc123');
  assert.equal(d.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(d.invitedAt.getTime(), T1.getTime());
});

test('a github login is linked once and never stolen from another person', async () => {
  const { db } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  const b = await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: true } }, T0);
  assert.equal(await linkGithubLogin(db, a.personId, 'octocat'), true);
  assert.equal(await linkGithubLogin(db, a.personId, 'octocat'), true, 'idempotent for the same person');
  assert.equal(await linkGithubLogin(db, b.personId, 'octocat'), false, 'already someone else');
});

test('unsynced newsletter people are listed, and a person can be deleted', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: true, discord: false } }, T0);
  await upsertJoin(db, { email: 'c@d.co', answers: {}, profile: PROFILE2 as never, wants: { newsletter: false, discord: false } }, T0);
  const unsynced = await listUnsyncedNewsletter(db);
  assert.deepEqual(unsynced.map((p) => p.email), ['a@b.co']);
  assert.equal(await deletePerson(db, a.personId), true);
  assert.equal(dump('people').length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `listPeople` is not exported

- [ ] **Step 3: Implement** — in `frontend/lib/people.ts`

Extend the `PersonDoc` type (keep every existing field) with:

```ts
  /** the invite this person was given; a code is reused until it expires */
  discord?: { code: string; expiresAt: Date; invitedAt: Date };
  reviewedBy?: string;
  reviewedAt?: Date;
  declineReason?: string;
```

Append these functions:

```ts
const REVIEW_LIST_CAP = 200;

export async function listPeople(
  db: Db,
  filter: { status?: PersonDoc["status"]; wantsDiscord?: boolean; limit?: number } = {}
): Promise<PersonDoc[]> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.wantsDiscord !== undefined) q["wants.discord"] = filter.wantsDiscord;
  return people(db)
    .find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit ?? 50, REVIEW_LIST_CAP))
    .toArray();
}

export async function setReviewStatus(
  db: Db,
  personId: PersonId,
  status: "approved" | "declined" | "auto",
  by: string | null,
  now: Date = new Date(),
  declineReason?: string
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    {
      $set: {
        status,
        reviewedAt: now,
        updatedAt: now,
        ...(by ? { reviewedBy: by } : {}),
        ...(declineReason ? { declineReason } : {}),
      },
    }
  );
}

export async function recordDiscordInvite(
  db: Db,
  personId: PersonId,
  invite: { code: string; expiresAt: Date },
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    { $set: { discord: { code: invite.code, expiresAt: invite.expiresAt, invitedAt: now }, updatedAt: now } }
  );
}

/**
 * Attach a GitHub login to a person. `githubLogin` is unique+sparse, so the
 * same login on a second person is a conflict, not an error a visitor should
 * ever see: this reports it instead of throwing.
 */
export async function linkGithubLogin(db: Db, personId: PersonId, login: string): Promise<boolean> {
  const owner = await people(db).findOne({ githubLogin: login });
  if (owner && String(owner._id) !== String(personId)) return false;
  if (owner) return true;
  await people(db).updateOne({ _id: personId }, { $set: { githubLogin: login } });
  return true;
}

/** People who want the newsletter but have no Resend contact yet (failed sync, or never tried). */
export async function listUnsyncedNewsletter(db: Db, limit = 50): Promise<PersonDoc[]> {
  const all = await people(db).find({ "wants.newsletter": true }).sort({ createdAt: -1 }).limit(REVIEW_LIST_CAP).toArray();
  return all.filter((p) => !(p.newsletter && "resendContactId" in p.newsletter)).slice(0, limit);
}

export async function deletePerson(db: Db, personId: PersonId): Promise<boolean> {
  const res = await people(db).deleteOne({ _id: personId });
  return res.deletedCount === 1;
}
```

`frontend/test/fakeDb.ts` needs `find().sort().limit().toArray()` and `deleteOne`. Inside the object returned by `collection(name)` add:

```ts
        find(filter: Doc = {}) {
          let out = rows(name).filter((d) => matches(d, filter));
          const api = {
            sort(spec: Record<string, 1 | -1>) {
              const [[key, dir]] = Object.entries(spec);
              out = [...out].sort((a, b) => {
                const av = Number(a[key] instanceof Date ? (a[key] as Date).getTime() : a[key] ?? 0);
                const bv = Number(b[key] instanceof Date ? (b[key] as Date).getTime() : b[key] ?? 0);
                return dir === 1 ? av - bv : bv - av;
              });
              return api;
            },
            limit(n: number) { out = out.slice(0, n); return api; },
            async toArray() { return out; },
          };
          return api;
        },
        async deleteOne(filter: Doc) {
          const list = rows(name);
          const i = list.findIndex((d) => matches(d, filter));
          if (i < 0) return { deletedCount: 0 };
          list.splice(i, 1);
          return { deletedCount: 1 };
        },
```

`matches()` compares with `String()`, so a dotted filter key like `wants.discord` will not match a nested value. Extend `matches` to read dotted paths with the existing `getPath` helper:

```ts
function matches(doc: Doc, filter: Doc) {
  return Object.entries(filter).every(([k, v]) => String(k.includes('.') ? getPath(doc, k) : doc[k]) === String(v));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 57` (52 + 5), `# fail 0`

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/people.ts frontend/test/people.test.ts frontend/test/fakeDb.ts
git commit -m "feat(people): review fields, queue queries, github-login linking that cannot collide"
```

---

### Task 3: `isContributor` on the session

**Files:**
- Modify: `frontend/lib/auth.ts`
- Modify: `frontend/types/next-auth.d.ts` (the Session/JWT augmentation — `isOrgMember` is declared there, not in `global.d.ts`)
- Create: `frontend/test/contributor.test.ts`

**Interfaces:**
- Produces: `fetchIsContributor(accessToken: string, fetchImpl?: typeof fetch): Promise<boolean>` exported from `lib/auth.ts`; `session.isContributor` and `token.isContributor` (boolean, default false), refreshed on the same TTL as the membership check.

- [ ] **Step 1: Write the failing test**

`frontend/test/contributor.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchIsContributor } from '../lib/auth.ts';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('one merged PR in the org makes someone a contributor', async () => {
  const { fetchImpl, calls } = fakeFetch(200, { total_count: 2 });
  assert.equal(await fetchIsContributor('gho_x', fetchImpl), true);
  assert.match(calls[0].url, /search\/issues/);
  assert.match(decodeURIComponent(calls[0].url), /org:sportsdataverse/);
  assert.match(decodeURIComponent(calls[0].url), /is:pr/);
  assert.match(decodeURIComponent(calls[0].url), /is:merged/);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer gho_x');
});

test('no merged PRs, and any API failure, read as not a contributor', async () => {
  assert.equal(await fetchIsContributor('gho_x', fakeFetch(200, { total_count: 0 }).fetchImpl), false);
  assert.equal(await fetchIsContributor('gho_x', fakeFetch(403, { message: 'rate limited' }).fetchImpl), false);
  const boom = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  assert.equal(await fetchIsContributor('gho_x', boom), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `fetchIsContributor` is not exported

- [ ] **Step 3: Implement** — in `frontend/lib/auth.ts`

Add beside `fetchOrgMembership`:

```ts
/**
 * Has this person landed a merged PR anywhere in the org? One search call with
 * the viewer's own token, cached on the JWT next to the membership check. Any
 * failure reads false: this only ever *skips* the review queue, so a wrong
 * false costs a queue entry while a wrong true admits a stranger.
 */
export async function fetchIsContributor(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const q = encodeURIComponent(`org:${SDV_ORG} is:pr is:merged author:@me`);
  try {
    const res = await fetchImpl(`https://api.github.com/search/issues?q=${q}&per_page=1`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { total_count?: unknown };
    return typeof data.total_count === "number" && data.total_count > 0;
  } catch {
    return false;
  }
}
```

In the `jwt` callback, inside the same `if (token.accessToken && (isInitialSignIn || isStale))` block that refreshes membership, after `token.role = role;` add:

```ts
        token.isContributor = isMember || (await fetchIsContributor(token.accessToken));
```

and in the `session` callback beside `session.isOrgMember = …` add:

```ts
      session.isContributor = token.isContributor ?? false;
```

Declare both in `frontend/types/next-auth.d.ts` next to the existing `isOrgMember` declarations (the `Session` and `JWT` module augmentations), as `isContributor?: boolean`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 59` (57 + 2), `# fail 0`

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/auth.ts frontend/types/next-auth.d.ts frontend/test/contributor.test.ts
git commit -m "feat(auth): carry isContributor (a merged org PR) on the session"
```

---

### Task 4: `/join` admits or queues a Discord request

**Files:**
- Modify: `frontend/lib/join.ts`
- Modify: `frontend/lib/email.ts`
- Modify: `frontend/app/api/join/route.ts`
- Modify: `frontend/test/join.test.ts` (append)

**Interfaces:**
- Consumes: `createInvite`, `inviteUrl` (Task 1); `setReviewStatus`, `recordDiscordInvite`, `linkGithubLogin` (Task 2); `session.isOrgMember`/`isContributor`/`login` (Task 3).
- Produces: `JoinDeps` gains `viewer?: { login: string; isOrgMember: boolean; isContributor: boolean } | null`, `discordBotToken?: string`, `discordChannelId?: string`; `lib/email.ts` gains `discordInviteEmail(url: string): { subject; html; text }`; `handleJoin`'s returned message covers the Discord outcome.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/join.test.ts`)

```ts
const D_ANSWERS = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord',
  dataTypes: ['pbp'], packages_r: ['cfbfastR'],
  wants_newsletter: 'no', wants_discord: 'yes',
};

function discordFake() {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).includes('discord.com')) {
      return new Response(JSON.stringify({ code: 'inv123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const discordEnv = { discordBotToken: 'tok', discordChannelId: '42' };

test('an org member asking for Discord is admitted on the spot', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/);
  const [p] = dump('people');
  assert.equal(p.status, 'auto');
  assert.equal(p.githubLogin, 'octocat');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('a stranger asking for Discord is queued, and no invite is minted', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null,
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /review/i);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 0);
  const [p] = dump('people');
  assert.equal(p.status, 'pending');
  assert.equal(p.discord, undefined);
});

test('a second email for the same GitHub login does not collide', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  await handleJoin({ email: 'first@b.co', answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  const r = await handleJoin({ email: 'second@b.co', answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  assert.equal(r.status, 200, 'the second address must not 500 on the unique login index');
  assert.equal(dump('people').length, 2);
  assert.equal(dump('people').filter((p) => p.githubLogin === 'octocat').length, 1);
});

test('a recent decline is not re-opened by re-submitting', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null };
  await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', deps);
  const personId = (dump('people')[0] as { _id: unknown })._id;
  await setReviewStatus(db, personId as never, 'declined', 'saiemgilani', new Date(), 'no vouch');
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'declined', 'still declined, not back in the queue');
});

test('Discord failing does not fail the request or lose the person', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) return new Response('{"message":"Missing Permissions"}', { status: 403 });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl, ...discordEnv, log: (m) => logs.push(m),
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'auto');
  assert.equal(dump('people')[0].discord, undefined);
  assert.match(logs.join(' '), /discord invite failed/);
});
```

Add `setReviewStatus` to the existing `../lib/people.ts` import line in this test file.

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — the Discord branch does not exist; `status` stays `pending` and no invite is minted for a member

- [ ] **Step 3: Add the invite email** — in `frontend/lib/email.ts`, beside `confirmEmail`:

```ts
export function discordInviteEmail(url: string): { subject: string; html: string; text: string } {
  const safe = esc(url);
  return {
    subject: "Your SportsDataverse Discord invite",
    html: `<p>You're in. This link adds you to the SportsDataverse Discord:</p>
<p><a href="${safe}">${safe}</a></p>
<p>It works for 7 days and a few uses, so don't share it around — ask us for another if someone else needs one.</p>
<p>— SportsDataverse</p>`,
    text: `You're in. This link adds you to the SportsDataverse Discord:\n\n${url}\n\nIt works for 7 days and a few uses, so don't share it around — ask us for another if someone else needs one.\n\n— SportsDataverse`,
  };
}
```

- [ ] **Step 4: Implement the join branch** — in `frontend/lib/join.ts`

Extend `JoinDeps`:

```ts
  /** the signed-in visitor, when there is one: the only source of auto-admit */
  viewer?: { login: string; isOrgMember: boolean; isContributor: boolean } | null;
  discordBotToken?: string;
  discordChannelId?: string;
```

Add the messages beside the existing ones:

```ts
const QUEUED_MSG = "Thanks — a member will review your Discord request and email you.";
const INVITE_FAILED_MSG = "You're approved for Discord, but we couldn't mint an invite just now. We'll email you one shortly.";
```

Add this helper above `handleJoin`:

```ts
/**
 * Discord half of a join. Someone GitHub already vouches for (an org member, or
 * anyone with a merged PR in the org) is admitted immediately; everyone else is
 * queued for a member to review. A Discord outage never costs us the person:
 * the decision is stored first and only the invite is retried later.
 */
async function admitOrQueue(
  deps: JoinDeps,
  personId: PersonId,
  email: string,
  existingStatus: PersonDoc["status"] | undefined
): Promise<string> {
  const now = nowOf(deps);
  const viewer = deps.viewer ?? null;
  if (viewer) await linkGithubLogin(deps.db, personId, viewer.login);

  // a decision already taken stands: re-submitting is not an appeal
  if (existingStatus === "declined" || existingStatus === "approved" || existingStatus === "auto") {
    return existingStatus === "declined" ? QUEUED_MSG : CONFIRMED_DISCORD_MSG;
  }

  const vouched = Boolean(viewer && (viewer.isOrgMember || viewer.isContributor));
  if (!vouched) {
    await setReviewStatus(deps.db, personId, "pending" as never, null, now);
    return QUEUED_MSG;
  }

  await setReviewStatus(deps.db, personId, "auto", viewer!.login, now);
  try {
    const invite = await createInvite({
      botToken: deps.discordBotToken,
      channelId: deps.discordChannelId,
      fetchImpl: deps.fetchImpl,
      now: () => now,
    });
    await recordDiscordInvite(deps.db, personId, invite, now);
    const url = inviteUrl(invite.code);
    if (deps.resendFrom) {
      try {
        await sendEmail({ from: deps.resendFrom, to: email, ...discordInviteEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
      } catch (e) {
        deps.log?.(`discord invite email failed for person ${String(personId)}: ${(e as Error).message}`);
      }
    }
    return `You're in — here's your Discord invite: ${url}`;
  } catch (e) {
    deps.log?.(`discord invite failed for person ${String(personId)}: ${(e as Error).message}`);
    return INVITE_FAILED_MSG;
  }
}
```

Add `const CONFIRMED_DISCORD_MSG = "You're already on the list for Discord — check your email for the invite.";` beside the other messages.

`setReviewStatus`'s type only allows `approved | declined | auto`; the `pending` call above uses `as never` to reuse the same stamp. Replace that: widen `setReviewStatus`'s `status` parameter in `lib/people.ts` to `PersonDoc["status"]` and drop the `as never` here.

In `handleJoin`, the upsert already returns `newsletter`; also take the existing status. Change the `upsertJoin` call site to read it back:

```ts
  const existing = answers && profile ? await findPersonByEmail(deps.db, email) : null;
```

Add to `lib/people.ts`:

```ts
export async function findPersonByEmail(db: Db, email: string): Promise<PersonDoc | null> {
  return people(db).findOne({ email });
}
```

Then, after the newsletter message is computed, add the Discord half and join the two messages:

```ts
  const parts = [message];
  if (wants.discord) parts.push(await admitOrQueue(deps, personId, email, existing?.status));
  return { status: 200, body: { success: true, message: parts.filter(Boolean).join(" ") } };
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 64` (59 + 5), `# fail 0`

- [ ] **Step 6: Wire the route** — `frontend/app/api/join/route.ts`, before the `handleJoin` call:

```ts
  const session = await auth();
  const viewer = session?.login
    ? { login: session.login, isOrgMember: Boolean(session.isOrgMember), isContributor: Boolean(session.isContributor) }
    : null;
```

(import `auth` from `@lib/auth`) and pass into the deps object:

```ts
    viewer,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_INVITE_CHANNEL_ID,
```

In `frontend/.env.example`, after the `RESEND_FROM` block:

```
# Discord admission. The bot needs only "Create Instant Invite" on the welcome
# channel; invites are minted per person (3 uses, 7 days) and never published.
DISCORD_BOT_TOKEN=
DISCORD_INVITE_CHANNEL_ID=
```

- [ ] **Step 7: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint && npm run test:lib`

```bash
git add frontend/lib/join.ts frontend/lib/people.ts frontend/lib/email.ts frontend/test/join.test.ts frontend/app/api/join/route.ts frontend/.env.example
git commit -m "feat(join): admit vouched members to Discord on the spot, queue everyone else"
```

---

### Task 5: Reviewer decisions as pure logic

**Files:**
- Create: `frontend/lib/review.ts`
- Create: `frontend/test/review.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4 (`createInvite`, `inviteUrl`, `setReviewStatus`, `recordDiscordInvite`, `deletePerson`, `listUnsyncedNewsletter`, `findPersonById`, `subscribeToResend`, `contactProperties`, `markNewsletterSynced`, `sendEmail`, `discordInviteEmail`).
- Produces: `type ReviewDeps = { db: Db; reviewer: string; resendApiKey?: string; resendFrom?: string; discordBotToken?: string; discordChannelId?: string; fetchImpl?: typeof fetch; now?: () => Date; log?: (m: string) => void }`; `approve(deps, personId): Promise<{ ok: boolean; inviteUrl?: string; emailed: boolean; message: string }>`; `decline(deps, personId, reason: string, notify: boolean): Promise<{ ok: boolean; message: string }>`; `resendInvite(deps, personId)` (same shape as `approve`); `retrySync(deps, personId): Promise<{ ok: boolean; message: string }>`; `removePerson(deps, personId): Promise<{ ok: boolean; message: string }>`.

- [ ] **Step 1: Write the failing tests**

`frontend/test/review.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertJoin, recordDiscordInvite, findPersonById } from '../lib/people.ts';
import { approve, decline, resendInvite, retrySync, removePerson } from '../lib/review.ts';

const T0 = new Date('2026-09-24T12:00:00Z');
const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'email' } as const;

async function queued(db: ReturnType<typeof fakeDb>['db'], wants = { newsletter: false, discord: true }) {
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE as never, wants }, T0);
  return personId;
}
function fakeNet(discordStatus = 200, emailStatus = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url); calls.push(u);
    if (u.includes('discord.com')) return new Response(JSON.stringify({ code: 'inv123' }), { status: discordStatus, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/emails')) return new Response(JSON.stringify({ id: 'em-1' }), { status: emailStatus, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const env = { discordBotToken: 'tok', discordChannelId: '42', resendApiKey: 'k', reviewer: 'saiemgilani', now: () => T0 };

test('approve mints an invite, stores it, emails it, and stamps the reviewer', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await approve({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(r.emailed, true);
  const [p] = dump('people');
  assert.equal(p.status, 'approved');
  assert.equal(p.reviewedBy, 'saiemgilani');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('no sender configured still mints and stores the invite', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal(r.emailed, false);
  assert.match(r.message, /send it yourself/i);
  assert.equal((dump('people')[0].discord as { code: string }).code, 'inv123');
  assert.equal(net.calls.filter((u) => u.endsWith('/emails')).length, 0);
});

test('approve survives a Discord failure: the decision stands, the invite does not', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet(403);
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /Discord 403/);
  assert.equal(dump('people')[0].status, 'approved', 'the reviewer decision is recorded regardless');
  assert.equal(dump('people')[0].discord, undefined);
});

test('approving twice reuses the stored invite instead of minting another', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  const again = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(again.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1, 'only one mint');
});

test('an expired stored invite is replaced on resend', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  await recordDiscordInvite(db, id, { code: 'old', expiresAt: new Date(T0.getTime() - 1000) }, T0);
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1);
});

test('decline records the reason and only emails when asked', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const quiet = fakeNet();
  await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: quiet.fetchImpl }, id, 'no vouch', false);
  assert.equal(dump('people')[0].status, 'declined');
  assert.equal(dump('people')[0].declineReason, 'no vouch');
  assert.equal(quiet.calls.filter((u) => u.endsWith('/emails')).length, 0);
  const loud = fakeNet();
  await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: loud.fetchImpl }, id, 'no vouch', true);
  assert.equal(loud.calls.filter((u) => u.endsWith('/emails')).length, 1);
});

test('retrySync creates the missing Resend contact; removePerson erases the record', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal((dump('people')[0].newsletter as { resendContactId: string }).resendContactId, 'c-1');
  assert.equal((await removePerson({ db, ...env, fetchImpl: net.fetchImpl }, id)).ok, true);
  assert.equal(dump('people').length, 0);
  assert.equal(await findPersonById(db, String(id)), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/review.ts'`

- [ ] **Step 3: Implement**

`frontend/lib/review.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 71` (64 + 7), `# fail 0`

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/review.ts frontend/test/review.test.ts
git commit -m "feat(review): approve, decline, resend, retry-sync and delete as pure logic"
```

---

### Task 6: The People tab

**Files:**
- Create: `frontend/app/api/platform/admin/people/route.ts`
- Create: `frontend/app/api/platform/admin/people/[id]/[action]/route.ts`
- Create: `frontend/app/(platform)/platform/admin/people/page.tsx`
- Create: `frontend/app/(platform)/platform/admin/people/PeopleClient.tsx`
- Modify: `frontend/app/(platform)/platform/admin/AdminTabs.tsx`

**Interfaces:**
- Consumes: `listPeople`, `listUnsyncedNewsletter` (Task 2); `approve`, `decline`, `resendInvite`, `retrySync`, `removePerson` (Task 5); `requireAdminApp` from `@lib/platform/auth`; `connectToDatabase` from `@lib/mongodb`.
- Produces: `GET /api/platform/admin/people?view=queue|unsynced|all` → `{ people: PersonRow[] }` where `PersonRow = { id, email, name, githubLogin, status, wantsDiscord, wantsNewsletter, newsletterState: "synced" | "pending" | "skipped" | "none", discordCode, createdAt, reviewedBy, declineReason }`; `POST /api/platform/admin/people/[id]/[action]` with `action ∈ approve | decline | resend | retry-sync | delete`, body `{ reason?, notify? }` → `{ success, message, inviteUrl? }`.

- [ ] **Step 1: The list route**

`frontend/app/api/platform/admin/people/route.ts`:

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { listPeople, listUnsyncedNewsletter, type PersonDoc } from "@lib/people";

/** The review queue. Admin-only: the admin layout gates the page the same way. */
function row(p: PersonDoc) {
  const n = p.newsletter;
  const newsletterState = !n ? "none" : "resendContactId" in n ? "synced" : "pending" in n ? "pending" : "skipped";
  return {
    id: String(p._id),
    email: p.email ?? null,
    name: p.name ?? null,
    githubLogin: p.githubLogin ?? null,
    status: p.status,
    wantsDiscord: Boolean(p.wants?.discord),
    wantsNewsletter: Boolean(p.wants?.newsletter),
    newsletterState,
    discordCode: p.discord?.code ?? null,
    createdAt: p.createdAt,
    reviewedBy: p.reviewedBy ?? null,
    declineReason: p.declineReason ?? null,
  };
}

export async function GET(req: Request) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const view = new URL(req.url).searchParams.get("view") ?? "queue";
  const { db } = await connectToDatabase();
  const people =
    view === "unsynced"
      ? await listUnsyncedNewsletter(db)
      : view === "all"
        ? await listPeople(db, { limit: 200 })
        : await listPeople(db, { status: "pending", wantsDiscord: true });
  return NextResponse.json({ people: people.map(row) });
}
```

- [ ] **Step 2: The action route**

`frontend/app/api/platform/admin/people/[id]/[action]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { approve, decline, removePerson, resendInvite, retrySync, type ReviewDeps } from "@lib/review";

const ACTIONS = new Set(["approve", "decline", "resend", "retry-sync", "delete"]);
type Ctx = { params: Promise<{ id: string; action: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  const { id, action } = await ctx.params;
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400 });

  const { db } = await connectToDatabase();
  const deps: ReviewDeps = {
    db,
    reviewer: session.login ?? "admin",
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_INVITE_CHANNEL_ID,
    log: (m) => console.warn(m),
  };
  const personId = new ObjectId(id);
  const body = (await req.json().catch(() => ({}))) as { reason?: string; notify?: boolean };

  const result =
    action === "approve" ? await approve(deps, personId)
    : action === "resend" ? await resendInvite(deps, personId)
    : action === "decline" ? await decline(deps, personId, (body.reason ?? "").slice(0, 300) || "No reason given", Boolean(body.notify))
    : action === "retry-sync" ? await retrySync(deps, personId)
    : await removePerson(deps, personId);

  return NextResponse.json({ success: result.ok, message: result.message, ...("inviteUrl" in result ? { inviteUrl: result.inviteUrl } : {}) });
}
```

`requireAdminApp()` returns `{ session, deny }` with `session.login` typed (`lib/platform/auth.ts:84-100`), so `session.login ?? "admin"` is the reviewer stamp — no extra `auth()` call.

- [ ] **Step 3: The page and client**

`frontend/app/(platform)/platform/admin/people/page.tsx`:

```tsx
import type { Metadata } from "next";
import PeopleClient from "./PeopleClient";

export const metadata: Metadata = { title: "People" };

export default function PlatformAdminPeoplePage() {
  return <PeopleClient />;
}
```

`frontend/app/(platform)/platform/admin/people/PeopleClient.tsx`: a client component that

- holds `view` state (`queue` | `unsynced` | `all`) rendered as three buttons using the existing `Button` `variant="outline"` / default pattern,
- fetches `/api/platform/admin/people?view=<view>` on mount and after every action,
- renders a table (shadcn `Table`) with columns: Person (name + email + `@githubLogin`), Wants (Badges for Discord / Newsletter), Status (Badge), Newsletter (the `newsletterState`), Joined (`toLocaleDateString`), Actions,
- per row shows: **Approve** and **Decline** for `status === "pending"`; **Resend invite** when `discordCode` is set or status is `approved`/`auto`; **Retry sync** when `newsletterState !== "synced"` and `wantsNewsletter`; **Delete** always, behind a `confirm()`,
- Decline opens a one-line `Input` for the reason plus a "notify them" checkbox, then posts,
- shows the returned `message` in a `role="status"` line, and when `inviteUrl` comes back renders it as selectable text with a copy button (`navigator.clipboard.writeText`), because with no `RESEND_FROM` the reviewer sends it by hand.

Keep it one file, no new dependency, and reuse `Badge`, `Button`, `Input`, `Table` from `@components/ui`.

- [ ] **Step 4: Add the tab** — in `frontend/app/(platform)/platform/admin/AdminTabs.tsx` add after `Keys`:

```tsx
  { href: "/platform/admin/people", label: "People" },
```

- [ ] **Step 5: Verify against a real database**

Start a throwaway Mongo and the dev server, sign in, and drive the page:

```bash
docker run -d --name sdv-2b-mongo -p 127.0.0.1:27017:27017 mongo:7
cd frontend && npm run dev > /tmp/dev2b.log 2>&1 &
```
Seed one queued person through the public form so the data is real, not hand-written:

```bash
curl -s -X POST http://localhost:3000/api/join -H 'content-type: application/json' \
  -d '{"email":"queued@example.com","answers":{"role":"developer","languages":["R"],"sports":["CFB"],"discoveredVia":"github","updatesVia":["github"],"newsChannel":"discord","dataTypes":["pbp"],"wants_newsletter":"no","wants_discord":"yes"}}'
```
Then open `http://localhost:3000/platform/admin/people` signed in as an org admin and confirm the row appears under Queue, that **Decline** records a reason, and that **Approve** reports the Discord failure honestly when `DISCORD_BOT_TOKEN` is unset (that is the expected local state). Take the four-combination screenshots of the page by hand (`npm run visual-check` cannot sign in) and keep them for the PR. Stop the server with `pkill -f "[n]ext dev"` and remove the container with `docker rm -f sdv-2b-mongo`.

- [ ] **Step 6: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint && npm run test:lib`

```bash
git add frontend/app/api/platform/admin/people frontend/app/\(platform\)/platform/admin/people frontend/app/\(platform\)/platform/admin/AdminTabs.tsx
git commit -m "feat(admin): People tab — review queue, unsynced newsletter, delete on request"
```

---

### Task 7: Docs and the gate

**Files:**
- Modify: `frontend/SETUP-community.md`
- Modify: `frontend/static_pages/privacy-policy.mdx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Setup doc** — add to `frontend/SETUP-community.md` after the Survey section:

```md
## Discord admission

1. discord.com/developers → New Application → Bot → copy the token into `DISCORD_BOT_TOKEN`.
2. Invite the bot to the server with the `bot` scope and **Create Instant Invite** only.
3. In the server, pick the channel newcomers should land in; copy its id (Developer Mode →
   right-click the channel → Copy Channel ID) into `DISCORD_INVITE_CHANNEL_ID`.
4. Give the bot *Create Instant Invite* on that one channel, nothing else.

Invites are minted per person — 3 uses, 7 days, `unique: true` — so no invite link is ever
public. Someone who is an org member, or who has a merged PR anywhere in the
`sportsdataverse` org, is admitted the moment they ask (`status: "auto"`); everyone else is
queued at `/platform/admin/people` for an admin to approve or decline.

Without `DISCORD_BOT_TOKEN` the request is still recorded and the reviewer still decides —
only the invite is missing, and the page says so. Without `RESEND_FROM` the invite is minted
and shown to the reviewer to send by hand.

## Reviewing people

`/platform/admin/people` (org admins only) has three views:

- **Queue** — pending Discord requests. Approve mints and emails the invite; Decline stores a
  reason and only emails when you tick "notify".
- **Unsynced** — people who want the newsletter but have no Resend contact (a failed sync, or
  a signup from before the key was set). "Retry sync" creates the contact with their profile
  properties.
- **All** — everyone, for finding a specific person. "Delete" erases the record for a removal
  request; the Resend contact must be deleted separately in the Resend dashboard.
```

- [ ] **Step 2: Privacy** — in `frontend/static_pages/privacy-policy.mdx`, extend the **Survey and join.** paragraph with:

```md
If you ask for a Discord invite we record that request, who reviewed it, and — if you were signed in with GitHub — your GitHub username, so we can see who vouched for you. The invite itself is a private link we email to you.
```

- [ ] **Step 3: CLAUDE.md** — extend the Community bullet:

```
- **Community:** `/join`, `/survey`, `/join/confirmed`; `POST /api/join`, `POST /api/survey`, `GET /api/join/confirm`; review queue at `/platform/admin/people` (admin-only) with `GET|POST /api/platform/admin/people[/id/action]`. Questions are data in `frontend/content/survey.ts`; engine + handlers in `frontend/lib/{survey,join,review,discord}.ts`; see `frontend/SETUP-community.md`.
```

- [ ] **Step 4: Full gate**

Run: `cd frontend && npm run lint && npm run tsc && npm run test:lib && npm run test:scripts && npm run build`
Expected: all green; `# pass 71`.

- [ ] **Step 5: Commit**

```bash
git add frontend/SETUP-community.md frontend/static_pages/privacy-policy.mdx CLAUDE.md
git commit -m "docs(community): Discord admission setup, the review queue, and what a request records"
```

PR description carries:

```
Evidence routes: /join /survey
Walkthrough steps: scripts/walkthroughs/join.mjs
```
plus the hand-taken admin screenshots under **Walkthrough**, with a line saying `/platform/**` is behind org auth so the workflow cannot shoot it.

---

## Self-review

- **Spec coverage (PR 2b scope):** auto-admit signal and its GitHub query (T3, T4); invite parameters and channel (T1); queue → approve/decline with reviewer stamp and optional notify (T2, T5, T6); resend reusing an unexpired code (T5); `people.discord` storage (T2); admin page and routes (T6); retry-sync and delete-on-request (T5, T6); privacy and setup (T7). Deferred by decision: Population tab and package submissions (PR 3), stickers (PR 4), per-person IP retention (still out — nothing here stores one).
- **Placeholders:** none. Task 6's client component is described by its required behaviour rather than transcribed line by line — that is the one file where the exact markup is the implementer's, and every control, endpoint and state it must render is enumerated.
- **Type consistency:** `setReviewStatus` widened to `PersonDoc["status"]` in Task 4 is used that way in Tasks 2, 5; `findPersonById(db, id: string)` (PR 2a) is called with `String(personId)` everywhere; `ReviewDeps` in Task 5 matches the route's construction in Task 6; `InviteResult.inviteUrl` is the field the client reads.
- **Review Focus:** all five lines have a named test in the task that owns the code — Discord failure (T5), double approve (T5), login collision (T4), no sender (T5), recent decline (T4).
