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
mail cannot be sent and nobody can confirm. **`RESEND_FROM` was set in production on
2026-09-25 10:44 UTC** — double opt-in is live: a signup gets a confirmation link, and the
Resend contact is created only once it's clicked. The sending domain `sportsdataverse.org`
was confirmed **verified** in Resend on 2026-09-25 (its DKIM record is at
`resend._domainkey.sportsdataverse.org`, SPF and MX on `send.sportsdataverse.org`); if
confirmation mail stops arriving, check Resend → Domains first.

**Deploy order:**
1. done 2026-09-25: `npm run resend:properties` created all six contact properties. It needs a
   Resend key with **full access** — the site's own key is send-only and gets a 401 — and
   re-running is safe (existing properties are reported, not recreated).
2. deploy with `RESEND_FROM` unset — the state every deploy shipped in before step 5.
3. done 2026-09-25: the domain shows **verified** in Resend.
4. done: every `/join` Resend call now fires after the response is sent, via
   Next's `after()` (`JoinDeps.defer` in `frontend/lib/join.ts`, wired in
   `frontend/app/api/join/route.ts`) — including the **single opt-in** Resend
   contact create/refresh (`syncContact`), not only the double opt-in
   confirmation email, the Discord invite email, and the sticker got-it
   email. `RESEND_API_KEY` is set in production independently of
   `RESEND_FROM` (step 3 above already requires it), so before this fix
   `syncContact` ran synchronously in single opt-in mode: a brand-new address
   cost one Resend round trip (`POST /contacts`) before the reply, and an
   address that already had a contact cost two or three (`POST` → 409 →
   `GET` → optionally `PATCH` with the profile; see `lib/newsletter.ts`'s
   `subscribeToResend`). That was a **live** newsletter-membership timing
   oracle, with `RESEND_FROM` unset — unlike the double opt-in, Discord, and
   sticker calls, it never waited on step 5.

   No Resend call remains before the reply now. One Discord call does, by
   design: minting the invite for a GitHub-vouched visitor, whose reply has to
   carry the invite URL (and whose reply text already says whether their
   request was undecided). Beyond that, what's left is
   single-Mongo-write differences, both millisecond-scale and
   covered by the same 5/hr-per-IP rate limit as the rest of `/join`,
   documented here and deliberately not engineered around:
   - under double opt-in, `markNewsletterPending` writes a marker for a new
     or still-pending address, but not for one that already has a synced
     contact;
   - `recordClaimedLogin` (Discord half) writes only for an undecided
     record, never for a decided one.
5. set `RESEND_FROM` — **done: set in production 2026-09-25 10:44 UTC.** Double opt-in and
   Discord invite email are both live now; see the deploy-order status above and "The invite
   link and `RESEND_FROM`" below.

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

`/survey` is identified since 2026-09-25 — it requires an email and an identity, the
same as a full `/join` — and each submission upserts a `people` row by email:
`status: "survey"` until (if ever) that person also completes `/join`, which promotes
them to `"pending"` (see Identity and responses, below). `/join` asks the same questions
plus the wants section. Both validate against `content/survey.ts`; a question hidden by
`showIf` is never accepted. Rate limits: 10/IP/hour for the survey, 5/IP/hour for join.

## Identity and responses

Both a full `/join` and `/survey` collect identity through one schema
(`lib/identity.ts`): name (required), location (required — country, plus state/province
for the US, Canada or Australia, since those are the only entries `content/geo.ts` gives
a subdivision list for; city is always optional), and, optionally, up to 3 affiliations
(type + org required, title optional) and social handles/a website. Answering "industry"
or "researcher" to the role question makes at least one affiliation required
(`affiliationError`). The footer newsletter-only signup sends no `answers` and no
`identity` at all — `joinBodySchema` requires `identity` only when `answers` is present,
so that shape is untouched.

The contact notice both forms show next to the email field is fixed text
(`components/site/IdentityFields.tsx`'s `ContactFields`): "We'll use this to reply to
you, and may contact you about SportsDataverse collaborations, research, or your
answers. Ask us to stop any time: `sportsdataverse@gmail.com`." — that's the only
consent language a visitor sees before submitting.

Every questionnaire submission — a full `/join`, or a `/survey` — appends a document to
the `responses` collection (`lib/responses.ts`): one per submission, `source: "join" |
"survey"`, never overwritten. The `people` row (`lib/people.ts`) keeps only the LATEST
identity and answers; `responses` is the full history. The email in a submission is
never verified, so a resubmission under someone else's address overwrites their stored
identity on `people` — the newest submission wins there, but the earlier one is still in
`responses`. A `responses` write failure is logged and never fails the request
(`recordResponse` in `lib/join.ts`); the person write already stood by then.

A `/survey` respondent who later completes `/join` is promoted from `status: "survey"`
to `"pending"` (`promoteSurveyRespondent`), so a Discord request made through that later
`/join` reaches the review queue like anyone else's.

The `/platform/people` review queue shows a requester's affiliations and social handles,
labeled self-reported (`lib/peopleRow.ts`) — but only on a row currently `status:
"pending"` with `wants.discord: true`, i.e. only while a member is actually being asked
to vouch for them. Approved, declined, auto-admitted, or never-asked-for-Discord rows
show neither, in every view (Queue/Unsynced/All alike). No view ever shows a person's
location or their other answers.

PR 2 adds an admin browser for full identity and `responses` — see the next section.

## Community browser (admins)

`/platform/admin/community` — **admin-only**, behind the same `admin` role gate as
Keys/Errors/Traffic (`app/(platform)/platform/admin/layout.tsx`), not the `/platform/people`
review queue any org member can open. It is the one place full identity (name, email,
location, socials, affiliations) and a person's whole `responses` history are shown outside
Mongo itself, so it needs the stronger gate the review queue doesn't: that queue only ever
shows self-reported affiliations and socials, and only on a row awaiting a Discord decision
(see above). Every route under `app/api/platform/admin/community/**` calls `requireAdminApp`,
and a source-scan test (`test/personDataReaders.test.ts`) fails the build if a person-data
reader (`lib/communityData.ts`) is ever imported from anywhere else, or if a community admin
route is missing that call.

**Browsing.** The table filters by any question answer, affiliation type, country/state,
latest submission source, what someone asked for, Discord status, whether they gave an email
at all, whether the address is a reserved test domain, and do-not-contact — plus a text
search (name, email, city, affiliation org, social handles) and a submission-date range.
Every control writes the URL, so a filtered view is a shareable link. Below the table,
**aggregates** show a count per option for every one of those same dimensions, and picking
two dimensions turns that into a **cross-tab** (counts for each pair, e.g. role × sport).
Both the aggregates and the cross-tab are admin-only and exist only here — never add either
to `/platform/people`'s Population tab, which stays single-variable counts for exactly the
privacy reason described in the Population section below.

**The person page** (`/platform/admin/community/[id]`) shows one person's current identity
and answers, a do-not-contact toggle, and every submission in their `responses` history,
newest first, each showing the identity and answers as submitted that time (so a name or
location change over time is visible, not just the latest). Someone who joined before PR 1
kept no `responses` history at all — for them the page shows a single "before history was
kept" entry built from what's on their `people` record, dated when they joined, so the page
never renders empty for a legacy person.

**Do-not-contact.** To honor a "please stop contacting me" email: find the person on the
Community browser by their email (the search box), open their person page, and click "Mark
do-not-contact". That excludes them from every future CSV export from that point on; it does
not delete their record or their history, and it can be reversed from the same button. The
flag only affects exports — if they're also on the newsletter, separately unsubscribe their
Resend contact (or delete the record if they asked for that), or Resend keeps sending to them.
Turning it on or off is both recorded in the `admin_audit` collection, so there is always a
record of when and by whom.

**Export.** The "Export to CSV" button on the browser exports whatever the current filters
match. Left out of every export, always: anyone marked do-not-contact, anyone with no email
on file (answered before names were collected, or an incomplete row), anyone who hasn't made
an identified `/join` or `/survey` submission since the contact notice next to the email field
was added on 2026-09-25 (a footer-only newsletter signup never saw it, and neither did a
`/join` from before that date), anyone who has unsubscribed from the newsletter, and reserved
test addresses (`example.com`, `.test`, …) — the same addresses every other Community feature
treats as not-real. Every export is recorded in the `admin_audit` collection (who, when, the
filters used — the search text itself redacted, since it can hold a name or email — and how
many rows) — there is always a record of when an export happened and who ran it.

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
- **`RESEND_FROM` set — the configuration live in production since 2026-09-25 10:44 UTC:** the
  invite is emailed too, best-effort — a failed send is logged and does not change the
  response. Whether it actually arrives depends on the Resend sending domain being verified,
  which isn't something this file can confirm — check Resend → Domains if a recipient says
  they never got it.
- **`RESEND_FROM` unset** (a local `.env.local` without it, or a preview deploy that doesn't
  set it): nothing is emailed. An auto-admitted visitor still gets their invite, because the
  URL is right there in the `/join` response their browser just got. Someone approved from the
  queue does not — the People tab shows the reviewer the link ("Invite ready — send it
  yourself") and they relay it by hand. Re-submitting `/join` only re-shows an invite to the
  person whose own signed-in, vouched request minted it (`status: "auto"` stamped with their
  handle); every other caller — signed out, signed in as someone else, or approved from the
  queue — gets one neutral sentence, because the email in a request body proves nothing about
  who is sending it.

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
- **All** — for a member, everyone who asked for Discord (`wants.discord: true`, any status —
  pending, approved, declined or auto); a survey-only or newsletter-only respondent's name and
  email are admin-only and never appear here for a member. An admin's "All" is unfiltered — every
  person, whatever they asked for (`peopleViewFilter`, `lib/peopleRow.ts`). "Delete" is the one **admin-only**
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
`npm run test:lib`, which the `lib` job in `.github/workflows/unit-tests.yml`
runs on every pull request (`npm run build` does not run it).

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

## Stickers

The "where should we mail the stickers?" step of the full `/join` form writes a
`sticker_requests` document with the submitter's `people` id, name, and postal
address. Requests appear only at `/platform/admin/stickers` (`GET
/api/platform/admin/stickers`) — **admin-only**, unlike the `/platform/people`
review queue: a postal address is more sensitive than anything that queue shows,
so it sits behind the same `admin` role gate as Keys/Errors/Traffic rather than
being open to any org member. `listOpenStickerRequests` (`lib/stickers.ts`) is the
one function that returns an address, and that route is its one caller.

**Ship** and **Cancel** (`POST /api/platform/admin/stickers/[id]/[action]`,
`ship|cancel`, admin-only) are the two actions on a request. Ship records who
shipped it and when, and **erases the address in the same write** — there is
never a moment where a request is marked shipped and still holding an address.
The request row itself is kept as a record (name, ship date, who shipped it) and
feeds the "N shipped so far" count. It does not block a new request: the
one-open-request rule and its unique index cover only requests still waiting
to ship, so someone whose stickers went out can simply ask again. Cancel deletes
the request outright, address and all.

A person can hold one open request at a time, and the **first one wins**: the
email behind a `/join` submission is unverified, so letting a later submission
silently overwrite an open request would let anyone who types a stranger's email
address redirect that stranger's parcel. There is no update action — **Cancel,
then the person asks again** is the whole procedure, and it is one an admin can
actually carry out from the tab: the person writes to `sportsdataverse@gmail.com`
(the `CONTACT_EMAIL` constant, `content/links.ts`) — to fix a typo in their own
address, or because someone else's email ended up on a request naming them — the
admin finds the matching row at `/platform/admin/stickers` by the email now shown
on each row, clicks **Cancel**, and the person submits a fresh request on
`/join`. **Until `RESEND_FROM` is set, no got-it email is sent at all** — the
`/join` reply's sticker sentence is the only notice either of them gets, so it
says outright that the first address wins and where to write to change it. Once
`RESEND_FROM` is set, the got-it email (`stickerRequestEmail`, `lib/email.ts`) is
sent only when `/join` actually creates a **new** request — not when the person
already had one open. The email contains no address. Its line "Didn't ask for
stickers? Write to sportsdataverse@gmail.com and we'll cancel the request."
exists because of the first-wins rule: anyone who types someone else's email
address into the sticker fieldset sends this email to that address's real owner,
and writing in is how that person gets the bogus request cancelled. The got-it
email fires after the `/join` response is sent (see step 4 of "Deploy order"
above), so it never becomes a timing oracle once `RESEND_FROM` is set and it
starts sending.

Reserved test addresses (`example.com`, `.test`, …) record the sticker answers
like any other submission but never create a `sticker_requests` document, the
same as package submissions above — the PR-evidence walkthrough submits through
the sticker fieldset and leaves nothing behind.

Deleting a person (`removePerson`, `lib/review.ts`) deletes their sticker
requests — open or already shipped — before anything else: before their pending
packages, before the `people` record itself. That order means a failure partway
through a delete never leaves a person "gone" while their address is still on
file somewhere.

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

**Do not add cross-tabs or free-text breakdowns to this tab.** This is a durable
privacy rule. The tab shows single-variable counts (role, sport, language,
status, …) of closed-list, low-sensitivity answers, and even those are not
anonymous: the Queue/Unsynced/All views show no survey answers, but a member who
compares the totals before and after one new person joins can read off that
person's answers. That risk was accepted for these counts. A cross-tab (e.g.
role × sport) or a free-text breakdown would make it far worse — it narrows small
categories down to a handful of people, or shows someone's own words.
