# Community features — setup

What an operator does once so the site's people-facing features work. Code
side: `lib/join.ts`, `lib/joinSchema.ts`, `lib/people.ts`, `lib/newsletter.ts`, `lib/rateLimit.ts`.

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

## Click tracking (Plausible)

Footer and callout links fire `follow_click` / `support_click` with
`{ platform, placement }`. In Plausible → Site settings → Goals, add both as
custom events so they show up in the dashboard with their props.

**Event props:**
- `follow_click`: `platform` is `github`, `bluesky`, or `twitter`; `placement` is
  `footer` only.
- `support_click`: `platform` is `kofi`, `paypal`, or `digitalocean`; `placement` is
  `footer`, `footer-bar`, or `callout`.

**Note:** `next-plausible` enables its script only when `NEXT_PUBLIC_VERCEL_ENV` is
`production` or unset, so events fire on the production deployment only — not on a
Vercel Preview. Locally or on a Preview, verify by stubbing `window.plausible` in
DevTools and clicking a tracked link.

## Rate limiting

`POST /api/join` allows 5 sign-ups per IP per hour, counted in the Mongo
`rate_limits` collection (TTL index on `expiresAt`, created on first request).
Nothing to configure.
