# Community identity and the admin response browser — design

**Status:** agreed in conversation 2026-09-25; awaiting written review.
**Builds on:** `2026-09-18-community-join-flow-design.md` (PRs #47–#54). Where the two disagree, this
document wins for the fields and screens it covers.

## Goal

Collect enough about each person who fills in `/join` or `/survey` to (1) know who uses
SportsDataverse (which teams, outlets and universities), (2) reach people for outreach and
partnerships, (3) give Discord reviewers context on a joiner, and (4) follow up with people about
their answers. Keep every submission, and give org admins a way to page through people, filter
them by any answer, see aggregates, and export a contact list.

## Decisions (made with the org owner)

| Question | Decision |
|---|---|
| Who can browse individual responses with contact details | **Org admins only**, in a new admin tab. Org members keep the Discord review queue, which gains the requester's affiliation and socials. The member-readable Population tab stays counts-only. |
| `/survey` anonymity | **`/survey` becomes identified** (name + email required) for new submissions. Earlier anonymous answers stay anonymous; nothing re-identifies them. |
| Required identity fields | **Name and email required; socials optional.** |
| Affiliations | **Structured list** (type + organization + optional title), **required when the role is "Work in sports or media" or "Researcher / academic"**, optional otherwise. |
| Location | **Country required; state/province required for the US, Canada and Australia (select), optional free text elsewhere; city optional.** Kept apart from the sticker mailing address and never used to mail anything. |
| Permission to contact | **Implied by giving an email**, disclosed next to the email field and on the privacy page, honored through a do-not-contact flag. |
| Repeat submissions | **Every submission kept**, grouped by person; the person record holds the latest. |
| Browser features | Paging, filters, person history, **aggregates with a pick-two cross-tab**, **text search**, **CSV export** (logged), **do-not-contact flag**. |

## Non-goals

- No re-identification of past anonymous survey answers.
- No email verification of `/join` or `/survey` addresses (history makes overwrites visible instead).
- No member-readable per-person answers, cross-tabs or free-text breakdowns (the Population rule stands).
- No pre-filling of the sticker address from location, and no mailing from location.
- No saved filters, no scheduled exports, no CRM sync. A filtered view is a URL; an export is a file.

## Data model

### `responses` (new)

One document per submission, **append-only** (nothing updates or deletes a response except
deleting the person):

```ts
{
  _id: ObjectId,
  personId: ObjectId,
  source: "join" | "survey",
  createdAt: Date,
  identity: {                // exactly what this submission said
    name: string,
    location: Location,
    socials?: Socials,
    affiliations?: Affiliation[],
  },
  answers: Answers,          // same shape as people.answers today
  profile: Profile,          // same projection as people.profile today
}
```

Index `{ personId: 1, createdAt: -1 }`. `removePerson` deletes a person's responses along with their
sticker requests and pending packages, before the person (same order-and-abort rule as #53).

### `people` (existing) — new and changed fields

```ts
location?: { country: string /* ISO 3166-1 alpha-2 */, region?: string, city?: string },
socials?: { github?: string, bluesky?: string, x?: string, linkedin?: string, website?: string },
affiliations?: Array<{ type: AffiliationType, org: string, title?: string }>,   // at most 3
doNotContact?: { at: Date, by: string },                                          // PR 2
lastSubmittedAt?: Date,
```

- `name` (existing) is required on every new submission.
- `name`, `location`, `socials`, `affiliations`, `answers`, `profile` hold the **latest** submission,
  so a person can update themselves; the Population tab and the review queue keep reading the
  fields they read today.
- `AffiliationType`: `pro_team_league`, `college_athletics`, `media`, `academic`,
  `betting_fantasy`, `sports_tech`, `other` (labels: Pro team or league, College athletics, Media or
  journalism, University or research, Betting or fantasy, Sports tech or data company, Other).
- Socials are stored normalized: GitHub, Bluesky and X as bare handles (no `@`, no URL), LinkedIn as
  the `linkedin.com/in/<slug>` path slug, website as an `http(s)` URL.
- Region: a code from a fixed list for US (50 states + DC + PR), CA (13 provinces and territories) and
  AU (8 states and territories) — `TX`, `ON`, `NSW`; free text elsewhere. The three lists are constants
  in `content/`, not a dependency.

### Unverified email

The email on both forms is unverified. A stranger who submits with someone's address changes the
person record's latest identity until the owner resubmits. That is accepted, and made visible rather
than prevented: the earlier submission stays in `responses`, the admin person view marks **identity
changed since the previous submission**, and the member queue labels affiliation and socials
*self-reported* (as it already labels the claimed GitHub login).

### Legacy records — no backfill

A person with no `responses` (everyone before PR 1) is shown with one **implicit submission** built
from their stored `answers`/`profile`/`name`, dated `createdAt`. Anonymous survey rows (no email)
stay as they are and are labeled **anonymous (before names were required)**. No migration script.

## PR 1 — Collect

### Forms (`components/site/QuestionFlow.tsx`, both `/join` and `/survey`)

**Profile step**, after "What best describes you?":
- **Location:** Country (required, searchable select over ISO 3166-1, names from
  `Intl.DisplayNames`); State/province (required select for US, CA, AU; optional free text for every
  other country); City (optional).
- **Affiliations:** 1–3 rows of Type (select) · Organization · Title (optional), with "Add another".
  Required (at least one row) when role is `industry` or `researcher`; otherwise optional and
  collapsed behind "Add an affiliation".

**Last step, contact:**
- Name (required), Email (required) — now on `/survey` too.
- Socials (optional): GitHub, Bluesky, X, LinkedIn, Website.
- Under the email field: *"We'll use this to reply to you, and may contact you about SportsDataverse
  collaborations, research, or your answers. Ask us to stop any time: sportsdataverse@gmail.com."*
  (`CONTACT_EMAIL` from `content/links.ts`.)

Every input has an accessible name; required text inputs use `pattern=".*\S.*"` as the sticker
fields do.

### Server

- A shared `lib/text.ts` holds the control/bidi rejection now in `lib/stickers.ts`
  (`FORBIDDEN_CHARS`, `noControlOrBidi`, `line`, `optLine`); stickers imports it. Name, city, free-text
  region, organization and title all use it.
- `identitySchema` (new, `lib/identity.ts`): `{ name, location, socials?, affiliations? }`, with:
  - country ∈ the ISO list; region required and ∈ the subdivision list when country ∈ {US, CA, AU};
  - affiliations ≤ 3; at least one when `answers.role` ∈ {`industry`, `researcher`} (checked where
    the answers are validated, since the rule spans both);
  - socials: GitHub `^[A-Za-z0-9-]{1,39}$`; X `^\w{1,15}$`; Bluesky a domain-style handle; LinkedIn a
    `linkedin.com/in/<slug>` URL or bare slug; website `http(s)` only. A pasted `@handle` or profile
    URL is normalized to the stored form, not rejected;
  - every error names its field.
- `joinBodySchema` gains `identity`; `surveyBodySchema` gains `email` and `identity`.
- `POST /api/survey` finds or creates the person by email (the existing unique sparse index on
  `people.email` prevents duplicates). It `$set`s only identity, `lastSubmittedAt` and the survey's own
  questions (`answers.<id>` per survey question, and `profile`) — **never** `wants`, `status`,
  `newsletter`, `discord`, stickers or packages. A new person created by `/survey` gets
  `status: "survey"` and all `wants` false.
- Both handlers insert a `responses` document after writing the person. If that insert fails, the
  person write stands, the failure is logged (person id only), and the reply is unchanged.
- **Replies stay identical:** `/survey` returns one fixed thank-you whether the email is new or known,
  and makes no outbound call. `/join`'s replies and its after-the-response sends (#54) are unchanged.
- Reserved test domains store normally on both forms (the walkthroughs rely on it); the browser
  labels them and export skips them (PR 2).
- Rate limits unchanged (`/join` 5/h, `/survey` 10/h per IP).

### Member queue (`/platform/people`)

For people awaiting a Discord decision, show affiliation(s) and socials, labeled *self-reported*,
read from the person record. No location, no answers, no email-derived data beyond what the queue
shows today. No new member-readable endpoint.

### Privacy page

- `/survey` now asks for a name and email; answers given before this change stay anonymous.
- What we collect: name, email, location (country, state/province, optional city), optional socials,
  affiliations; location is for understanding where the community is, never for mailing.
- Giving an email means we may contact you about collaborations, research or your answers; ask us to
  stop at sportsdataverse@gmail.com and we will not contact you again.
- Who sees what: org admins see everything; org members reviewing a Discord request see that
  person's affiliations and socials.
- Deletion covers responses too.

### Evidence

`scripts/walkthroughs/join.mjs` and `survey.mjs` fill the new fields (reserved address).

## PR 2 — Browse

### Where

`/platform/admin/community` (tab **Community** in `AdminTabs`), inside the admin layout. API under
`/api/platform/admin/community/**`; every route calls `requireAdminApp()` first and sends
`Cache-Control: no-store`.

### Filters (URL query → Mongo)

`lib/communityFilter.ts` `buildPeopleFilter(params)` maps an **allowlist** of parameters to a filter
over `people` (latest answers); no raw key from the URL reaches `$match`. Filters:
- any closed-list question in `content/survey.ts`: single-choice = any of; multi-choice = includes any of;
- role, affiliation type, country, region, source of latest submission (`join`/`survey`), latest
  submission date range;
- wants (discord / newsletter / stickers / package), Discord status;
- identified vs anonymous-legacy, test address, do-not-contact.

**Search** `q`: case-insensitive, regex-escaped match over name, email, city, affiliation org, and
every social handle. A full scan; fine at thousands of people. Upgrade path if it becomes slow: a
text index.

### Screens

- **List:** 50 per page, newest submission first; columns name, email, top affiliation, role,
  country/region, source, last submitted; badges do-not-contact, anonymous-legacy, test address,
  identity changed. Total count shown.
- **Person view:** identity, location, socials (linked), affiliations, wants and Discord status,
  do-not-contact toggle, and every submission newest first (implicit one for legacy), with identity
  changes between consecutive submissions highlighted.
- **Aggregates panel** (for the current filter): counts for every closed-list question, affiliation
  type, country, region, source; multi-choice counted once per selected option; a pick-two cross-tab
  (any two of those dimensions). One `$facet` over the filtered people. Anonymous-legacy rows count.

### CSV export

`GET /api/platform/admin/community/export.csv?<filter>`: name, email, location, socials,
affiliations, role, latest answers, source, last submitted. **Always excludes** do-not-contact,
anonymous-legacy and test-address rows. Every export inserts an `exports_log` document
`{ by, at, params, count }` before streaming. Cells beginning `=`, `+`, `-`, `@`, tab or CR are
prefixed with `'` (formula injection). The button shows the row count and asks for confirmation.

### Do-not-contact

`POST /api/platform/admin/community/[id]/do-not-contact` `{ on: boolean }` sets
`doNotContact: { at, by }` or unsets it; both directions are logged. Shown as a badge; excluded from
export.

### Guard test

`test/personDataReaders.test.ts` (source scan, like `stickerAddressReaders.test.ts`): only files under
`app/api/platform/admin/community/**` and `lib/` may read `responses` or project `email`, `location`,
`socials` or `affiliations` from `people` — except the member queue route, which may project
`socials` and `affiliations` only; and every community route calls `requireAdminApp()`.

## Failure modes

| Case | Behavior |
|---|---|
| Response insert fails after the person write | Person stands, failure logged (person id), reply unchanged; browser shows the implicit submission. |
| Two simultaneous first submissions of one email | Unique sparse email index; the loser upserts into the winner. |
| Invalid social / affiliation / location | 400 naming the field; pasted URLs and `@handles` normalized first. |
| Stranger submits with someone's email | Latest identity changes; history keeps the original; "identity changed" badge. |
| Export of a huge set | Streamed; no row cap in v1 (the data is thousands, not millions). |
| Legacy anonymous rows | In aggregates; never in exports, never matched by email search. |

## Testing

- `test:lib` unit tests: `identitySchema` (each social format and normalization, affiliation-for-role,
  region-for-country, field-named errors); `/survey` upsert never touches `wants`/status/newsletter;
  response insert and its failure path; identity-change detection; `buildPeopleFilter` (allowlist,
  regex escaping, each filter kind); aggregate and cross-tab pipelines on the fake DB; CSV escaping
  and the three exclusions; do-not-contact on/off.
- Reply identity: `/survey` new vs known email → identical body.
- Source-scan guard tests (above), and the existing sticker-address guard still passes.
- Walkthroughs for `/join` and `/survey`; the admin tab is behind auth, so PR 2 attaches a hand
  recording per the repo's evidence rules.

## Rollout

1. PR 1 (Collect) with the privacy-page change, so `/survey` never asks for a name before the page
   says so.
2. PR 2 (Browse).
Each PR goes through the same review loop as #50–#54.
