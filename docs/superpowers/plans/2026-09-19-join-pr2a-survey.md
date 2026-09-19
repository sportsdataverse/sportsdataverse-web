# Community join flow — PR 2a: survey engine, `/join` + `/survey`, double opt-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect who our users are — a branching, data-driven questionnaire served as an anonymous `/survey` and as the profile half of `/join` — store it on `people`, mirror it to Resend contact properties for segmentation, and make newsletter signup double opt-in wherever a confirmation email can actually be sent.

**Architecture:** Questions are one typed list in `content/survey.ts` (each with an optional `showIf` over earlier answers). A pure engine in `lib/survey.ts` derives the visible question set, validates a submitted `answers` object against the *same* list (so hidden questions cannot be smuggled in via the API), and projects the typed `profile` block. `people` gains `profile` + `answers`; `handleJoin` grows to accept the profile and to send a signed confirmation link when `RESEND_FROM` is configured, creating the Resend contact (with properties) only on `GET /api/join/confirm`. Without `RESEND_FROM` the PR 1 single-opt-in path is unchanged. One client component, `<QuestionFlow>`, renders both pages section by section and ends on a thank-you view with Follow/Support.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind 4 + shadcn/ui (`Input`, `Button`), zod 3.25, mongodb 6.x, Node `crypto` (HMAC), Resend REST (`/contacts`, `/contact-properties`, `/emails`), `node --test` with type stripping (existing `npm run test:lib`).

**Spec:** `docs/superpowers/specs/2026-09-18-community-join-flow-design.md` — sections: Data model → `people`; Survey engine; Follow and fund; Flows → Newsletter, Survey; Pages and routes; Errors; Privacy; Delivery order → PR 2 (this plan is the survey half; Discord admission + admin queue are PR 2b).

## Global Constraints

- All node commands run from `frontend/`; `legacy-peer-deps` stays in `.npmrc`.
- Relative imports among `lib/*.ts` and from `test/*.ts` use explicit `.ts` extensions (`allowImportingTsExtensions` is on); type-only imports use `import type`. Route/page files use `@lib`/`@components`/`@content` aliases.
- `people` is the list of record: every submission is stored before any Resend call; a Resend failure never fails the request (spec → Errors).
- The profile projection is fixed by the spec: `profile = { role, languages[], sports[], discoveredVia, updatesVia[], newsChannel }` with `Channel = "search" | "github" | "twitter" | "bluesky" | "discord" | "email" | "rss" | "conference" | "referral" | "youtube" | "other"`, `role ∈ student | researcher | developer | hobbyist | industry | other`, `languages ⊆ R | Python | JS | other`.
- Anonymous survey rows are `people` docs with `status: "survey"` and no email. `/join` rows keep `status: "pending"` (the Discord queue in PR 2b filters on `wants.discord`).
- Rate limits via the existing Mongo `rate_limits` limiter: `POST /api/join` 5/IP/hour (unchanged), `POST /api/survey` 10/IP/hour.
- Double opt-in is ON when `RESEND_FROM` is set (e.g. `SportsDataverse <news@sportsdataverse.org>`, which needs the domain verified in Resend) and OFF otherwise. Confirmation tokens are HMAC-SHA256 over `personId.expiresAt` with `JOIN_TOKEN_SECRET` (fallback: `NEXTAUTH_SECRET`), valid 7 days, base64url, single-use is not required (confirming twice is idempotent).
- Reserved test domains (`example.com/org/net`, `.test`, `.invalid`, `localhost`) are stored, never sent to Resend, never emailed.
- Resend contact properties used: `role`, `languages`, `sports`, `discovered_via`, `updates_via`, `news_channel` — all `string` (arrays joined with `,`). They must exist in the Resend account before being set (`scripts/resend-properties.mjs`, Task 4).
- Design adherence: only existing tokens/classes and shadcn `Input`/`Button`; `PageHeader` for page titles; copy in sentence case, plain and specific (`PRODUCT.md`). Native `<input type="radio|checkbox">` for choices (no new UI dependency).
- Every UI change is seen in the four-combination matrix and has a walkthrough steps module. Evidence routes for this PR: `/join /survey`; `Walkthrough steps: scripts/walkthroughs/survey.mjs scripts/walkthroughs/join.mjs`.
- Conventional Commits; **no AI co-author trailers**; explicit paths staged; never commit `img/`.
- Sponsors/Patreon links remain on hold; `content/support.ts` is not edited.

## File structure

| File | Responsibility |
|---|---|
| `frontend/content/survey.ts` (new) | the question list: ids, sections, types, options, `showIf`; `Channel`/`Role`/`Language` unions |
| `frontend/lib/survey.ts` (new) | pure engine: `visibleQuestions`, `validateAnswers`, `projectProfile`, `contactProperties` |
| `frontend/lib/confirmToken.ts` (new) | `signConfirmToken` / `verifyConfirmToken` (HMAC, expiry) |
| `frontend/lib/email.ts` (new) | `sendEmail` via Resend `/emails`; `confirmEmail()` template (plain HTML + text) |
| `frontend/lib/newsletter.ts` (modify) | `subscribeToResend(email, deps, properties?)` |
| `frontend/lib/people.ts` (modify) | `PersonDoc.profile/answers/name`, `recordSurvey`, `upsertJoin`, `markNewsletterPending`, `markNewsletterConfirmed`, `findPersonById` |
| `frontend/lib/joinSchema.ts` (modify) | `joinBodySchema` = email + optional name + `wants` (discord/newsletter booleans) + `answers` object + placement; `surveyBodySchema` |
| `frontend/lib/join.ts` (modify) | `handleJoin` v2 (profile, double opt-in), `handleSurvey`, `handleConfirm` |
| `frontend/app/api/join/route.ts` (modify), `frontend/app/api/survey/route.ts` (new), `frontend/app/api/join/confirm/route.ts` (new) | wiring |
| `frontend/components/site/QuestionFlow.tsx` (new) | client stepper: sections → questions → submit → thank-you |
| `frontend/components/site/FollowUs.tsx` (new) | GitHub/Bluesky/Twitter links via `TrackedLink` |
| `frontend/app/(site)/survey/page.tsx`, `frontend/app/(site)/join/page.tsx`, `frontend/app/(site)/join/confirmed/page.tsx` (new) | pages |
| `frontend/components/site/SiteFooter.tsx` (modify) | "Join" link in the Community group |
| `frontend/scripts/resend-properties.mjs` (new) | one-shot: create the six contact properties |
| `frontend/scripts/walkthroughs/survey.mjs`, `join.mjs` (new) | evidence flows |
| `frontend/test/survey.test.ts`, `confirmToken.test.ts`, `email.test.ts`, `people.test.ts` (extend), `join.test.ts` (extend) | `node --test` suites |
| `frontend/static_pages/privacy-policy.mdx`, `frontend/SETUP-community.md`, `frontend/.env.example`, `CLAUDE.md` | docs |

---

### Task 1: Question list + survey engine

**Files:**
- Create: `frontend/content/survey.ts`
- Create: `frontend/lib/survey.ts`
- Create: `frontend/test/survey.test.ts`

**Interfaces:**
- Produces (content): `Channel`, `Role`, `Language` string-literal unions; `Question` type; `QUESTIONS: Question[]`; `SURVEY_SECTIONS = ["profile", "discovery", "followup"]`, `JOIN_SECTIONS = [...SURVEY_SECTIONS, "wants"]`.
- Produces (engine): `visibleQuestions(questions, sections, answers): Question[]`; `validateAnswers(questions, sections, raw: unknown): { ok: true; answers: Answers } | { ok: false; message: string }`; `projectProfile(answers): Profile`; `contactProperties(profile): Record<string, string>`. `Answers = Record<string, string | string[]>`; `Profile = { role: Role; languages: Language[]; sports: string[]; discoveredVia: Channel; updatesVia: Channel[]; newsChannel: Channel }`.

- [ ] **Step 1: Write the question list**

`frontend/content/survey.ts`:

```ts
/**
 * The questionnaire behind /survey and /join, as data. `showIf` runs on the
 * answers given so far; a hidden question is never rendered and never
 * accepted by the server (lib/survey.ts validates against this same list).
 * Adding a follow-up is an edit here only.
 */
export type Channel =
  | "search" | "github" | "twitter" | "bluesky" | "discord" | "email"
  | "rss" | "conference" | "referral" | "youtube" | "other";
export type Role = "student" | "researcher" | "developer" | "hobbyist" | "industry" | "other";
export type Language = "R" | "Python" | "JS" | "other";

export type Section = "profile" | "discovery" | "followup" | "wants";
export type Answers = Record<string, string | string[]>;

export type Question = {
  id: string;
  section: Section;
  type: "single" | "multi" | "text";
  label: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** options filled in by the page at render time (e.g. package names) */
  optionsKey?: "packages_r" | "packages_python";
  required?: boolean;
  showIf?: (answers: Answers) => boolean;
};

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "search", label: "Web search" },
  { value: "github", label: "GitHub" },
  { value: "twitter", label: "Twitter / X" },
  { value: "bluesky", label: "Bluesky" },
  { value: "discord", label: "Discord" },
  { value: "email", label: "Email / newsletter" },
  { value: "rss", label: "RSS" },
  { value: "conference", label: "A talk or conference" },
  { value: "referral", label: "Someone told me" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Somewhere else" },
];

export const SPORTS = ["CFB", "MBB", "WBB", "NFL", "NBA", "WNBA", "NHL", "MLB", "Soccer", "Other"];

const has = (a: Answers, id: string, v: string) => {
  const x = a[id];
  return Array.isArray(x) ? x.includes(v) : x === v;
};

export const QUESTIONS: Question[] = [
  { id: "role", section: "profile", type: "single", label: "What best describes you?", required: true,
    options: [
      { value: "student", label: "Student" }, { value: "researcher", label: "Researcher / academic" },
      { value: "developer", label: "Developer / engineer" }, { value: "hobbyist", label: "Hobbyist" },
      { value: "industry", label: "Work in sports or media" }, { value: "other", label: "Other" },
    ] },
  { id: "languages", section: "profile", type: "multi", label: "Which languages do you use with our tools?", required: true,
    options: [{ value: "R", label: "R" }, { value: "Python", label: "Python" }, { value: "JS", label: "JavaScript / Node" }, { value: "other", label: "Other" }] },
  { id: "sports", section: "profile", type: "multi", label: "Which sports do you work with?", required: true,
    options: SPORTS.map((s) => ({ value: s, label: s })) },

  { id: "discoveredVia", section: "discovery", type: "single", label: "How did you first find a SportsDataverse project?", required: true, options: CHANNELS },
  { id: "updatesVia", section: "discovery", type: "multi", label: "How do you hear about updates today?", required: true, options: CHANNELS },
  { id: "newsChannel", section: "discovery", type: "single", label: "Where would you like news delivered?", required: true,
    options: CHANNELS.filter((c) => ["email", "discord", "github", "bluesky", "twitter", "rss"].includes(c.value)) },

  { id: "packages_r", section: "followup", type: "multi", label: "Which R packages do you use?", optionsKey: "packages_r",
    showIf: (a) => has(a, "languages", "R") },
  { id: "packages_python", section: "followup", type: "multi", label: "Which Python packages do you use?", optionsKey: "packages_python",
    showIf: (a) => has(a, "languages", "Python") },
  { id: "dataTypes", section: "followup", type: "multi", label: "What do you mostly pull?",
    options: [{ value: "pbp", label: "Play-by-play" }, { value: "box", label: "Box scores" }, { value: "schedules", label: "Schedules / rosters" }, { value: "models", label: "Model outputs (EPA, WP, ratings)" }],
    showIf: (a) => Array.isArray(a.sports) && a.sports.length > 0 },
  { id: "following", section: "followup", type: "single", label: "Are you following us there already?",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "Not yet" }],
    showIf: (a) => ["twitter", "bluesky", "youtube"].includes(String(a.discoveredVia)) },

  { id: "wants_newsletter", section: "wants", type: "single", label: "Email newsletter: new data, methods posts, releases.", required: true,
    options: [{ value: "yes", label: "Yes, sign me up" }, { value: "no", label: "No thanks" }] },
  { id: "wants_discord", section: "wants", type: "single", label: "Would you like an invite to the Discord?", required: true,
    help: "Invites are reviewed by a member; we'll email you.",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
];

export const SURVEY_SECTIONS: Section[] = ["profile", "discovery", "followup"];
export const JOIN_SECTIONS: Section[] = ["profile", "discovery", "followup", "wants"];
```

- [ ] **Step 2: Write the failing engine test**

`frontend/test/survey.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, SURVEY_SECTIONS, JOIN_SECTIONS } from '../content/survey.ts';
import { visibleQuestions, validateAnswers, projectProfile, contactProperties } from '../lib/survey.ts';

const base = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'twitter', updatesVia: ['github', 'email'], newsChannel: 'email',
};

test('follow-ups appear only when their trigger answer is present', () => {
  const ids = (a: Record<string, string | string[]>) => visibleQuestions(QUESTIONS, SURVEY_SECTIONS, a).map((q) => q.id);
  assert.ok(ids(base).includes('packages_r'));
  assert.ok(!ids(base).includes('packages_python'));
  assert.ok(ids(base).includes('following')); // discoveredVia twitter
  assert.ok(!ids({ ...base, discoveredVia: 'search' }).includes('following'));
  assert.ok(!ids(base).includes('wants_newsletter')); // wants is not a survey section
});

test('validateAnswers accepts a complete survey and rejects a missing required one', () => {
  const ok = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: ['cfbfastR'], dataTypes: ['pbp'], following: 'yes' });
  assert.equal(ok.ok, true);
  const missing = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, role: undefined });
  assert.equal(missing.ok, false);
  assert.match((missing as { message: string }).message, /What best describes you/);
});

test('hidden or unknown answers are dropped, bad option values rejected', () => {
  const r = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_python: ['sportsdataverse-py'], bogus: 'x' });
  assert.equal(r.ok, true);
  const a = (r as { answers: Record<string, unknown> }).answers;
  assert.equal(a.packages_python, undefined); // languages has no Python → hidden → dropped
  assert.equal(a.bogus, undefined);
  const bad = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, role: 'wizard' });
  assert.equal(bad.ok, false);
  const badMulti = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, sports: 'CFB' }); // multi must be an array
  assert.equal(badMulti.ok, false);
});

test('free-list options (packages) accept any short string, limited count', () => {
  const r = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: ['cfbfastR', 'hoopR'] });
  assert.equal(r.ok, true);
  const tooMany = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: Array.from({ length: 41 }, (_, i) => `p${i}`) });
  assert.equal(tooMany.ok, false);
});

test('join sections require the wants answers', () => {
  const r = validateAnswers(QUESTIONS, JOIN_SECTIONS, { ...base });
  assert.equal(r.ok, false);
  const ok = validateAnswers(QUESTIONS, JOIN_SECTIONS, { ...base, wants_newsletter: 'yes', wants_discord: 'no' });
  assert.equal(ok.ok, true);
});

test('profile projection and contact properties', () => {
  const p = projectProfile({ ...base, packages_r: ['cfbfastR'] });
  assert.deepEqual(p, { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'twitter', updatesVia: ['github', 'email'], newsChannel: 'email' });
  assert.deepEqual(contactProperties(p), {
    role: 'developer', languages: 'R', sports: 'CFB', discovered_via: 'twitter', updates_via: 'github,email', news_channel: 'email',
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `Cannot find module '../lib/survey.ts'`

- [ ] **Step 4: Implement the engine**

`frontend/lib/survey.ts`:

```ts
import type { Answers, Channel, Language, Question, Role, Section } from "../content/survey.ts";

/**
 * Pure questionnaire engine. The UI and the API both derive what is asked and
 * what is accepted from the same question list, so a question hidden by
 * `showIf` can neither be rendered nor smuggled in through the API.
 */
export type Profile = {
  role: Role;
  languages: Language[];
  sports: string[];
  discoveredVia: Channel;
  updatesVia: Channel[];
  newsChannel: Channel;
};

const MAX_FREE_OPTIONS = 40; // optionsKey lists come from the packages collection; cap the array
const MAX_TEXT = 200;

export function visibleQuestions(questions: Question[], sections: Section[], answers: Answers): Question[] {
  const out: Question[] = [];
  for (const q of questions) {
    if (!sections.includes(q.section)) continue;
    if (q.showIf && !q.showIf(answers)) continue;
    out.push(q);
  }
  return out;
}

function checkOne(q: Question, v: unknown): string | null {
  const allowed = q.options?.map((o) => o.value);
  if (q.type === "multi") {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return `${q.label} — pick one or more`;
    if (v.length > MAX_FREE_OPTIONS) return `${q.label} — too many`;
    if (allowed && v.some((x) => !allowed.includes(x))) return `${q.label} — unknown option`;
    if (!allowed && v.some((x) => x.length === 0 || x.length > MAX_TEXT)) return `${q.label} — bad value`;
    return null;
  }
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_TEXT) return `${q.label} — pick one`;
  if (allowed && !allowed.includes(v)) return `${q.label} — unknown option`;
  return null;
}

export function validateAnswers(
  questions: Question[],
  sections: Section[],
  raw: unknown
): { ok: true; answers: Answers } | { ok: false; message: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const answers: Answers = {};
  // walk in list order so showIf sees exactly the answers a user could have given before it
  for (const q of visibleQuestions(questions, sections, input as Answers)) {
    const v = input[q.id];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      if (q.required) return { ok: false, message: `${q.label} — required` };
      continue;
    }
    const err = checkOne(q, v);
    if (err) return { ok: false, message: err };
    answers[q.id] = v as string | string[];
  }
  return { ok: true, answers };
}

export function projectProfile(answers: Answers): Profile {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    role: String(answers.role) as Role,
    languages: arr(answers.languages) as Language[],
    sports: arr(answers.sports),
    discoveredVia: String(answers.discoveredVia) as Channel,
    updatesVia: arr(answers.updatesVia) as Channel[],
    newsChannel: String(answers.newsChannel) as Channel,
  };
}

/** Resend contact properties (all string typed; arrays joined with commas). */
export function contactProperties(p: Profile): Record<string, string> {
  return {
    role: p.role,
    languages: p.languages.join(","),
    sports: p.sports.join(","),
    discovered_via: p.discoveredVia,
    updates_via: p.updatesVia.join(","),
    news_channel: p.newsChannel,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 24` (18 existing + 6), `# fail 0`

- [ ] **Step 6: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/content/survey.ts frontend/lib/survey.ts frontend/test/survey.test.ts
git commit -m "feat(survey): question list with showIf follow-ups and a pure validate/project engine"
```

---

### Task 2: `people` — profile, answers, survey rows, opt-in states

**Files:**
- Modify: `frontend/lib/people.ts`
- Modify: `frontend/test/people.test.ts` (append)

**Interfaces:**
- Consumes: `Profile` (Task 1), `Answers` (content).
- Produces: `PersonDoc` gains `name?: string; profile?: Profile; answers?: Answers` and `newsletter` gains the pending shape `{ pending: { sentAt: Date } }` and `confirmedAt?: Date` on the synced shape; `recordSurvey(db, { answers, profile }, now?): Promise<{ personId }>`; `upsertJoin(db, { email, name?, answers, profile, wants: { newsletter: boolean; discord: boolean }, placement? }, now?): Promise<{ personId; created }>`; `markNewsletterPending(db, personId, now?)`; `markNewsletterConfirmed(db, personId, resendContactId, now?)`; `findPersonById(db, id: string): Promise<PersonDoc | null>` (accepts an ObjectId hex string; falls back to a raw-string `_id` for the in-memory fake). Existing `upsertNewsletterSignup`, `markNewsletterSynced`, `markNewsletterSkipped` unchanged.

- [ ] **Step 1: Write the failing tests** (append to `frontend/test/people.test.ts`)

```ts
import { recordSurvey, upsertJoin, markNewsletterPending, markNewsletterConfirmed, findPersonById } from '../lib/people.ts';

const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'twitter', updatesVia: ['github'], newsChannel: 'email' } as const;

test('recordSurvey inserts an anonymous row', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await recordSurvey(db, { answers: { role: 'developer' }, profile: PROFILE }, T0);
  assert.ok(personId);
  const [p] = dump('people');
  assert.equal(p.status, 'survey');
  assert.equal(p.email, undefined);
  assert.deepEqual(p.profile, PROFILE);
  assert.deepEqual(p.wants, { discord: false, newsletter: false, stickers: false, package: false });
});

test('upsertJoin creates with profile + wants, then updates the same email without duplicating', async () => {
  const { db, dump } = fakeDb();
  const a = await upsertJoin(db, { email: 'a@b.co', name: 'A', answers: { role: 'developer' }, profile: PROFILE, wants: { newsletter: true, discord: true }, placement: 'join' }, T0);
  assert.equal(a.created, true);
  const b = await upsertJoin(db, { email: 'a@b.co', answers: { role: 'student' }, profile: { ...PROFILE, role: 'student' }, wants: { newsletter: false, discord: true } }, T1);
  assert.equal(b.created, false);
  assert.equal(dump('people').length, 1);
  const [p] = dump('people');
  assert.equal(p.name, 'A');
  assert.equal((p.profile as { role: string }).role, 'student');
  assert.deepEqual(p.wants, { discord: true, newsletter: false, stickers: false, package: false });
  assert.equal(p.status, 'pending');
  assert.equal((p.createdAt as Date).getTime(), T0.getTime());
});

test('opt-in bookkeeping: pending, then confirmed', async () => {
  const { db, dump } = fakeDb();
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE, wants: { newsletter: true, discord: false } }, T0);
  await markNewsletterPending(db, personId, T0);
  assert.deepEqual(dump('people')[0].newsletter, { pending: { sentAt: T0 } });
  await markNewsletterConfirmed(db, personId, 'c-1', T1);
  assert.deepEqual(dump('people')[0].newsletter, { resendContactId: 'c-1', syncedAt: T1, confirmedAt: T1 });
  const found = await findPersonById(db, String(personId));
  assert.equal(found?.email, 'a@b.co');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `recordSurvey` is not exported

- [ ] **Step 3: Implement** — in `frontend/lib/people.ts`:

Change the first line to `import { ObjectId, type Db } from "mongodb";` (ObjectId is now a value import) and add: `import type { Answers } from "../content/survey.ts"; import type { Profile } from "./survey.ts";`

Replace the `PersonDoc` type with:

```ts
export type PersonDoc = {
  _id: ObjectId;
  email?: string;
  githubLogin?: string;
  name?: string;
  profile?: Profile; // typed projection of the core answers — aggregations key on this
  answers?: Answers; // every answered question by id, incl. conditional follow-ups
  wants: { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };
  // pending = not yet reviewed (the Discord queue filters on wants.discord too); survey = anonymous respondent
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  signup?: { placement: string };
  // unsubscribed: the Resend contact exists but opted out; we never flip it from this form.
  // pending: a confirmation email was sent (double opt-in); confirmedAt is set when the link is used.
  newsletter?:
    | { resendContactId: string; syncedAt: Date; unsubscribed?: true; confirmedAt?: Date }
    | { pending: { sentAt: Date } }
    | { skipped: string };
  createdAt: Date;
  updatedAt: Date;
};
```

Append these functions after `markNewsletterSkipped`:

```ts
export async function recordSurvey(
  db: Db,
  input: { answers: Answers; profile: Profile },
  now: Date = new Date()
): Promise<{ personId: PersonId }> {
  const doc = {
    answers: input.answers,
    profile: input.profile,
    wants: { discord: false, newsletter: false, stickers: false, package: false },
    status: "survey" as const,
    createdAt: now,
    updatedAt: now,
  };
  const res = await people(db).insertOne(doc as unknown as PersonDoc);
  return { personId: res.insertedId };
}

export async function upsertJoin(
  db: Db,
  input: {
    email: string;
    name?: string;
    answers: Answers;
    profile: Profile;
    wants: { newsletter: boolean; discord: boolean };
    placement?: string;
  },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: {
        answers: input.answers,
        profile: input.profile,
        "wants.newsletter": input.wants.newsletter,
        "wants.discord": input.wants.discord,
        updatedAt: now,
        ...(input.name ? { name: input.name } : {}),
      },
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
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

export async function markNewsletterPending(db: Db, personId: PersonId, now: Date = new Date()): Promise<void> {
  await people(db).updateOne({ _id: personId }, { $set: { newsletter: { pending: { sentAt: now } } } });
}

export async function markNewsletterConfirmed(
  db: Db,
  personId: PersonId,
  resendContactId: string,
  now: Date = new Date()
): Promise<void> {
  await people(db).updateOne(
    { _id: personId },
    { $set: { newsletter: { resendContactId, syncedAt: now, confirmedAt: now } } }
  );
}

export async function findPersonById(db: Db, id: string): Promise<PersonDoc | null> {
  // real ids are ObjectId hex; the in-memory test fake stores plain strings
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === id) {
    const hit = await people(db).findOne({ _id: new ObjectId(id) });
    if (hit) return hit;
  }
  return people(db).findOne({ _id: id as unknown as PersonId });
}
```

The fake DB needs `insertOne`. In `frontend/test/fakeDb.ts`, inside the object returned by `collection(name)`, add:

```ts
        async insertOne(doc: Doc) {
          const d = { _id: `id-${nextId++}`, ...doc };
          rows(name).push(d);
          return { insertedId: d._id, acknowledged: true };
        },
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 27`, `# fail 0`

- [ ] **Step 5: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/people.ts frontend/test/people.test.ts frontend/test/fakeDb.ts
git commit -m "feat(people): profile/answers on the person, anonymous survey rows, double opt-in states"
```

---

### Task 3: Confirmation tokens + Resend transactional email

**Files:**
- Create: `frontend/lib/confirmToken.ts`
- Create: `frontend/lib/email.ts`
- Create: `frontend/test/confirmToken.test.ts`
- Create: `frontend/test/email.test.ts`

**Interfaces:**
- Produces: `signConfirmToken(personId: string, secret: string, now?: Date, ttlSec = 604800): string`; `verifyConfirmToken(token: string, secret: string, now?: Date): { ok: true; personId: string } | { ok: false; reason: "malformed" | "expired" | "bad-signature" }`.
- Produces: `sendEmail({ from, to, subject, html, text }, deps: { apiKey: string | undefined; fetchImpl?: typeof fetch }): Promise<{ id: string }>`; `confirmEmail(confirmUrl: string): { subject: string; html: string; text: string }`.

- [ ] **Step 1: Write the failing token test**

`frontend/test/confirmToken.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signConfirmToken, verifyConfirmToken } from '../lib/confirmToken.ts';

const T0 = new Date('2026-09-19T12:00:00Z');
const SECRET = 's3cret';

test('round-trips a person id and rejects tampering, wrong secret, and expiry', () => {
  const t = signConfirmToken('66f0aaaaaaaaaaaaaaaaaaaa', SECRET, T0);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // base64url payload . base64url mac
  assert.deepEqual(verifyConfirmToken(t, SECRET, T0), { ok: true, personId: '66f0aaaaaaaaaaaaaaaaaaaa' });
  assert.deepEqual(verifyConfirmToken(t, 'other', T0), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(verifyConfirmToken(t + 'x', SECRET, T0), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(verifyConfirmToken('nope', SECRET, T0), { ok: false, reason: 'malformed' });
  const later = new Date(T0.getTime() + 8 * 86400 * 1000);
  assert.deepEqual(verifyConfirmToken(t, SECRET, later), { ok: false, reason: 'expired' });
});
```

- [ ] **Step 2: Write the failing email test**

`frontend/test/email.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, confirmEmail } from '../lib/email.ts';

test('sendEmail posts to Resend /emails with the bearer key and returns the id', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await sendEmail({ from: 'SDV <news@sportsdataverse.org>', to: 'a@b.co', subject: 'Hi', html: '<p>x</p>', text: 'x' }, { apiKey: 're', fetchImpl });
  assert.deepEqual(r, { id: 'em-1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { from: 'SDV <news@sportsdataverse.org>', to: ['a@b.co'], subject: 'Hi', html: '<p>x</p>', text: 'x' });
});

test('sendEmail throws on a missing key or a non-2xx', async () => {
  await assert.rejects(sendEmail({ from: 'a', to: 'b', subject: 's', html: 'h', text: 't' }, { apiKey: undefined }), /RESEND_API_KEY/);
  const f = (async () => new Response('{"message":"nope"}', { status: 403 })) as typeof fetch;
  await assert.rejects(sendEmail({ from: 'a', to: 'b', subject: 's', html: 'h', text: 't' }, { apiKey: 'k', fetchImpl: f }), /Resend 403/);
});

test('confirmEmail carries the link in both bodies', () => {
  const e = confirmEmail('https://www.sportsdataverse.org/api/join/confirm?t=abc.def');
  assert.match(e.subject, /confirm/i);
  assert.ok(e.html.includes('https://www.sportsdataverse.org/api/join/confirm?t=abc.def'));
  assert.ok(e.text.includes('https://www.sportsdataverse.org/api/join/confirm?t=abc.def'));
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — cannot find `../lib/confirmToken.ts` / `../lib/email.ts`

- [ ] **Step 4: Implement the token**

`frontend/lib/confirmToken.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Double opt-in link token: `base64url(personId.expiresAtMs)` + "." + HMAC-SHA256.
 * Stateless — nothing to store or revoke; confirming twice is harmless.
 */
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signConfirmToken(personId: string, secret: string, now: Date = new Date(), ttlSec = 7 * 86400): string {
  const payload = b64(`${personId}.${now.getTime() + ttlSec * 1000}`);
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyConfirmToken(
  token: string,
  secret: string,
  now: Date = new Date()
): { ok: true; personId: string } | { ok: false; reason: "malformed" | "expired" | "bad-signature" } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed" };
  const expected = mac(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  const [personId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!personId || !/^\d+$/.test(exp ?? "")) return { ok: false, reason: "malformed" };
  if (now.getTime() > Number(exp)) return { ok: false, reason: "expired" };
  return { ok: true, personId };
}
```

- [ ] **Step 5: Implement the email client + template**

`frontend/lib/email.ts`:

```ts
/**
 * Resend transactional send (`POST /emails`) and the one template PR 2a needs.
 * `from` must be on a domain verified in Resend — that is what RESEND_FROM gates.
 */
export type EmailDeps = { apiKey: string | undefined; fetchImpl?: typeof fetch };

export async function sendEmail(
  msg: { from: string; to: string; subject: string; html: string; text: string },
  deps: EmailDeps
): Promise<{ id: string }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const res = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("Resend response had no email id");
  return { id: body.id };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function confirmEmail(confirmUrl: string): { subject: string; html: string; text: string } {
  const url = esc(confirmUrl);
  return {
    subject: "Confirm your SportsDataverse newsletter subscription",
    html: `<p>Thanks for signing up. Confirm your email to start receiving the newsletter — new data, methods posts, and package releases.</p>
<p><a href="${url}">Confirm subscription</a></p>
<p>If you didn't sign up, ignore this email and nothing happens. The link expires in 7 days.</p>
<p>— SportsDataverse</p>`,
    text: `Thanks for signing up. Confirm your email to start receiving the newsletter:\n\n${confirmUrl}\n\nIf you didn't sign up, ignore this email and nothing happens. The link expires in 7 days.\n\n— SportsDataverse`,
  };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 31`, `# fail 0`

- [ ] **Step 7: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/confirmToken.ts frontend/lib/email.ts frontend/test/confirmToken.test.ts frontend/test/email.test.ts
git commit -m "feat(join): HMAC confirmation tokens and a Resend transactional email client"
```

---

### Task 4: Contact properties on subscribe + the one-shot properties script

**Files:**
- Modify: `frontend/lib/newsletter.ts`
- Modify: `frontend/test/newsletter.test.ts` (one test)
- Create: `frontend/scripts/resend-properties.mjs`
- Modify: `frontend/package.json` (script)

**Interfaces:**
- Produces: `subscribeToResend(email, deps, properties?: Record<string, string>)` — when `properties` is given it is sent on create, and on the 409 path a `PATCH /contacts/{email}` with `{ properties }` is issued after the GET (the person re-submitted with a fresher profile). Return type unchanged.

- [ ] **Step 1: Add the failing test** (append to `frontend/test/newsletter.test.ts`)

```ts
test('properties ride on create, and are PATCHed onto an existing contact', async () => {
  const props = { role: 'developer', languages: 'R' };
  const created = fakeFetch([{ status: 200, body: { object: 'contact', id: 'c-1' } }]);
  await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: created.fetchImpl }, props);
  assert.deepEqual(JSON.parse(String(created.calls[0].init.body)), { email: 'a@b.co', unsubscribed: false, properties: props });

  const existing = fakeFetch([
    { status: 409, body: { message: 'exists' } },
    { status: 200, body: { object: 'contact', id: 'c-old', unsubscribed: false } },
    { status: 200, body: { object: 'contact', id: 'c-old' } },
  ]);
  const r = await subscribeToResend('a@b.co', { apiKey: 'k', fetchImpl: existing.fetchImpl }, props);
  assert.deepEqual(r, { contactId: 'c-old', unsubscribed: false });
  assert.equal(existing.calls[2].init.method, 'PATCH');
  assert.equal(existing.calls[2].url, 'https://api.resend.com/contacts/a%40b.co');
  assert.deepEqual(JSON.parse(String(existing.calls[2].init.body)), { properties: props });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — body has no `properties` / only 2 calls

- [ ] **Step 3: Implement** — in `frontend/lib/newsletter.ts` replace `subscribeToResend` with:

```ts
export async function subscribeToResend(
  email: string,
  deps: ResendDeps,
  properties?: Record<string, string>
): Promise<{ contactId: string; unsubscribed: boolean }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const created = await call(deps, "/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false, ...(properties ? { properties } : {}) }),
  });
  if (created.ok) return contactFrom(created);
  if (created.status === 409) {
    const path = `/contacts/${encodeURIComponent(email)}`;
    const existing = await call(deps, path, { method: "GET" });
    if (!existing.ok) throw new Error(`Resend ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
    const contact = await contactFrom(existing);
    if (properties) {
      // a fresher profile: update properties only — never the unsubscribed flag (see above)
      const patched = await call(deps, path, { method: "PATCH", body: JSON.stringify({ properties }) });
      if (!patched.ok) throw new Error(`Resend ${patched.status}: ${(await patched.text()).slice(0, 200)}`);
    }
    return contact;
  }
  throw new Error(`Resend ${created.status}: ${(await created.text()).slice(0, 200)}`);
}
```

- [ ] **Step 4: Write the properties script**

`frontend/scripts/resend-properties.mjs`:

```js
// One-shot: create the contact properties lib/survey.ts writes. Resend rejects a
// property key that does not exist, so run this once per account (re-running is
// safe: an existing key returns 4xx and is reported, not fatal).
//
//   RESEND_API_KEY=re_... node scripts/resend-properties.mjs
const KEYS = ['role', 'languages', 'sports', 'discovered_via', 'updates_via', 'news_channel'];
const key = process.env.RESEND_API_KEY;
if (!key) { console.error('RESEND_API_KEY is not set'); process.exit(2); }
let failed = 0;
for (const k of KEYS) {
  const res = await fetch('https://api.resend.com/contact-properties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ key: k, type: 'string' }),
  });
  const body = await res.text();
  if (res.ok) console.log(`created ${k}`);
  else if (res.status === 409 || /exist/i.test(body)) console.log(`exists  ${k}`);
  else { failed += 1; console.error(`FAILED  ${k}: ${res.status} ${body.slice(0, 120)}`); }
}
process.exit(failed ? 1 : 0);
```

Add to `frontend/package.json` scripts: `"resend:properties": "node scripts/resend-properties.mjs",`

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 32`, `# fail 0`. Also `node --check scripts/resend-properties.mjs`.

- [ ] **Step 6: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint`

```bash
git add frontend/lib/newsletter.ts frontend/test/newsletter.test.ts frontend/scripts/resend-properties.mjs frontend/package.json
git commit -m "feat(newsletter): contact properties on subscribe; one-shot script to create them in Resend"
```

---

### Task 5: `handleJoin` v2, `handleSurvey`, `handleConfirm`, routes

**Files:**
- Modify: `frontend/lib/joinSchema.ts`
- Modify: `frontend/lib/join.ts`
- Modify: `frontend/test/join.test.ts` (extend)
- Modify: `frontend/app/api/join/route.ts`
- Create: `frontend/app/api/survey/route.ts`
- Create: `frontend/app/api/join/confirm/route.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `joinBodySchema` (email, optional `name` ≤ 80, optional `answers: Record<string, unknown>`, optional `placement`) — the PR 1 footer body `{ email, wants: { newsletter: true }, placement }` still validates (no `answers` → newsletter-only path). `surveyBodySchema` = `{ answers: Record<string, unknown> }`.
- `JoinDeps` gains `resendFrom?: string; tokenSecret?: string; siteUrl?: string` (default `https://www.sportsdataverse.org`, so PR 1's existing tests need no change). `handleJoin` returns as before; `handleSurvey(rawBody, ip, deps): Promise<JoinResult>`; `handleConfirm(token: string, deps): Promise<{ redirect: "/join/confirmed" | "/join/confirmed?state=expired" | "/join/confirmed?state=invalid" }>`.

- [ ] **Step 1: Update the schemas** — `frontend/lib/joinSchema.ts` becomes:

```ts
import { z } from "zod";

/**
 * Bodies of the public write endpoints. Question answers are NOT typed here:
 * lib/survey.ts validates `answers` against content/survey.ts so that hidden
 * questions cannot be smuggled in. Unknown keys are stripped (zod default).
 */
export const joinBodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  name: z.string().trim().min(1).max(80).optional(),
  // PR 1 footer shape: no answers, wants.newsletter true
  wants: z.object({ newsletter: z.literal(true) }).optional(),
  answers: z.record(z.unknown()).optional(),
  placement: z.enum(["footer", "about", "join"]).optional(),
});
export type JoinBody = z.infer<typeof joinBodySchema>;

export const surveyBodySchema = z.object({ answers: z.record(z.unknown()) });

/** @deprecated PR 1 name; the footer form still sends this shape and joinBodySchema accepts it. */
export const joinSchema = joinBodySchema;

// RFC 2606 / 6761 reserved names: stored like any signup, never sent to Resend,
// so CI walkthroughs can submit the form without touching the real list.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|test|invalid|localhost)$/i;

export function isReservedEmail(email: string): boolean {
  return RESERVED_DOMAIN.test(email.split("@")[1] ?? "");
}
```

Update `frontend/test/joinSchema.test.ts`: the test that expected `{ wants: { newsletter: false } }` to fail still passes (literal true); add one assertion that `{ email: 'a@b.co', answers: { role: 'x' }, name: ' Ann ' }` parses with `name: 'Ann'`.

- [ ] **Step 2: Write the failing handler tests** (append to `frontend/test/join.test.ts`; keep the existing five)

```ts
import { handleSurvey, handleConfirm } from '../lib/join.ts';
import { signConfirmToken } from '../lib/confirmToken.ts';

const FULL = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'twitter', updatesVia: ['github'], newsChannel: 'email',
  packages_r: ['cfbfastR'], dataTypes: ['pbp'], following: 'yes',
};
const site = { siteUrl: 'https://www.sportsdataverse.org', tokenSecret: 's3cret' };

test('survey: anonymous row stored, no Resend call, 400 on an incomplete profile', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleSurvey({ answers: FULL }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.equal(dump('people')[0].status, 'survey');
  assert.equal((dump('people')[0].profile as { role: string }).role, 'developer');
  const bad = await handleSurvey({ answers: { role: 'developer' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(bad.status, 400);
});

test('join with a profile, single opt-in (no RESEND_FROM): contact created with properties', async () => {
  const { db, dump } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', name: 'Ann', answers: { ...FULL, wants_newsletter: 'yes', wants_discord: 'no' }, placement: 'join' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].body).properties.languages, 'R');
  const [p] = dump('people');
  assert.equal(p.name, 'Ann');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false });
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-1');
});

test('join with wants_newsletter=no stores the profile and never calls Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'a@b.co', answers: { ...FULL, wants_newsletter: 'no', wants_discord: 'yes' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].wants, { discord: true, newsletter: false, stickers: false, package: false });
  assert.equal(dump('people')[0].newsletter, undefined);
});

test('double opt-in (RESEND_FROM set): confirmation email sent, contact created only on confirm', async () => {
  const { db, dump } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true }, placement: 'footer' }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.match(r.body.message, /check your inbox/i);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/emails'));
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(sent.to, ['a@b.co']);
  const link = String(sent.text).match(/https:\/\/www\.sportsdataverse\.org\/api\/join\/confirm\?t=([A-Za-z0-9_.-]+)/);
  assert.ok(link, 'confirm link present');
  assert.deepEqual(Object.keys(dump('people')[0].newsletter as object), ['pending']);

  const c = await handleConfirm(link![1], deps);
  assert.equal(c.redirect, '/join/confirmed');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/contacts'));
  const nl = dump('people')[0].newsletter as { resendContactId: string; confirmedAt?: Date };
  assert.equal(nl.resendContactId, 'c-1');
  assert.ok(nl.confirmedAt);
});

test('confirm: bad or expired tokens redirect with a state; reserved domains never email', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  assert.equal((await handleConfirm('garbage', deps)).redirect, '/join/confirmed?state=invalid');
  const old = signConfirmToken('66f0aaaaaaaaaaaaaaaaaaaa', 's3cret', new Date('2020-01-01'));
  assert.equal((await handleConfirm(old, deps)).redirect, '/join/confirmed?state=expired');
  await handleJoin({ email: 'walkthrough@example.com', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && npm run test:lib`
Expected: FAIL — `handleSurvey` is not exported

- [ ] **Step 4: Implement the handlers** — `frontend/lib/join.ts` becomes:

```ts
import type { Db } from "mongodb";
import { QUESTIONS, JOIN_SECTIONS, SURVEY_SECTIONS } from "../content/survey.ts";
import { isReservedEmail, joinBodySchema, surveyBodySchema } from "./joinSchema.ts";
import { subscribeToResend } from "./newsletter.ts";
import { allowRequest } from "./rateLimit.ts";
import { contactProperties, projectProfile, validateAnswers, type Profile } from "./survey.ts";
import { signConfirmToken, verifyConfirmToken } from "./confirmToken.ts";
import { confirmEmail, sendEmail } from "./email.ts";
import {
  findPersonById, markNewsletterConfirmed, markNewsletterPending, markNewsletterSkipped, markNewsletterSynced,
  recordSurvey, upsertJoin, upsertNewsletterSignup, type PersonId,
} from "./people.ts";

/**
 * The public write endpoints as pure logic. Every path saves the person BEFORE
 * any Resend call and a Resend failure never fails the request (spec → Errors).
 *
 * Newsletter opt-in: with `resendFrom` set (a verified sending domain) a
 * confirmation link is emailed and the Resend contact is created on confirm;
 * without it the contact is created immediately (PR 1 behaviour).
 */
export type JoinDeps = {
  db: Db;
  resendApiKey: string | undefined;
  resendFrom?: string; // e.g. "SportsDataverse <news@sportsdataverse.org>"; undefined = single opt-in
  tokenSecret?: string; // JOIN_TOKEN_SECRET ?? NEXTAUTH_SECRET
  siteUrl?: string; // absolute origin used in the confirm link; defaults to the production site
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type JoinResult = { status: 200 | 400 | 429; body: { success: boolean; message: string } };

const JOIN_LIMIT = { limit: 5, windowSec: 3600 };
const SURVEY_LIMIT = { limit: 10, windowSec: 3600 };
const DEFAULT_SITE = "https://www.sportsdataverse.org";
const CONFIRMED_MSG = "You're on the list.";
const PENDING_MSG = "Almost there — check your inbox and confirm your email.";

const nowOf = (deps: JoinDeps) => (deps.now ?? (() => new Date()))();

async function limited(deps: JoinDeps, key: string, lim: { limit: number; windowSec: number }): Promise<JoinResult | null> {
  const rl = await allowRequest(deps.db, key, { ...lim, now: deps.now });
  if (rl.allowed) return null;
  const mins = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
  return { status: 429, body: { success: false, message: `Too many submissions from this address. Try again in ${mins} min.` } };
}

/** Immediate contact create (single opt-in, or the confirm step of double opt-in). */
async function syncContact(deps: JoinDeps, personId: PersonId, email: string, profile: Profile | undefined, confirmed: boolean): Promise<void> {
  const now = nowOf(deps);
  try {
    const props = profile ? contactProperties(profile) : undefined;
    const { contactId, unsubscribed } = await subscribeToResend(email, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl }, props);
    if (confirmed) await markNewsletterConfirmed(deps.db, personId, contactId, now);
    else await markNewsletterSynced(deps.db, personId, contactId, now, unsubscribed);
  } catch (e) {
    // best-effort: the person is saved; the admin retry-sync (PR 2b) picks it up
    deps.log?.(`resend sync failed for person ${String(personId)}: ${(e as Error).message}`);
  }
}

async function beginOptIn(deps: JoinDeps, personId: PersonId, email: string, profile: Profile | undefined): Promise<string> {
  if (isReservedEmail(email)) {
    await markNewsletterSkipped(deps.db, personId, "reserved-domain");
    return CONFIRMED_MSG;
  }
  if (!deps.resendFrom || !deps.tokenSecret) {
    await syncContact(deps, personId, email, profile, false);
    return CONFIRMED_MSG;
  }
  const now = nowOf(deps);
  const token = signConfirmToken(String(personId), deps.tokenSecret, now);
  const url = `${deps.siteUrl ?? DEFAULT_SITE}/api/join/confirm?t=${token}`;
  try {
    await sendEmail({ from: deps.resendFrom, to: email, ...confirmEmail(url) }, { apiKey: deps.resendApiKey, fetchImpl: deps.fetchImpl });
    await markNewsletterPending(deps.db, personId, now);
  } catch (e) {
    deps.log?.(`confirmation email failed for person ${String(personId)}: ${(e as Error).message}`);
  }
  return PENDING_MSG;
}

export async function handleJoin(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = joinBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" } };
  }
  const { email, name, answers: rawAnswers, placement } = parsed.data;

  // full /join: answers present → validate against the question list
  let profile: Profile | undefined;
  let wants = { newsletter: true, discord: false };
  let answers: Record<string, string | string[]> | undefined;
  if (rawAnswers) {
    const v = validateAnswers(QUESTIONS, JOIN_SECTIONS, rawAnswers);
    if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
    answers = v.answers;
    profile = projectProfile(answers);
    wants = { newsletter: answers.wants_newsletter === "yes", discord: answers.wants_discord === "yes" };
  }

  const lim = await limited(deps, `join:${ip}`, JOIN_LIMIT);
  if (lim) return lim;

  const now = nowOf(deps);
  const { personId } = answers && profile
    ? await upsertJoin(deps.db, { email, name, answers, profile, wants, placement }, now)
    : await upsertNewsletterSignup(deps.db, { email, placement }, now);

  const message = wants.newsletter ? await beginOptIn(deps, personId, email, profile) : "Thanks — we've got your answers.";
  return { status: 200, body: { success: true, message } };
}

export async function handleSurvey(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = surveyBodySchema.safeParse(rawBody);
  if (!parsed.success) return { status: 400, body: { success: false, message: "Invalid request" } };
  const v = validateAnswers(QUESTIONS, SURVEY_SECTIONS, parsed.data.answers);
  if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
  const lim = await limited(deps, `survey:${ip}`, SURVEY_LIMIT);
  if (lim) return lim;
  await recordSurvey(deps.db, { answers: v.answers, profile: projectProfile(v.answers) }, nowOf(deps));
  return { status: 200, body: { success: true, message: "Thanks — that helps us decide what to build next." } };
}

export async function handleConfirm(
  token: string,
  deps: JoinDeps
): Promise<{ redirect: "/join/confirmed" | "/join/confirmed?state=expired" | "/join/confirmed?state=invalid" }> {
  if (!deps.tokenSecret) return { redirect: "/join/confirmed?state=invalid" };
  const v = verifyConfirmToken(token, deps.tokenSecret, nowOf(deps));
  if (!v.ok) return { redirect: v.reason === "expired" ? "/join/confirmed?state=expired" : "/join/confirmed?state=invalid" };
  const person = await findPersonById(deps.db, v.personId);
  if (!person?.email) return { redirect: "/join/confirmed?state=invalid" };
  if (person.newsletter && "resendContactId" in person.newsletter && person.newsletter.confirmedAt) return { redirect: "/join/confirmed" }; // idempotent
  await syncContact(deps, person._id, person.email, person.profile, true);
  return { redirect: "/join/confirmed" };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npm run test:lib`
Expected: `# pass 38` (32 + 1 schema + 5 handler), `# fail 0`.

- [ ] **Step 6: Wire the routes**

`frontend/app/api/join/route.ts` — replace the `handleJoin` call's deps with:

```ts
  const result = await handleJoin(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    tokenSecret: process.env.JOIN_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET,
    siteUrl: process.env.NEXTAUTH_URL ?? "https://www.sportsdataverse.org",
    log: (m) => console.warn(m),
  });
```

`frontend/app/api/survey/route.ts` (new):

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleSurvey } from "@lib/join";
import { ensurePeopleIndexes } from "@lib/people";
import { ensureRateLimitIndex } from "@lib/rateLimit";

let indexesReady: Promise<void> | null = null;

/** Anonymous questionnaire: no auth, no email, rate-limited per IP inside handleSurvey. */
export async function POST(req: Request) {
  const { db } = await connectToDatabase();
  indexesReady ??= Promise.all([ensurePeopleIndexes(db), ensureRateLimitIndex(db)])
    .then(() => undefined)
    .catch((e) => { indexesReady = null; throw e; });
  await indexesReady;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const raw = await req.json().catch(() => ({}));
  const result = await handleSurvey(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    siteUrl: process.env.NEXTAUTH_URL ?? "https://www.sportsdataverse.org",
    log: (m) => console.warn(m),
  });
  return NextResponse.json(result.body, { status: result.status });
}
```

`frontend/app/api/join/confirm/route.ts` (new):

```ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleConfirm } from "@lib/join";

/** Double opt-in link target: verifies the signed token, creates the Resend contact, redirects. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const { db } = await connectToDatabase();
  const { redirect } = await handleConfirm(token, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    tokenSecret: process.env.JOIN_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET,
    siteUrl: url.origin,
    log: (m) => console.warn(m),
  });
  return NextResponse.redirect(new URL(redirect, url.origin), { status: 303 });
}
```

- [ ] **Step 7: Env template**

In `frontend/.env.example`, after `RESEND_API_KEY=` add:

```
# Sender for confirmation mail; set ONLY once the domain is verified in Resend.
# When set, newsletter signup is double opt-in (contact created on confirm).
RESEND_FROM=
# Signs double opt-in links (7-day HMAC tokens). Falls back to NEXTAUTH_SECRET when unset.
JOIN_TOKEN_SECRET=
```

- [ ] **Step 8: Type-check, lint, commit**

Run: `cd frontend && npm run tsc && npm run lint && npm run test:lib`

```bash
git add frontend/lib/joinSchema.ts frontend/lib/join.ts frontend/test/joinSchema.test.ts frontend/test/join.test.ts frontend/app/api/join/route.ts frontend/app/api/survey/route.ts frontend/app/api/join/confirm/route.ts frontend/.env.example
git commit -m "feat(join): profile-aware join, anonymous survey endpoint, double opt-in confirm route gated on RESEND_FROM"
```

---

### Task 6: `<QuestionFlow>`, `<FollowUs>`, and the `/survey` page

**Files:**
- Create: `frontend/components/site/QuestionFlow.tsx`
- Create: `frontend/components/site/FollowUs.tsx`
- Create: `frontend/app/(site)/survey/page.tsx`
- Create: `frontend/scripts/walkthroughs/survey.mjs`

**Interfaces:**
- Consumes: `QUESTIONS`, `SURVEY_SECTIONS`, `visibleQuestions` (Task 1); `POST /api/survey` (Task 5); `TrackedLink`, `SupportCallout` (exist).
- Produces: `<QuestionFlow mode="survey" | "join" dynamicOptions intro? />` (client; imports `QUESTIONS` itself because `showIf` functions cannot cross the server→client prop boundary); `<FollowUs placement />` (via TrackedLink).

- [ ] **Step 1: FollowUs**

`frontend/components/site/FollowUs.tsx`:

```tsx
import TrackedLink from "@components/site/TrackedLink";

const LINKS = [
  { platform: "github", label: "GitHub — sportsdataverse", href: "https://github.com/sportsdataverse" },
  { platform: "bluesky", label: "Bluesky — @sportsdataverse.org", href: "https://bsky.app/profile/sportsdataverse.org" },
  { platform: "twitter", label: "Twitter / X — @SportsDataverse", href: "https://twitter.com/sportsdataverse" },
];

/** Follow links with follow_click tracking; used on thank-you views. */
export default function FollowUs({ placement }: { placement: string }) {
  return (
    <div>
      <p className="eyebrow">Follow along</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {LINKS.map((l) => (
          <li key={l.platform}>
            <TrackedLink
              href={l.href}
              event="follow_click"
              platform={l.platform}
              placement={placement}
              className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
            >
              {l.label}
            </TrackedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: QuestionFlow**

`frontend/components/site/QuestionFlow.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import FollowUs from "@components/site/FollowUs";
import SupportCallout from "@components/site/SupportCallout";
import { JOIN_SECTIONS, QUESTIONS, SURVEY_SECTIONS, type Answers, type Question, type Section } from "@content/survey";
import { visibleQuestions } from "@lib/survey";

type Props = {
  mode: "survey" | "join";
  /** options for questions with `optionsKey`, filled by the server page (plain data only) */
  dynamicOptions: Record<string, { value: string; label: string }[]>;
  /** shown above the first section */
  intro?: string;
};

const SECTION_TITLES: Record<Section, string> = {
  profile: "About you",
  discovery: "How you find us",
  followup: "A little more",
  wants: "What you'd like",
};

// The question list is imported here, not passed as a prop: it carries `showIf`
// functions, which a server component cannot serialise into client props.
export default function QuestionFlow({ mode, dynamicOptions, intro }: Props) {
  const questions = QUESTIONS;
  const sections: Section[] = mode === "join" ? JOIN_SECTIONS : SURVEY_SECTIONS;
  const submitTo = mode === "join" ? "/api/join" : "/api/survey";
  const placement = mode === "join" ? "join" : undefined;
  const [answers, setAnswers] = useState<Answers>({});
  const [contact, setContact] = useState({ email: "", name: "" });
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "sending" | "done" | "error">("form");
  const [message, setMessage] = useState("");

  // sections with at least one visible question, in order; a section that hides entirely is skipped
  const steps = useMemo(
    () => sections.filter((s) => visibleQuestions(questions, [s], answers).length > 0),
    [questions, sections, answers]
  );
  const section = steps[Math.min(step, steps.length - 1)];
  const visible = visibleQuestions(questions, [section], answers);
  const isJoin = submitTo === "/api/join";
  const last = step >= steps.length - 1;

  const opts = (q: Question) => q.options ?? (q.optionsKey ? dynamicOptions[q.optionsKey] ?? [] : []);
  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggle = (id: string, v: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[id]) ? (a[id] as string[]) : [];
      return { ...a, [id]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const sectionComplete = visible.every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });

  async function submit() {
    setPhase("sending");
    setMessage("");
    const body = isJoin ? { email: contact.email, name: contact.name || undefined, answers, placement } : { answers };
    try {
      const res = await fetch(submitTo, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(data.message ?? (res.ok ? "Thanks." : "Something went wrong."));
      setPhase(res.ok ? "done" : "error");
    } catch {
      setMessage("Network error. Try again.");
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <div className="space-y-10" role="status" aria-live="polite">
        <p className="text-lg">{message}</p>
        <FollowUs placement={isJoin ? "join-thanks" : "survey-thanks"} />
        <SupportCallout />
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      aria-label={isJoin ? "Join form" : "Survey"}
      onSubmit={(e) => {
        e.preventDefault();
        if (last) void submit();
        else setStep((s) => s + 1);
      }}
    >
      {step === 0 && intro ? <p className="max-w-2xl text-muted-foreground">{intro}</p> : null}
      <p className="eyebrow">
        Step {step + 1} of {steps.length} · {SECTION_TITLES[section]}
      </p>

      {visible.map((q) => (
        <fieldset key={q.id} className="space-y-3">
          <legend className="font-medium">
            {q.label}
            {q.required ? <span aria-hidden className="text-muted-foreground"> *</span> : null}
          </legend>
          {q.help ? <p className="text-sm text-muted-foreground">{q.help}</p> : null}
          {q.type === "text" ? (
            <Input value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} required={q.required} maxLength={200} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {opts(q).map((o) => {
                const checked = q.type === "multi" ? (answers[q.id] as string[] | undefined)?.includes(o.value) ?? false : answers[q.id] === o.value;
                return (
                  <label
                    key={o.value}
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <input
                      type={q.type === "multi" ? "checkbox" : "radio"}
                      name={q.id}
                      value={o.value}
                      checked={checked}
                      onChange={() => (q.type === "multi" ? toggle(q.id, o.value) : set(q.id, o.value))}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ))}

      {isJoin && last ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Where can we reach you?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="text" placeholder="Name (optional)" autoComplete="name" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} maxLength={80} />
            <Input type="email" placeholder="you@example.com" autoComplete="email" required value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={phase === "sending"}>
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={!sectionComplete || phase === "sending"}>
          {phase === "sending" ? "Sending…" : last ? (isJoin ? "Join" : "Send answers") : "Next"}
        </Button>
        <p role="status" aria-live="polite" className={`text-sm ${phase === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: The `/survey` page**

`frontend/app/(site)/survey/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import QuestionFlow from "@components/site/QuestionFlow";
import { packageOptions } from "@lib/packageOptions";

export const metadata: Metadata = {
  title: "Survey",
  description: "Three minutes on who you are, what you use, and how you'd like to hear from us. Anonymous.",
};

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const dynamicOptions = await packageOptions();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Anonymous" title="Tell us who you are">
        Three minutes, no account, no email. Your answers decide what we build and where we post.
      </PageHeader>
      <div className="mt-10">
        <QuestionFlow mode="survey" dynamicOptions={dynamicOptions} />
      </div>
    </div>
  );
}
```

`frontend/lib/packageOptions.ts` (new, server-only helper both pages share):

```ts
import { connectToDatabase } from "@lib/mongodb";

/** Package names by ecosystem for the survey's follow-up questions; empty lists if the DB is unreachable. */
export async function packageOptions(): Promise<Record<"packages_r" | "packages_python", { value: string; label: string }[]>> {
  try {
    const { db } = await connectToDatabase();
    const pkgs = (await db.collection("packages").find({}, { projection: { title: 1, repoType: 1 } }).sort({ title: 1 }).toArray()) as {
      title: string; repoType: string;
    }[];
    const of = (t: string) => pkgs.filter((p) => p.repoType === t).map((p) => ({ value: p.title, label: p.title }));
    return { packages_r: of("R"), packages_python: of("Python") };
  } catch {
    return { packages_r: [], packages_python: [] };
  }
}
```

- [ ] **Step 4: Walkthrough**

`frontend/scripts/walkthroughs/survey.mjs`:

```js
// Anonymous survey: answer every step and land on the thank-you view.
export default async (page, base) => {
  await page.goto(base + '/survey', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Survey' });
  // the three channel questions on the discovery step share option labels, so
  // address each by its fieldset (legend text) rather than by label alone
  const inSet = (legend) => form.locator('fieldset').filter({ hasText: legend });
  const pick = async (legend, ...labels) => {
    for (const l of labels) { await inSet(legend).getByText(l, { exact: true }).click(); await page.waitForTimeout(250); }
  };
  await pick('What best describes you?', 'Developer / engineer');
  await pick('Which languages', 'R');
  await pick('Which sports', 'CFB');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('first find', 'Twitter / X');
  await pick('hear about updates', 'GitHub', 'Email / newsletter');
  await pick('news delivered', 'Email / newsletter');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  // follow-ups: at least the data types + following question are visible
  await pick('mostly pull', 'Play-by-play');
  await pick('following us', 'Yes');
  await form.getByRole('button', { name: 'Send answers' }).click();
  await page.getByRole('status').filter({ hasText: 'Thanks' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
};
```

- [ ] **Step 5: Verify**

Start the dev server (`npm run dev > /tmp/dev.log 2>&1 &`; the Mongo in `.env.local` must be running for `/api/survey` — see the controller note; the page itself renders without it). Run:

```bash
cd frontend
npm run tsc && npm run lint
BASE=http://localhost:3000 npm run visual-check -- /survey
BASE=http://localhost:3000 npm run walkthrough -- --steps scripts/walkthroughs/survey.mjs
```
Look at `img/visual/survey-*.png`: the pills wrap on mobile without horizontal scroll, the eyebrow step counter reads "Step 1 of 3 · About you". The clip ends on the thank-you view with Follow links and the support callout. Stop the server (`pkill -f "[n]ext dev"`).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/site/QuestionFlow.tsx frontend/components/site/FollowUs.tsx "frontend/app/(site)/survey/page.tsx" frontend/lib/packageOptions.ts frontend/scripts/walkthroughs/survey.mjs
git commit -m "feat(site): data-driven QuestionFlow and the anonymous /survey page"
```

---

### Task 7: `/join`, `/join/confirmed`, footer link, walkthrough

**Files:**
- Create: `frontend/app/(site)/join/page.tsx`
- Create: `frontend/app/(site)/join/confirmed/page.tsx`
- Modify: `frontend/components/site/SiteFooter.tsx` (Community group)
- Create: `frontend/scripts/walkthroughs/join.mjs`

- [ ] **Step 1: The `/join` page**

`frontend/app/(site)/join/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import QuestionFlow from "@components/site/QuestionFlow";
import { packageOptions } from "@lib/packageOptions";

export const metadata: Metadata = {
  title: "Join",
  description: "Tell us a little about yourself and pick what you want from us: the newsletter, a Discord invite, or both.",
};

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const dynamicOptions = await packageOptions();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Community" title="Join the SportsDataverse">
        A few questions about what you do and use, then choose the newsletter, a Discord invite, or both.
      </PageHeader>
      <div className="mt-10">
        <QuestionFlow mode="join" dynamicOptions={dynamicOptions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: The confirmation landing page**

`frontend/app/(site)/join/confirmed/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@components/site/PageHeader";
import FollowUs from "@components/site/FollowUs";

export const metadata: Metadata = { title: "Subscription confirmed", robots: { index: false } };

const COPY = {
  ok: { title: "You're on the list", body: "Your email is confirmed. The next issue will find you." },
  expired: { title: "That link has expired", body: "Confirmation links last 7 days. Sign up again and we'll send a fresh one." },
  invalid: { title: "That link didn't work", body: "It may have been cut off in your mail client. Sign up again and we'll send a fresh one." },
} as const;

export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const c = COPY[(state as keyof typeof COPY) ?? "ok"] ?? COPY.ok;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20">
      <PageHeader eyebrow="Newsletter" title={c.title}>{c.body}</PageHeader>
      <div className="mt-10 space-y-10">
        {state ? (
          <Link href="/join" className="text-primary underline-offset-4 hover:underline">Sign up again</Link>
        ) : (
          <FollowUs placement="confirmed" />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Footer link**

In `frontend/components/site/SiteFooter.tsx`, add as the FIRST entry of the `Community` group's `links`:

```tsx
      { href: "/join", label: "Join — newsletter & Discord" },
```

(internal link; no `external`, no `track` — it renders through the existing `<Link>` branch.)

- [ ] **Step 4: Walkthrough**

`frontend/scripts/walkthroughs/join.mjs`:

```js
// /join end to end with a reserved-domain address (stored, never emailed or sent to Resend).
export default async (page, base) => {
  await page.goto(base + '/join', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Join form' });
  const inSet = (legend) => form.locator('fieldset').filter({ hasText: legend });
  const pick = async (legend, ...labels) => {
    for (const l of labels) { await inSet(legend).getByText(l, { exact: true }).click(); await page.waitForTimeout(250); }
  };
  await pick('What best describes you?', 'Student');
  await pick('Which languages', 'Python');
  await pick('Which sports', 'NBA');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('first find', 'GitHub');
  await pick('hear about updates', 'Discord');
  await pick('news delivered', 'Email / newsletter');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('mostly pull', 'Box scores');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('Email newsletter', 'Yes, sign me up');
  await pick('invite to the Discord', 'No');
  await form.getByPlaceholder('you@example.com').fill('walkthrough@example.com');
  await form.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('status').filter({ hasText: 'on the list' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
};
```

- [ ] **Step 5: Verify**

With the dev server running (Mongo required for the submit):

```bash
cd frontend
npm run tsc && npm run lint
BASE=http://localhost:3000 npm run visual-check -- /join "/join/confirmed" "/join/confirmed?state=expired"
BASE=http://localhost:3000 npm run walkthrough -- --steps scripts/walkthroughs/join.mjs
```
Confirm in the screenshots: the join page's step counter reads "Step 1 of 4"; the confirmed page shows the Follow links; the expired variant shows the "Sign up again" link. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(site)/join/page.tsx" "frontend/app/(site)/join/confirmed/page.tsx" frontend/components/site/SiteFooter.tsx frontend/scripts/walkthroughs/join.mjs
git commit -m "feat(site): /join with profile + wants, /join/confirmed landing, footer link"
```

---

### Task 8: Docs, privacy, gate

**Files:**
- Modify: `frontend/static_pages/privacy-policy.mdx`
- Modify: `frontend/SETUP-community.md`
- Modify: `CLAUDE.md` (routes line)

- [ ] **Step 1: Privacy**

In `frontend/static_pages/privacy-policy.mdx`, after the **Newsletter.** paragraph add:

```md
**Survey and join.** If you answer our questionnaire we store your answers (what you do, which languages, sports, and packages you use, how you found us, and how you'd like to hear from us). The anonymous survey stores no email or name. On the join form we also store the email and name you give us; if you ask for the newsletter we send a confirmation link first and add you to our email list only when you use it. These answers are used to decide what to build and where to post, in aggregate.
```

Bump the front-matter `date:` to today.

- [ ] **Step 2: SETUP-community.md** — add a section after "Newsletter (Resend)":

```md
## Double opt-in

Newsletter signup becomes double opt-in the moment `RESEND_FROM` is set (e.g.
`SportsDataverse <news@sportsdataverse.org>`). Set it only after the domain is verified
in Resend → Domains, or confirmation mail cannot be sent and nobody can confirm.
Until then signup is single opt-in (contact created immediately).

- Confirmation links are `/api/join/confirm?t=<token>`: an HMAC over the person id +
  expiry (7 days), signed with `JOIN_TOKEN_SECRET` (falls back to `NEXTAUTH_SECRET`).
- A person who signed up but has not confirmed has `newsletter.pending.sentAt`; the
  Resend contact is created on confirm with `newsletter.confirmedAt`.

## Contact properties (segmentation)

Every contact carries `role`, `languages`, `sports`, `discovered_via`, `updates_via`,
`news_channel` (strings; lists comma-joined) from the join form's profile. Resend
refuses unknown property keys, so create them once per account:

```sh
RESEND_API_KEY=re_... npm run resend:properties
```

Then build Segments in Resend (e.g. `languages contains R`) to target Broadcasts.

## Survey

`/survey` is anonymous (no email, no name): each submission is a `people` row with
`status: "survey"`. `/join` asks the same questions plus the wants and an email. Both
validate against `content/survey.ts`; a question hidden by `showIf` is never accepted.
Rate limits: 10/IP/hour for the survey, 5/IP/hour for join.
```

- [ ] **Step 3: CLAUDE.md** — in the Architecture section's routes/backends text, add one line after the Backends bullet:

```
- **Community:** `/join`, `/survey`, `/join/confirmed`; `POST /api/join`, `POST /api/survey`, `GET /api/join/confirm`. Questions are data in `frontend/content/survey.ts`; engine + handlers in `frontend/lib/{survey,join}.ts`; see `frontend/SETUP-community.md`.
```

- [ ] **Step 4: Full gate**

Run: `cd frontend && npm run lint && npm run tsc && npm run test:lib && npm run test:scripts && npm run build`
Expected: all green; `# pass 38`.

- [ ] **Step 5: Commit**

```bash
git add frontend/static_pages/privacy-policy.mdx frontend/SETUP-community.md CLAUDE.md
git commit -m "docs(community): survey/join disclosure, double opt-in and contact properties setup"
```

PR description: summary of the four things (survey engine + pages; profile on people + Resend properties; double opt-in gated on RESEND_FROM; confirm route + landing), checks, and:

```
Evidence routes: /join /survey
Walkthrough steps: scripts/walkthroughs/survey.mjs scripts/walkthroughs/join.mjs
```

---

## Self-review

- **Spec coverage (PR 2a scope):** Survey engine (`content/survey.ts` with `showIf`, schemas derived from the list, `profile` projection, follow-ups table incl. R/Python packages, data types, "following" — T1); `/survey` anonymous rows `status: "survey"` (T2, T5, T6); `/join` with profile + wants (T5, T7); people `profile`/`answers`/`name` (T2); Resend properties for segmentation (T4); double opt-in with signed token + confirm route (T3, T5, T7); thank-you pages with Follow/Support (T6); channel fields `discoveredVia`/`updatesVia`/`newsChannel` (T1); rate limits (T5); privacy (T8). Deferred by decision: Discord admission, admin queue, retry-sync, delete-on-request (PR 2b); per-person IP purge (PR 2b); Sponsors/Patreon (hold).
- **Placeholders:** none.
- **Type consistency:** `validateAnswers(questions, sections, raw)` used identically in T1 tests and T5; `upsertJoin` input shape in T2 test matches T5 call; `subscribeToResend(email, deps, properties?)` (T4) matches `syncContact` (T5); `findPersonById(db, id: string)` (T2) matches `handleConfirm` (T5); `handleConfirm` return union used by the confirm route (T5); `QuestionFlow` props (`mode`, `dynamicOptions`, `intro?`) used identically in T6/T7 pages; `FollowUs` `placement` prop string.
