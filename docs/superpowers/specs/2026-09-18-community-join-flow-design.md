# Community join flow — design

Date: 2026-09-18 · Repo: sportsdataverse-web · Status: approved design, pre-plan

## Goal

Give sportsdataverse.org a front door for people, not just packages:

1. **Discord onboarding** — request → member review (or auto-admit) → 3-use, 7-day invite. No public invite link ever exists.
2. **Package submission** — public intake, two tiers (directory listing / org-membership consideration), reviewed in the existing `/packages/manage` CMS.
3. **Population insight** — who our users are (role, language, sport, source) from applicants, an anonymous survey, and passive signals.
4. **Newsletter** — a working signup (both current integrations are dead) with an owned list and segmentation.
5. **Stickers** — opt-in address collection with delete-on-ship. Merch = an external shop link, nothing built.

## Non-goals (YAGNI)

- Discord OAuth `guilds.join`; named-voucher confirmation emails; a survey dashboard beyond count-by tables.
- Field-level encryption of addresses (delete-on-ship covers it; revisit if requests pile up unshipped).
- Substack. It has no supported subscribe API, no tags, no RSS ingest; it can only be a manual mirror. Not part of the pipeline.
- Any merch storefront code. A "Shop" nav link to a print-on-demand store (Fourthwall / Spring / Redbubble) is the whole feature.

## Existing assets reused

| Asset | Where | Reused for |
|---|---|---|
| GitHub OAuth + `session.isOrgMember` | `frontend/lib/auth.ts` | reviewer trust boundary; auto-admit signal |
| `requireWriter()` | `frontend/app/api/packages/route.ts` | extract to `lib/platform/requireWriter.ts`; guards every admin route below |
| MongoDB (`connectToDatabase`) | `frontend/lib/mongodb.ts` | `people`, `sticker_requests`; `packages` gains two fields |
| `packageSchema` + `published` flag | `frontend/lib/packageSchema.ts` | submissions are unpublished package docs |
| `/packages/manage` CMS | `frontend/app/(site)/packages/manage` | package review queue (badge for org-tier requests) |
| `AdminTabs` | `frontend/app/(platform)/platform/admin/AdminTabs.tsx` | new "People" tab |
| `public/feed.xml` (written at build by `getRSS()` from the home page) | `frontend/lib/generateRSS.ts` | Kit RSS-feed broadcast for blog posts. A snippets feed does not exist yet — PR 1 adds `public/snippets-feed.xml` from the same generator |
| `python/data_fetcher.py` GitHub pull | `python/` | weekly release digest source |

## Data model (MongoDB, same DB as `packages`)

### `people`

One doc per applicant or survey respondent.

```ts
{
  _id: ObjectId,
  email?: string,            // absent on anonymous survey rows
  githubLogin?: string,
  name?: string,
  profile: {
    role: "student" | "researcher" | "developer" | "hobbyist" | "industry" | "other",
    languages: ("R" | "Python" | "JS" | "other")[],
    sports: string[],        // free tags from a fixed list + "other"
    source: "search" | "github" | "twitter_bluesky" | "discord" | "conference" | "referral" | "other",
  },
  wants: { discord: boolean, newsletter: boolean, stickers: boolean, package: boolean },
  vouch?: { referrer: string, note: string },        // free text; not verified
  status: "pending" | "approved" | "declined" | "auto" | "survey",
  // auto   = skipped the queue (org member or merged-PR contributor)
  // survey = anonymous respondent; never enters the queue
  discord?: { inviteCode: string, issuedAt: Date, expiresAt: Date },
  newsletter?: { kitSubscriberId: string, syncedAt: Date },
  reviewedBy?: string, reviewedAt?: Date, declineReason?: string,
  createdAt: Date, ip?: string,                      // ip kept 30 days for rate-limit/abuse only
}
```

Indexes: `{ email: 1 }` unique sparse; `{ githubLogin: 1 }` unique sparse; `{ status: 1, createdAt: -1 }`.

Duplicate handling: a second submit with a known email/login **updates** `wants` and `profile` and re-opens `status: "pending"` only if it was `declined` more than 30 days ago; otherwise it returns the existing state. No second doc.

### `sticker_requests`

Kept separate so the address never sits on the person record.

```ts
{ _id, personId: ObjectId, name: string,
  address?: { line1, line2?, city, region, postal, country },
  status: "requested" | "shipped",
  createdAt: Date, shippedAt?: Date, shippedBy?: string }
```

On `shipped`: `$unset: { address: "" }` in the same update. Nothing else in the system stores an address.

### `packages` (existing) — two added fields

`submittedBy?: ObjectId` (person) and `orgTierRequested?: boolean`. Submissions are created with `published: false`. `packageSchema` is not widened; the API stamps these server-side like `createdBy`.

## Flows

### Discord admission

```
/join (wants.discord)
  ├─ signed in + (isOrgMember || isContributor) → status "auto" → mint invite → show on screen + email
  └─ otherwise → status "pending" → appears in /platform/admin/people
        ├─ approve → mint invite → email → status "approved"
        └─ decline (reason) → status "declined"; no email unless reviewer ticks "notify"
```

`isContributor`: on GitHub sign-in, one call `GET /search/issues?q=author:{login}+org:sportsdataverse+is:pr+is:merged` with the user's own token; `total_count > 0`. Cached on the JWT next to `isOrgMember` (`token.isContributor`).

Invite: `POST /channels/{DISCORD_INVITE_CHANNEL_ID}/invites` with `{ max_uses: 3, max_age: 604800, unique: true }` using `DISCORD_BOT_TOKEN` (bot needs *Create Instant Invite* on that channel only). Code stored on `people.discord`; "resend" re-emails the stored code while unexpired, otherwise mints a new one.

### Package submission

`/join` with `wants.package` shows the package fields (same set as `packageSchema` minus `published`) plus "consider this for the sportsdataverse GitHub org" checkbox. `POST /api/join` validates with `packageSchema`, inserts `{ ...pkg, published: false, submittedBy, orgTierRequested }`. `/packages/manage` lists unpublished entries first with a **Submitted** badge and an **Org tier** badge; approving = flipping `published` (existing PUT). Org-tier requests additionally get a checklist rendered in the CMS (license, maintainer, tests, CI) that a member ticks before flipping — informational only, no enforcement.

### Newsletter

Provider: **Kit** (list + tags + editor + RSS broadcasts). Transactional: **Resend**.

- `lib/newsletter.ts` rewritten: `subscribeNewsletter({ email, tags })` → Kit `POST /v4/subscribers` then `POST /v4/tags/{id}/subscribers` per tag. Tags = `role:*`, `lang:*`, `sport:*`. Returns the subscriber id, stored on `people.newsletter`.
- Delete `app/api/mailchimp/route.ts`, `app/api/newsletter/route.ts`, the Substack post in `lib/newsletter.ts`, `md5` + `@mailchimp/mailchimp_marketing` deps, and `MAILCHIMP_*` / `NEXT_PUBLIC_NEWSLETTER_URL` from `.env.example`.
- Footer `NewsletterSignup` component (site layout) posts `{ email, wants: { newsletter: true } }` to `/api/join` — every subscriber lands in `people` first, then Kit.
- Kit-side config (documented in `frontend/SETUP-community.md`, not code): RSS feed broadcast on `/feed.xml` (blog, review-then-send), a second RSS feed on `/snippets-feed.xml` (new, same generator) in digest mode sent to `lang:*` tags.

Content routing (the operating model, also in SETUP-community.md):

| Content | Tool | Who writes |
|---|---|---|
| Blog post | Kit RSS broadcast from `feed.xml` | nobody extra — the MDX merge is the publish |
| Snippets | Kit RSS digest, monthly, by language tag | nobody extra |
| Package releases | Resend broadcast, weekly, generated | nobody — `python/` cron builds it from GitHub releases |
| Announcements | Kit broadcast, editor | any member with a Kit seat |
| Invites / sticker / package-listed emails | Resend transactional | system |

### Survey

`/survey`: the `profile` block only, no email, no wants. Inserts `{ profile, status: "survey" }`. Thank-you links to `/join`. Promoted on the homepage and in the Discord announcements channel.

### Stickers

`/join` with `wants.stickers` shows name + address fields; posts a `sticker_requests` doc alongside the person. Resend "got it" email. Admin **Stickers** sub-tab lists requested → "mark shipped" (unsets address). Address fields are never returned by any list endpoint except the single admin sticker list, and only while `status: "requested"`.

## Pages and routes

| Route | Auth | Notes |
|---|---|---|
| `GET /join` | optional GitHub sign-in (button on page) | multi-section form; signed-in pre-fills login/name |
| `GET /survey` | none | profile block only |
| `POST /api/join` | none; IP rate limit 5/hour (Upstash-free: in-memory per instance is not enough on Vercel — use a `rate_limits` Mongo doc with TTL index) | zod `joinSchema`; fan-out: people upsert, Kit, package insert, sticker insert, auto-admit |
| `POST /api/survey` | none; same limiter | zod `surveySchema` |
| `GET /platform/admin/people` | `isOrgMember` | tabs: Queue · Population · Stickers |
| `GET /api/platform/admin/people?status=` | `requireWriter()` | list, no addresses |
| `POST /api/platform/admin/people/[id]/approve` | `requireWriter()` | mint invite, email, stamp reviewer |
| `POST /api/platform/admin/people/[id]/decline` | `requireWriter()` | reason, optional notify |
| `POST /api/platform/admin/people/[id]/resend` | `requireWriter()` | re-email stored or fresh invite |
| `GET /api/platform/admin/people/population` | `requireWriter()` | `$group` counts by role / language / sport / source / status; plus passive numbers (Discord member count via bot `GET /guilds/{id}?with_counts=true`, Kit subscriber count, CRAN/PyPI downloads from the existing `/api/stats`) |
| `GET /api/platform/admin/stickers` · `POST …/[id]/ship` | `requireWriter()` | only place addresses are readable |

Env additions: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_INVITE_CHANNEL_ID`, `KIT_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`. Removed: `MAILCHIMP_*`, `NEXT_PUBLIC_NEWSLETTER_URL`, EmailJS keys.

## Errors

- Discord API failure on approve: person stays `pending`, route returns 502 with the Discord error; reviewer retries. Never mark approved without a stored invite code.
- Kit failure on join: person is still saved; `newsletter.syncedAt` absent; a nightly `python/` job (or admin "retry sync" button) resubscribes unsynced rows. Newsletter is best-effort, the person record is not.
- Resend failure: logged, does not fail the approve (code is on screen and resendable).
- Rate-limit exceeded: 429 with a plain message; no CAPTCHA until abuse is observed.

## Privacy

`static_pages/privacy.mdx` gains a section: what `/join` and `/survey` collect, that addresses are deleted when stickers ship, that `ip` is held 30 days for abuse prevention, and a removal contact. `people` deletion on request is a one-liner in the admin queue (Decline → Delete).

## Testing

- Unit (`node --test`, the runner `test:scripts` already uses — no new test framework): `joinSchema`/`surveySchema` edge cases; upsert/dedupe rules; `$unset` on ship; population aggregation on a seeded in-memory set.
- Route tests with mocked `auth()`: every admin route 401s without `isOrgMember`; `approve` never sets `approved` when the Discord mock throws.
- Manual: one real end-to-end on a dev Discord server with a throwaway bot; the 4-combination visual matrix per `CLAUDE.md` for `/join`, `/survey`, the footer, and the admin tab.

## Delivery order

1. **PR 1 — newsletter footer.** `lib/newsletter.ts` → Kit; delete Mailchimp/Substack; `NewsletterSignup` in the site footer posting to a minimal `/api/join` that only handles `{ email, wants.newsletter }` and creates the `people` doc. Ships the owned list immediately.
2. **PR 2 — people + Discord.** Full `/join`, `joinSchema`, auto-admit, admin People tab (Queue), Discord bot, Resend transactional.
3. **PR 3 — packages + survey + population.** Package section of `/join`, CMS badges, `/survey`, Population sub-tab with passive signals.
4. **PR 4 — stickers.** `sticker_requests`, address section, Stickers sub-tab, privacy page update, Shop link.
5. **Later, separate:** weekly release digest from `python/` via Resend broadcast.

Each PR is independently shippable; nothing in 3–4 blocks 1–2.
