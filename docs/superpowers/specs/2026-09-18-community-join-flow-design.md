# Community join flow — design

Date: 2026-09-18 · Repo: sportsdataverse-web · Status: approved design, pre-plan

## Goal

Give sportsdataverse.org a front door for people, not just packages:

1. **Discord onboarding** — request → member review (or auto-admit) → 3-use, 7-day invite. No public invite link ever exists.
2. **Package submission** — public intake, two tiers (directory listing / org-membership consideration), reviewed in the existing `/packages/manage` CMS.
3. **Population insight** — who our users are (role, language, sport, channel) from applicants, an anonymous survey, and passive signals.
4. **Newsletter** — a working signup (both current integrations are dead) with an owned list and segmentation.
5. **Stickers** — opt-in address collection with delete-on-ship. Merch = an external shop link, nothing built.
6. **Follow + fund** — get the GitHub org, socials, and donation links in front of every applicant, subscriber, and reader, and measure which channels actually convert.
7. **Channel insight** — ask how people discovered us vs how they hear about updates vs where they *want* news delivered, with follow-ups that only appear when relevant.

## Non-goals (YAGNI)

- Discord OAuth `guilds.join`; named-voucher confirmation emails; a survey dashboard beyond count-by tables.
- Field-level encryption of addresses (delete-on-ship covers it; revisit if requests pile up unshipped).
- Substack. It has no supported subscribe API, no tags, no RSS ingest; it can only be a manual mirror. Not part of the pipeline.
- Kit / Buttondown / MailerLite free tiers: each puts its badge in every email. Rejected 2026-09-19; Resend is badge-free at every tier.
- Any merch storefront code. A "Shop" nav link to a print-on-demand store (Fourthwall / Spring / Redbubble) is the whole feature.
- **Supporter status / perks on the site.** Patreon and Ko-fi Discord role sync is switched on as platform config (no code). No `people.supporter`, no auto-admit for donors — that arrives with the API-paywall spec.
- **The API paywall.** Separate spec. This one only guarantees `people.githubLogin` is unique so a sponsor→person join is trivial later.
- **Changing who can mint Data API keys.** Gate stays `isOrgMember`; per-key rate limits are the control (see Cross-repo).

## Existing assets reused

| Asset | Where | Reused for |
|---|---|---|
| GitHub OAuth + `session.isOrgMember` | `frontend/lib/auth.ts` | reviewer trust boundary; auto-admit signal |
| `requireWriter()` | `frontend/app/api/packages/route.ts` | extract to `lib/platform/requireWriter.ts`; guards every admin route below |
| MongoDB (`connectToDatabase`) | `frontend/lib/mongodb.ts` | `people`, `sticker_requests`; `packages` gains two fields |
| `packageSchema` + `published` flag | `frontend/lib/packageSchema.ts` | submissions are unpublished package docs |
| `/packages/manage` CMS | `frontend/app/(site)/packages/manage` | package review queue (badge for org-tier requests) |
| `AdminTabs` | `frontend/app/(platform)/platform/admin/AdminTabs.tsx` | new "People" tab |
| `public/feed.xml` (written at build by `getRSS()` from the home page) | `frontend/lib/generateRSS.ts` | Source for the weekly feed→broadcast job (Resend has no RSS ingest). A snippets feed does not exist yet — added with that job |
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
  profile: {                 // typed projection of the core answers — aggregations key on this
    role: "student" | "researcher" | "developer" | "hobbyist" | "industry" | "other",
    languages: ("R" | "Python" | "JS" | "other")[],
    sports: string[],        // fixed list + "other"
    discoveredVia: Channel,  // how they first found an SDV project
    updatesVia: Channel[],   // how they hear about updates today
    newsChannel: Channel,    // where they WANT news delivered
  },
  answers: Record<string, unknown>,  // every answered question by id, incl. conditional follow-ups
  // Channel = "search" | "github" | "twitter" | "bluesky" | "discord" | "email" | "rss" | "conference" | "referral" | "youtube" | "other"
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

## Survey engine (shared by `/join` and `/survey`)

Questions are data, not JSX: `frontend/content/survey.ts` exports an ordered list of

```ts
{ id: string, section: "profile" | "discovery" | "followup" | "wants" | "package" | "stickers",
  type: "single" | "multi" | "text" | "email" | "address" | "package",
  label: string, help?: string, options?: { value: string, label: string }[],
  required?: boolean,
  showIf?: (answers: Record<string, unknown>) => boolean }
```

`<QuestionFlow questions sections onSubmit>` renders one section per step, evaluates `showIf` live, and never submits a hidden question's value. `/survey` passes sections `profile, discovery, followup`; `/join` passes all six. Follow-ups in the initial list:

| Trigger | Follow-up |
|---|---|
| `languages` includes R | which R packages they use (multi, from the packages collection) |
| `languages` includes Python | which Python packages (multi) |
| any sport picked | per-sport: pbp / box / schedules / models — what they actually pull |
| `newsChannel === "email"` | email field + newsletter opt-in pre-checked |
| `newsChannel === "discord"` | `wants.discord` pre-checked |
| `discoveredVia` ∈ {twitter, bluesky, youtube} | "are you following us there?" (single) |
| `wants.package` | package fields + org-tier checkbox |
| `wants.stickers` | name + address |

Server: `joinSchema`/`surveySchema` are built from the same list (zod per `type`) so validation can't drift from the UI; the `profile` projection is computed server-side from `answers`. Adding a follow-up is an edit to `content/survey.ts` only.

## Follow and fund

`components/FollowUs.tsx` — GitHub org (follow; star sdv-py), Bluesky, Twitter, YouTube, Discord (Discord only shown to approved people). `components/SupportUs.tsx` — from `content/support.ts`, which gains **GitHub Sponsors** (primary, first) and **Patreon**; order Sponsors → Ko-fi → Patreon → DigitalOcean referral. Placements for both: site footer, `/join` and `/survey` thank-you pages, `/about`, the Resend invite and sticker emails, and (Resend-side config) the Broadcast template footer.

Every link fires a GA event `follow_click { platform, placement }` / `support_click { platform, placement }` via the existing `/api/beacon` pattern. That plus `discoveredVia` / `updatesVia` / `newsChannel` is the channel report on the Population tab.

Org-wide: `FUNDING.yml` (Sponsors, Ko-fi, Patreon) in `sportsdataverse/.github` so every repo shows the Sponsor button. Patreon and Ko-fi native Discord integrations switched on for role sync — config in the runbook, no code.

## Flows

### Discord admission

```
/join (wants.discord)
  ├─ signed in + (isOrgMember || isContributor) → status "auto" → mint invite → show on screen + email
  └─ otherwise → status "pending" → appears in /platform/people
        ├─ approve → mint invite → email → status "approved"
        └─ decline (reason) → status "declined"; no email unless reviewer ticks "notify"
```

`isContributor`: on GitHub sign-in, one call `GET /search/issues?q=author:{login}+org:sportsdataverse+is:pr+is:merged` with the user's own token; `total_count > 0`. Cached on the JWT next to `isOrgMember` (`token.isContributor`).

Invite: `POST /channels/{DISCORD_INVITE_CHANNEL_ID}/invites` with `{ max_uses: 3, max_age: 604800, unique: true }` using `DISCORD_BOT_TOKEN` (bot needs *Create Instant Invite* on that channel only). Code stored on `people.discord`; "resend" re-emails the stored code while unexpired, otherwise mints a new one.

### Package submission

`/join` with `wants.package` shows the package fields (same set as `packageSchema` minus `published`) plus "consider this for the sportsdataverse GitHub org" checkbox. `POST /api/join` validates with `packageSchema`, inserts `{ ...pkg, published: false, submittedBy, orgTierRequested }`. `/packages/manage` lists unpublished entries first with a **Submitted** badge and an **Org tier** badge; approving = flipping `published` (existing PUT). Org-tier requests additionally get a checklist rendered in the CMS (license, maintainer, tests, CI) that a member ticks before flipping — informational only, no enforcement.

### Newsletter

Provider: **Resend** for everything — Contacts (list mirror), Broadcasts (issues), transactional. Chosen 2026-09-19 over Kit/Buttondown because it injects **no badge or ad at any tier**; the cost is that RSS-to-email is our own cron rather than a dashboard toggle.

- `lib/newsletter.ts` rewritten: `subscribeToResend(email)` → Resend `POST /contacts` (global contacts; a 409 falls back to `GET /contacts/{email}`). Returns the contact id, stored on `people.newsletter.resendContactId`. Segmentation by `role:*` / `lang:*` / `sport:*` uses Resend contact **properties** + segments (PR 2).
- Delete `app/api/mailchimp/route.ts`, `app/api/newsletter/route.ts`, the Substack post in `lib/newsletter.ts`, `md5` + `@mailchimp/mailchimp_marketing` deps, and `MAILCHIMP_*` / `NEXT_PUBLIC_NEWSLETTER_URL` from `.env.example`.
- Footer `NewsletterSignup` component (site layout) posts `{ email, wants: { newsletter: true } }` to `/api/join` — every subscriber lands in `people` first, then Resend.
- Resend-side config (documented in `frontend/SETUP-community.md`, not code): verified sending domain, API key, a footer block with support links in the Broadcast template. Blog and snippet issues come from the feed→broadcast cron (below), not an RSS setting.

Content routing (the operating model, also in SETUP-community.md):

| Content | Tool | Who writes |
|---|---|---|
| Blog post | Resend Broadcast created by the weekly feed→broadcast cron from `feed.xml` (draft; a member clicks send) | nobody extra — the MDX merge is the publish |
| Snippets | same cron, monthly digest, sent to the matching `lang:*` segment | nobody extra |
| Package releases | Resend broadcast, weekly, generated | nobody — `python/` cron builds it from GitHub releases |
| Announcements | Resend Broadcast, dashboard editor | any member with a Resend seat |
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
| `GET /platform/people` | `isOrgMember` | tabs: Queue · Population · Stickers |
| `GET /api/platform/people?view=queue\|unsynced\|all` | org member | list, no addresses |
| `POST /api/platform/people/[id]/approve` | org member | mint invite FIRST, then stamp reviewer; refuses `wants.discord: false` |
| `POST /api/platform/people/[id]/decline` | org member | reason, optional notify |
| `POST /api/platform/people/[id]/requeue` | org member | undo a decline |
| `POST /api/platform/people/[id]/retry-sync` | org member | refuses anyone who never opted in or never confirmed |
| `POST /api/platform/people/[id]/delete` | **org admin** | the one irreversible action |
| `POST /api/platform/people/[id]/resend` | org member | re-issue a stored or fresh invite; approved/auto only |
| `GET /api/platform/people/population` | org member | single-variable counts only — role, language, sport, Discord requests by status, what people asked for, newsletter state, and the channel funnel as three separate lists (`discoveredVia`, `updatesVia`, `newsChannel`). **No cross-tabs and no free-text breakdowns**: every org member reads this tab, and a cross-tab of small categories identifies people. `follow_click`/`support_click` totals by platform and placement come from the Plausible Stats API, keeping only values the site emits. Passive numbers: Discord member count (bot, needs `DISCORD_GUILD_ID`); newsletter subscribers counted from `people`, the list of record, not from Resend. CRAN/PyPI downloads deferred — there is no download-stats source yet. |
| `GET /api/platform/admin/stickers` · `POST …/[id]/ship` | `requireWriter()` | only place addresses are readable |
| `/platform/api-key` (existing) | `isOrgMember` | adds per-key quota + current usage readout (needs the sdv-db fields below) |

Env additions: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_INVITE_CHANNEL_ID`, `RESEND_API_KEY`, `EMAIL_FROM`. Removed: `MAILCHIMP_*`, `NEXT_PUBLIC_NEWSLETTER_URL`, EmailJS keys.

## Cross-repo work (not website code)

1. **sdv-db — per-key rate limits.** `rate_limit` (req/day) + usage counter per Data API key, 429 on exceed, both readable through the keys API so `/platform/api-key` can show them. Own PR in sdv-db. Gate on who can mint is unchanged.
2. **sportsdataverse/.github — org hardening runbook** (`docs/runbooks/github-org-permissions.md`) + `FUNDING.yml`. Read-only audit script (`gh api`): owners, base permission, every private repo with its visibility/teams, PAT + OAuth policies, 2FA enforcement, outside collaborators. Then a checklist a human executes: base permission → **No permission**; teams `core`, `maintainers`, per-sport with explicit repo grants; fine-grained PAT approval required; classic PAT restricted; OAuth app access restrictions on; 2FA required; outside-collaborator review. Confirmation-first for every switch — nothing is flipped by a script.
3. **Resend / Discord / Patreon / Ko-fi config** — captured in `frontend/SETUP-community.md`: bot + channel, sending domain, broadcast template footer with support links, Discord role sync.

## Errors

- Discord API failure on approve: person stays `pending`, route returns 502 with the Discord error; reviewer retries. Never mark approved without a stored invite code.
- Resend failure on join: person is still saved; `newsletter.syncedAt` absent; a nightly `python/` job (or admin "retry sync" button) resubscribes unsynced rows. Newsletter is best-effort, the person record is not.
- Resend failure: logged, does not fail the approve (code is on screen and resendable).
- Rate-limit exceeded: 429 with a plain message; no CAPTCHA until abuse is observed.

## Privacy

`static_pages/privacy.mdx` gains a section: what `/join` and `/survey` collect, that addresses are deleted when stickers ship, that `ip` is held 30 days for abuse prevention, and a removal contact. `people` deletion on request is a one-liner in the admin queue (Decline → Delete).

## Testing

- Unit (`node --test`, the runner `test:scripts` already uses — no new test framework): `joinSchema`/`surveySchema` edge cases; upsert/dedupe rules; `$unset` on ship; population aggregation on a seeded in-memory set.
- Route tests with mocked `auth()`: every admin route 401s without `isOrgMember`; `approve` never sets `approved` when the Discord mock throws.
- Manual: one real end-to-end on a dev Discord server with a throwaway bot; the 4-combination visual matrix per `CLAUDE.md` for `/join`, `/survey`, the footer, and the admin tab.

## Delivery order

1. **PR 1 — newsletter footer + follow/fund.** `lib/newsletter.ts` → Resend Contacts; delete Mailchimp/Substack; `NewsletterSignup`, `FollowUs`, `SupportUs` in the footer and `/about`; `content/support.ts` gains Sponsors + Patreon; minimal `/api/join` handling `{ email, wants.newsletter }` into `people`. Ships the owned list and the money links immediately.
2. **PR 2 — survey engine + Discord.** `content/survey.ts`, `<QuestionFlow>`, `/survey`, full `/join`, schemas from the question list, auto-admit, admin People tab (Queue), Discord bot, Resend transactional, thank-you pages with Follow/Support.
3. **PR 3 — packages + population.** Package section of `/join`, CMS badges, Population sub-tab with channel funnel + passive signals, `/platform/api-key` quota readout (once sdv-db ships fields).
4. **PR 4 — stickers.** `sticker_requests`, address section, Stickers sub-tab, privacy page update, Shop link.
5. **In parallel, other repos:** `.github` runbook + `FUNDING.yml`; sdv-db per-key rate limits.
6. **Later, separate specs:** weekly release digest via Resend; API paywall (supporter status, tiers, key gating).

Each PR is independently shippable; nothing in 3–4 blocks 1–2.
