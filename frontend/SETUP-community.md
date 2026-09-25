# Community features — setup

What an operator does once so the site's people-facing features work. Code
side: `lib/join.ts`, `lib/joinSchema.ts`, `lib/people.ts`, `lib/newsletter.ts`, `lib/rateLimit.ts`,
`lib/discord.ts`, `lib/review.ts`.

## Newsletter (Resend)

Why Resend: no badge or ad in the mail at any tier, and the same key sends the
transactional mail later PRs add.

1. resend.com → Domains → verify `sportsdataverse.org` (DKIM + SPF records in DNS)
   so Broadcasts send from `news@sportsdataverse.org`.
2. resend.com → API Keys → create a key with **full access** (contacts need write).
3. Set `RESEND_API_KEY` locally (`.env.local`) and on Vercel (Production + Preview).
4. Every subscriber is stored in Mongo `people` first, then created as a Resend
   Contact (`POST /contacts`; an existing contact is looked up instead — and if that
   contact had unsubscribed, the person is recorded as `newsletter.unsubscribed: true`
   rather than re-subscribed: an anonymous form must not undo someone's opt-out). If Resend is
   down the person is still stored with no `newsletter.syncedAt`; the
   "retry sync" action in the People tab fixes it.
5. Reserved test domains (`example.com`, `.test`, …) are stored with
   `newsletter.skipped = "reserved-domain"` and never sent to Resend — that is what
   the CI walkthrough submits.

Sending an issue: resend.com → Broadcasts → New → pick the segment (all contacts
for now; profile-based segments arrive with PR 2), write, send. Resend has no
RSS-to-email; the weekly feed→broadcast job is the release-digest cron in the spec
(later, separate).

## Double opt-in

Newsletter signup becomes double opt-in once `RESEND_FROM` is set (e.g.
`SportsDataverse <news@sportsdataverse.org>`) (and a token secret exists —
`JOIN_TOKEN_SECRET`, falling back to `NEXTAUTH_SECRET`, which Auth.js already requires).
Set `RESEND_FROM` only after the domain is verified in Resend → Domains, or confirmation
mail cannot be sent and nobody can confirm. Until then signup is single opt-in (contact
created immediately).

**Deploy order:**
1. `npm run resend:properties`
2. deploy with `RESEND_FROM` unset
3. verify the domain
4. set `RESEND_FROM`

- Confirmation links are `/api/join/confirm?t=<token>`: an HMAC over the person id +
  expiry (7 days), signed with `JOIN_TOKEN_SECRET` (falls back to `NEXTAUTH_SECRET`).
- A person who signed up but has not confirmed has `newsletter.pending.sentAt`; the
  Resend contact is created on confirm with `newsletter.confirmedAt`. The marker is written
  before the send, so an address whose confirmation mail failed still reads as unconfirmed —
  but never over an existing contact record, whose `confirmedAt` / `unsubscribed` is that
  person's own proof of consent.
- `/api/join` answers a re-signup of an already-confirmed address exactly as it answers an
  unknown one ("check your inbox for the link"). Two different sentences would let anyone with
  a list of addresses test which are subscribed — the same reason the Discord half returns one
  sentence to every caller it cannot identify.

## Contact properties (segmentation)

Contacts created from the **full join form** carry `role`, `languages`, `sports`,
`discovered_via`, `updates_via`, `news_channel` (strings; lists comma-joined) from that
person's profile. A newsletter-only signup (the footer form) has no profile, so its
contact carries none of them. Resend refuses unknown property keys, so create them once
per account — keep the key out of your shell history by sourcing `.env.local` rather
than putting it on the command line:

```sh
set -a; . .env.local; set +a
npm run resend:properties
```

Then build Segments in Resend (e.g. `languages contains R`) to target Broadcasts.

## Survey

`/survey` is anonymous (no email, no name): each submission is a `people` row with
`status: "survey"`. `/join` asks the same questions plus the wants and an email. Both
validate against `content/survey.ts`; a question hidden by `showIf` is never accepted.
Rate limits: 10/IP/hour for the survey, 5/IP/hour for join.

## Discord admission

1. discord.com/developers → New Application → Bot → copy the token into `DISCORD_BOT_TOKEN`.
2. Invite the bot to the server with the `bot` scope; it needs only **Create Instant Invite**,
   and only on the one channel newcomers should land in.
3. Pick that channel and copy its id (Developer Mode → right-click the channel → Copy Channel
   ID) into `DISCORD_INVITE_CHANNEL_ID`.

Every invite is minted per person — 3 uses, 7 days, `unique: true` (`lib/discord.ts`) — so no
invite link is ever shared or reused across people. Someone who is a `sportsdataverse` org
member, or who has a merged PR anywhere in the org, is admitted the moment they ask
(`status: "auto"`) — **provided they are signed in**: `/join` carries its own GitHub sign-in
button for exactly this, and a visitor with no session is always queued, org member or not.
Everyone else lands in the Queue view below for any org member to approve or decline. Two things route what would otherwise be an on-the-spot admit into the queue instead:
minting the invite failing (Discord down, bad token, wrong channel — the person is put back to
`status: "pending"`, never left `"auto"` with no invite to show for it), and the visitor's
GitHub login already belonging to a different `people` record (queued rather than risking a
second invite for the same human). Without `DISCORD_BOT_TOKEN` or `DISCORD_INVITE_CHANNEL_ID`
set, minting fails the same way — the request is still recorded, just always queued.

**The invite link and `RESEND_FROM`.** Minting an invite — the on-the-spot auto-admit at
`/join`, or a reviewer's Approve/Resend in the People tab — always returns the invite URL in
that response; whether it is *also emailed* depends on `RESEND_FROM` (see Double opt-in
above):
- **`RESEND_FROM` set:** the invite is emailed too, best-effort — a failed send is logged and
  does not change the response.
- **`RESEND_FROM` unset — the configuration currently live in production, since the sending
  domain isn't verified yet:** nothing is emailed. An auto-admitted visitor still gets their
  invite, because the URL is right there in the `/join` response their browser just got.
  Someone approved from the queue does not — the People tab shows the reviewer the link
  ("Invite ready — send it yourself") and they relay it by hand. Re-submitting `/join`
  only re-shows an invite to the person whose own signed-in, vouched request minted it
  (`status: "auto"` stamped with their handle); every other caller — signed out, signed in as
  someone else, or approved from the queue — gets one neutral sentence, because the email in a request
  body proves nothing about who is sending it.

## Reviewing people

`/platform/people` (any signed-in org member) has three views:

- **Queue** — pending Discord requests (`status: "pending"`, `wants.discord: true`). Approve
  mints (or reuses a still-live) invite per the email rule above **and only then** records the
  approval: if minting fails (Discord down, or the bot not created yet) nothing is stamped and
  the person stays in this queue, with the Discord error shown to you — an approval never
  exists without an invite behind it. Approve, Decline, Resend invite and Back to queue all
  refuse a person who never asked for Discord (`wants.discord: false`), and are only offered on
  rows that did, so a newsletter subscriber cannot be decided about by mistake — and nobody is
  requeued into a `pending` state the Queue view (`wants.discord: true`) would not show. Decline stores a reason and
  only emails it when you tick "notify" (and only if `RESEND_FROM` is set). A decline stands —
  re-submitting `/join` does not reopen it — but it is not permanent: **Back to queue** on a
  declined row returns them to `pending` for a fresh look.
- **Unsynced** — people who want the newsletter but have no Resend contact yet
  (`wants.newsletter: true`, no `newsletter.resendContactId`): a failed sync, a signup from
  before the key was set, or someone still waiting on their double opt-in confirmation link,
  since that link also leaves no `resendContactId` until it's clicked. "Retry sync" creates the
  Resend contact with their profile properties, but only for someone the record shows asked for
  it. It refuses: an unclicked double opt-in (`newsletter.pending` with no `confirmedAt`) —
  including one whose confirmation email failed to send, which is recorded the same way — a
  reserved domain (`newsletter.skipped`, the `@example.com` addresses CI walkthroughs submit),
  anyone who didn't ask for the newsletter, and anyone who already unsubscribed. Under single
  opt-in (`RESEND_FROM` unset) no `pending` marker is ever written, so those rows sync
  normally — the form tick is the consent.
- **All** — everyone, for finding a specific person. "Delete" is the one **admin-only**
  action — every other one is reversible by a reviewer, erasing the record is not. It erases
  the Mongo record for a removal request, and first any package the person submitted that is
  not yet published (if that fails, the record is kept, so Delete can simply be retried); a
  published package stays, since it is a public org listing — delete it in `/packages/manage`
  if the request covers it. The Resend contact, if any, must be deleted separately in the Resend
  dashboard — deleting the record does not touch it.

## Click tracking (Plausible)

Footer and callout links fire `follow_click` / `support_click` with
`{ platform, placement }`. In Plausible → Site settings → Goals, add both as
custom events so they show up in the dashboard with their props.

**Event props:**
- `follow_click`: `platform` is `github`, `bluesky`, or `twitter`; `placement` is
  `footer`, `join-thanks`, `survey-thanks`, or `confirmed`.
- `support_click`: `platform` is `kofi`, `paypal`, or `digitalocean`; `placement` is
  `footer`, `footer-bar`, or `callout`.

**Note:** `next-plausible` enables its script only when `NEXT_PUBLIC_VERCEL_ENV` is
`production` or unset, so events fire on the production deployment only — not on a
Vercel Preview. Locally or on a Preview, verify by stubbing `window.plausible` in
DevTools and clicking a tracked link.

## Rate limiting

`POST /api/join` allows 5 sign-ups per IP per hour, and `POST /api/survey` allows 10
submissions per IP per hour, both counted in the Mongo `rate_limits` collection (TTL
index on `expiresAt`, created on first request). Nothing to configure.

## Package submissions

The "want to list your package" step of the full `/join` form writes a `packages`
document with `submittedBy` set to the submitter's `people` id. That field, not
`published`, is what keeps it off the site: `published: false` alone does **not**
hide a package in this collection — every legacy package carries it and has always
been public. The one rule is `PUBLIC_PACKAGE_FILTER` / `isPubliclyVisible` in
`lib/packageVisibility.ts` (no `submittedBy` → visible as it always was; a
submission → visible only once a member sets `published: true`), and **every
public reader of `packages` must use it** — `/packages`, `/api/packages`, `/about`,
`/stats`, the homepage ticker, and the package dropdown in the join form all do.
`test/packageVisibilityReaders.test.ts` fails if a new reader reads `packages`
without it; the one allowed exception is the member CMS at `/packages/manage`,
which has to see unapproved submissions to review them. It is part of
`npm run test:lib`, which the `lib` job in `.github/workflows/pr-evidence.yml`
runs on every pull request that touches `frontend/` (`npm run build` does not
run it).

Submission links are restricted to `http://`/`https://` (zod's `.url()` alone would
also accept `javascript:` or `data:`). One row per person per package title, and
the first submission wins: resubmitting the same title — pending or already
published — changes nothing and gets the same reply, so a retry cannot stack a
duplicate, and someone who knows a submitter's email and package title (the
email is not verified) cannot rewrite the links on a pending submission or touch
a live listing. A correction goes through a member editing the row in the CMS. A
different title is a separate submission. A reserved test address (`example.com`, `.test`, …) — what the
PR-evidence walkthrough submits through the full join form — records the answers
as always but never creates a `packages` document, so the walkthrough cannot leave
a fake package in the CMS queue.

In `/packages/manage`, rows awaiting review sort first (newest first) and carry one
badge, "Submitted · not public yet"; a package the submitter also checked as
wanting the org tier shows an informational checklist (OSI license, a named
maintainer, tests, CI) that is not saved anywhere — it is a prompt for the
reviewer, not a field on the document. Approving a submission is the existing
edit flow: ticking "published" and saving sets `published: true`, the same action
a member has always used to edit any package.

**A gap this PR knowingly leaves alone:** the CMS's published checkbox has never
hidden a *member-created* package from the public `/packages` page — that page
shows every row with no `submittedBy`, published or not. Changing that would hide
every legacy package that has no `submittedBy` and predates the checkbox, so PR 3
leaves it as is; only a visitor submission (`submittedBy` present) is gated on
`published`.

## Population

`/platform/people`'s Population tab (`GET /api/platform/people/population`, any
signed-in org member) is counts only — it never returns a name, email, handle, or
any other per-person value. The endpoint projects only `status`, `wants`,
`profile`, and `newsletter` out of Mongo `people` before aggregating. "Discord
requests by status" counts only people who asked for Discord (`wants.discord`);
pooling in newsletter-only signups would make the count read like a review backlog
that isn't there.

The Discord member count needs `DISCORD_GUILD_ID` (the bot token is already
required for admission above); without it the tab shows "—" for that stat. The
follow/support click counts come from the Plausible Stats API and need both a key
and matching Plausible configuration — until all of it is in place the tab says
the section "Not configured":

1. Plausible → Account settings → API keys → create a **Stats API** key.
2. Set `PLAUSIBLE_API_KEY` on Vercel (Production + Preview) and redeploy — reading
   it only happens server-side in the population route.
3. In the site's Plausible settings, add `follow_click` and `support_click` as
   custom event goals, and `platform` / `placement` as custom properties (the
   Click tracking section above already covers firing them).
4. `PLAUSIBLE_SITE_ID` is optional; it defaults to `sportsdataverse.org`.

Once the key is set but the goals or properties above are still missing, the tab
no longer says "not configured" — it can show zero rows instead, with a hint to
check that the goals and properties are set up correctly.

Anyone can send Plausible an event for our domain with any property text, so the
tab shows only rows whose `platform` and `placement` are values the site emits
(the lists under Click tracking above, kept in `lib/plausible.ts`). A new tracked
link with a new value must be added there, or its clicks never appear.

**Do not add cross-tabs or free-text breakdowns to this tab.** A reviewer
established this as a durable privacy rule: single-variable counts (role, sport,
language, status, …) are safe because a member can already see any individual
person's record in the Queue/Unsynced/All views. A cross-tab (e.g. role × sport)
narrows small categories down to a handful of people and can identify someone the
counts-only design is meant to protect.
