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
   down the person is still stored with no `newsletter.syncedAt`; the admin
   "retry sync" arrives with the People tab (PR 2).
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
  Resend contact is created on confirm with `newsletter.confirmedAt`.

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
(`status: "auto"`); everyone else lands in the Queue view below for an admin to approve or
decline. Two things route what would otherwise be an on-the-spot admit into the queue instead:
minting the invite failing (Discord down, bad token, wrong channel — the person is put back to
`status: "pending"`, never left `"auto"` with no invite to show for it), and the visitor's
GitHub login already belonging to a different `people` record (queued rather than risking a
second invite for the same human). Without `DISCORD_BOT_TOKEN` or `DISCORD_INVITE_CHANNEL_ID`
set, minting fails the same way — the request is still recorded, just always queued.

**The invite link and `RESEND_FROM`.** Minting an invite — the on-the-spot auto-admit at
`/join`, or an admin's Approve/Resend in the People tab — always returns the invite URL in
that response; whether it is *also emailed* depends on `RESEND_FROM` (see Double opt-in
above):
- **`RESEND_FROM` set:** the invite is emailed too, best-effort — a failed send is logged and
  does not change the response.
- **`RESEND_FROM` unset — the configuration currently live in production, since the sending
  domain isn't verified yet:** nothing is emailed. An auto-admitted visitor still gets their
  invite, because the URL is right there in the `/join` response their browser just got.
  Someone an admin approves from the queue does not — the People tab shows the admin the link
  ("Invite ready — send it yourself") and the admin relays it by hand.

## Reviewing people

`/platform/admin/people` (org members with the `admin` role) has three views:

- **Queue** — pending Discord requests (`status: "pending"`, `wants.discord: true`). Approve
  mints (or reuses a still-live) invite per the email rule above; a person who never asked for
  Discord (`wants.discord: false`) cannot be approved into it — the route refuses with "nothing
  to approve." Decline stores a reason and only emails it when you tick "notify" (and only if
  `RESEND_FROM` is set). A decline stands — re-submitting `/join` does not reopen it.
- **Unsynced** — people who want the newsletter but have no Resend contact yet
  (`wants.newsletter: true`, no `newsletter.resendContactId`): a failed sync, a signup from
  before the key was set, or someone still waiting on their double opt-in confirmation link,
  since that link also leaves no `resendContactId` until it's clicked. "Retry sync" creates the
  Resend contact with their profile properties immediately — it does not check whether a
  confirmation link was ever clicked, so running it on someone mid-confirmation subscribes them
  without that click. Someone who didn't ask for the newsletter, or who already unsubscribed,
  cannot be synced — the route refuses.
- **All** — everyone, for finding a specific person. "Delete" erases the Mongo record for a
  removal request; the Resend contact, if any, must be deleted separately in the Resend
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
