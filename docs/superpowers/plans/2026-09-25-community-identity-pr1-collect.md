# Community identity — PR 1 (Collect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/join` and `/survey` collect a required name, email and location, optional socials, and structured affiliations (required for industry/research roles); keep every submission in an append-only `responses` collection; show Discord reviewers a requester's self-reported affiliations and socials.

**Architecture:** One zod `identitySchema` (`lib/identity.ts`) validates and normalizes identity for both endpoints; a shared `lib/text.ts` holds the control/bidi rule both identity and stickers use. `people` keeps the latest identity/answers (set, or unset when absent); every questionnaire submission also appends a `responses` document. The forms get one new client component, `IdentityFields.tsx`, rendered on the profile step (location, affiliations) and the last step (name, email, socials, contact notice) of both modes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, zod 3.25, MongoDB driver 6, `node --test --experimental-strip-types` with the in-memory `test/fakeDb.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-community-identity-and-browser-design.md` (sections "Data model" and "PR 1 — Collect"). PR 2 (admin browser) is a separate, later plan.

## Global Constraints

- All node commands run from `frontend/`. Gates: `npm run test:lib` (0 failing), `npx tsc --noEmit`, `npm run lint`, and — for tasks touching `app/` or `components/` — `timeout 600 npm run build; echo EXIT=$?` in the FOREGROUND with a Bash tool timeout of 600000 ms (the 120 s default silently backgrounds it). Afterwards `ps aux | grep "[n]ext build"` must show nothing of yours.
- **Never type a backslash-u escape sequence into a tool parameter** (Edit/Write/Bash): the transport decodes it into the raw invisible character (Trojan Source). The `FORBIDDEN_CHARS` regex must be MOVED by a script, byte for byte (Task 1 shows how). After any commit touching regexes, run the codepoint scan in Task 1 Step 7.
- Every `/join` and `/survey` reply is identical regardless of stored state (membership-oracle rule). `/survey` makes no outbound call.
- The footer newsletter form posts `{ email, placement }` to `/api/join` with NO `answers`; it must keep working with no identity.
- `/join`'s email and `/survey`'s email are unverified: the person record holds the LATEST submission, history lives in `responses`; nothing is locked.
- Required-field copy is exact: name "Name", country "Country", region "State / province", city "City", organization "Organization", title "Title"; error messages begin with the field label followed by a colon.
- Contact notice text, verbatim (with `CONTACT_EMAIL` from `content/links.ts`): "We'll use this to reply to you, and may contact you about SportsDataverse collaborations, research, or your answers. Ask us to stop any time: sportsdataverse@gmail.com."
- Commits: Conventional Commits, explicit paths only (never `git add -A`), NO co-author trailer and NO "Generated with" footer. Do not push.
- Implementers never dispatch subagents.

## Review Focus

1. The footer newsletter signup (email only, no answers, no identity) keeps returning 200 and stores a person — pinned in Task 3.
2. A `/survey` submission for an email that already `/join`ed with a Discord request keeps `wants`, `status`, `newsletter` and `answers.wants_*` untouched — pinned in Task 2.
3. Pasted profile URLs and `@handles` normalize to bare handles; junk is rejected with a message naming the field — pinned in Task 1.
4. Switching country after choosing a US state clears the region, so a stale `TX` is never sent for Canada — pinned in Task 1 (`withCountry`) and used in Task 4.
5. A resubmission with no socials or affiliations removes the old ones (latest wins), and a survey upsert never matches a legacy anonymous row (no email) — pinned in Task 2.

---

### Task 1: Shared text rule, geography lists, and the identity schema

**Files:**
- Create: `frontend/lib/text.ts`
- Create: `frontend/content/geo.ts`
- Create: `frontend/lib/identity.ts`
- Modify: `frontend/lib/stickers.ts` (lines 1-22: move the rule out, import it back)
- Test: `frontend/test/identity.test.ts` (new)

**Interfaces:**
- Produces (`lib/text.ts`): `noControlOrBidi(s: string): boolean`, `CONTROL_OR_BIDI_MESSAGE: string`, `line(max: number, label?: string)`, `optLine(max: number, label?: string)` (zod schemas; with a label, every message starts `"<label>: "`).
- Produces (`content/geo.ts`): `COUNTRY_CODES: readonly string[]` (250), `SUBDIVISIONS: Record<string, readonly (readonly [code: string, name: string])[]>` for `US`, `CA`, `AU`.
- Produces (`lib/identity.ts`): `identitySchema`, `type Identity = z.output<typeof identitySchema>`, `type Location`, `type Socials`, `type Affiliation`, `AFFILIATION_TYPES`, `type AffiliationType`, `AFFILIATION_LABELS`, `affiliationError(identity: Identity | undefined, answers: Answers): string | null`, `affiliationRequired(role: unknown): boolean`, `type SocialKey`, `type IdentityForm`, `EMPTY_IDENTITY_FORM`, `withCountry(f: IdentityForm, country: string): IdentityForm`, `toIdentityPayload(f: IdentityForm): unknown`, `socialLinks(s: Socials | undefined): { key: SocialKey; label: string; href: string }[]`.

- [ ] **Step 1: Create `content/geo.ts`**

It has zero imports (it is loaded by `node --test` through `lib/identity.ts`).

```ts
// Geography lists for the identity form. Zero imports on purpose: lib/identity.ts
// (loaded by `node --test`) and the client form both read it.
//
// COUNTRY_CODES: the 249 current ISO 3166-1 alpha-2 codes plus XK (Kosovo, widely
// used though not formally assigned). Generated 2026-09-25 from ICU region names,
// minus ICU's non-country and retired codes. Display names come from
// Intl.DisplayNames at render time, so no name list is kept here.
export const COUNTRY_CODES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE",
  "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD",
  "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI",
  "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK",
  "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

// State/province is REQUIRED (and picked from these lists) only for these three
// countries — most of the audience; everywhere else it is optional free text.
export const SUBDIVISIONS: Record<string, readonly (readonly [string, string])[]> = {
  US: [
    ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
    ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
    ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
    ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
    ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
    ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
    ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
    ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
    ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
    ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
    ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ],
  CA: [
    ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
    ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"],
    ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
    ["SK", "Saskatchewan"], ["YT", "Yukon"],
  ],
  AU: [
    ["ACT", "Australian Capital Territory"], ["NSW", "New South Wales"], ["NT", "Northern Territory"],
    ["QLD", "Queensland"], ["SA", "South Australia"], ["TAS", "Tasmania"], ["VIC", "Victoria"],
    ["WA", "Western Australia"],
  ],
};
```

- [ ] **Step 2: Move the text rule into `lib/text.ts` BY SCRIPT**

The `FORBIDDEN_CHARS` line contains backslash-u escapes. Do not retype it. Move lines 1–22 of `lib/stickers.ts` (the import, the comment block, `FORBIDDEN_CHARS`, `noControlOrBidi`, `CONTROL_OR_BIDI_MESSAGE`, `line`, `optLine`) with a script, then edit the exports around them:

```bash
cd frontend
python3 - <<'PY'
import pathlib
src = pathlib.Path("lib/stickers.ts").read_text()
start = src.index("// C0/C1 controls")
end = src.index("/** region and postal are optional")
block = src[start:end]
pathlib.Path("lib/text.ts").write_text('import { z } from "zod";\n\n' + block)
pathlib.Path("lib/stickers.ts").write_text(src[:start] + src[end:])
print("moved", len(block), "chars")
PY
```

Then, in `lib/text.ts` (editing only the words around the regex, never the regex line itself):
- export `noControlOrBidi` and `CONTROL_OR_BIDI_MESSAGE`;
- replace `line` and `optLine` with labelled, exported versions:

```ts
const msg = (label: string | undefined, text: string) => (label ? `${label}: ${text}` : undefined);

export const line = (max: number, label?: string) =>
  z.string().trim()
    .min(1, msg(label, "required"))
    .max(max, msg(label, `at most ${max} characters`))
    .refine(noControlOrBidi, label ? `${label}: contains a character we can't accept` : CONTROL_OR_BIDI_MESSAGE);

export const optLine = (max: number, label?: string) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return v == null ? undefined : v;
      const trimmed = v.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string()
      .max(max, msg(label, `at most ${max} characters`))
      .refine(noControlOrBidi, label ? `${label}: contains a character we can't accept` : CONTROL_OR_BIDI_MESSAGE)
      .optional()
  );
```

In `lib/stickers.ts`, add at the top: `import { line, optLine } from "./text.ts";` (keep its existing `z` import — `addressSchema` still uses `z.object`).

- [ ] **Step 3: Write the failing tests** (`test/identity.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identitySchema, affiliationError, withCountry, toIdentityPayload, socialLinks,
  EMPTY_IDENTITY_FORM, AFFILIATION_TYPES,
} from '../lib/identity.ts';
import { COUNTRY_CODES, SUBDIVISIONS } from '../content/geo.ts';

const BASE = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };
const parse = (x: unknown) => identitySchema.safeParse(x);
const firstMessage = (x: unknown) => { const r = parse(x); return r.success ? null : r.error.issues[0].message; };
const ok = (x: unknown) => { const r = parse(x); assert.ok(r.success, JSON.stringify(r.error?.issues)); return r.data!; };

test('geo lists: 250 countries, the three subdivision lists', () => {
  assert.equal(COUNTRY_CODES.length, 250);
  assert.ok(COUNTRY_CODES.includes('XK'));
  assert.ok(!COUNTRY_CODES.includes('UK'), 'UK is not an ISO code; GB is');
  assert.equal(SUBDIVISIONS.US.length, 52);
  assert.equal(SUBDIVISIONS.CA.length, 13);
  assert.equal(SUBDIVISIONS.AU.length, 8);
});

test('a minimal identity parses; country and region are upper-cased', () => {
  const r = parse({ name: ' Pat Doe ', location: { country: 'us', region: 'tx' } });
  assert.ok(r.success);
  assert.deepEqual(r.data, { name: 'Pat Doe', location: { country: 'US', region: 'TX' } });
});

test('name and country are required, with field-named messages', () => {
  assert.equal(firstMessage({ ...BASE, name: '   ' }), 'Name: required');
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'ZZ' } }), 'Country: pick one from the list');
});

test('region: required from the list for US/CA/AU, free text elsewhere', () => {
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'CA' } }), 'State / province: required for this country');
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'AU', region: 'TX' } }), 'State / province: pick one from the list');
  const gb = parse({ name: 'Pat', location: { country: 'GB', region: 'Greater Manchester', city: 'Salford' } });
  assert.ok(gb.success);
  assert.deepEqual(gb.data.location, { country: 'GB', region: 'Greater Manchester', city: 'Salford' });
  const bare = parse({ name: 'Pat', location: { country: 'FR' } });
  assert.ok(bare.success, 'region optional outside US/CA/AU');
});

test('pasted profile URLs and @handles normalize to bare handles', () => {
  const r = parse({ ...BASE, socials: {
    github: 'https://github.com/OctoCat/', bluesky: '@Pat.bsky.social', x: 'https://twitter.com/SportsDataverse?s=20',
    linkedin: 'https://www.linkedin.com/in/pat-doe-123/?trk=x', website: 'example.com/me',
  } });
  assert.ok(r.success);
  assert.deepEqual(r.data.socials, {
    github: 'OctoCat', bluesky: 'pat.bsky.social', x: 'SportsDataverse', linkedin: 'pat-doe-123', website: 'https://example.com/me',
  });
});

test('junk socials are rejected with the field named', () => {
  assert.match(firstMessage({ ...BASE, socials: { github: 'not a handle!' } })!, /^GitHub: /);
  assert.match(firstMessage({ ...BASE, socials: { x: 'way_too_long_handle_here' } })!, /^X: /);
  assert.match(firstMessage({ ...BASE, socials: { website: 'javascript:alert(1)' } })!, /^Website: /);
  assert.match(firstMessage({ ...BASE, socials: { bluesky: 'nodot' } })!, /^Bluesky: /);
});

test('empty socials disappear rather than store empty strings', () => {
  const r = parse({ ...BASE, socials: { github: '  ', x: '' } });
  assert.ok(r.success);
  assert.equal(r.data.socials, undefined);
});

test('affiliations: typed, at most three, org required', () => {
  const ok = parse({ ...BASE, affiliations: [{ type: 'media', org: 'The Athletic', title: 'Writer' }] });
  assert.ok(ok.success);
  assert.equal(firstMessage({ ...BASE, affiliations: [{ type: 'media', org: ' ' }] }), 'Organization: required');
  assert.equal(firstMessage({ ...BASE, affiliations: [{ type: 'nope', org: 'X' }] }), 'Affiliation: pick a type');
  const four = Array.from({ length: 4 }, () => ({ type: 'other', org: 'X' }));
  assert.equal(firstMessage({ ...BASE, affiliations: four }), 'Affiliations: at most 3');
  assert.deepEqual([...AFFILIATION_TYPES], ['pro_team_league', 'college_athletics', 'media', 'academic', 'betting_fantasy', 'sports_tech', 'other']);
});

test('control and bidi characters are refused in free-text identity fields', () => {
  const rlo = String.fromCodePoint(0x202e);
  assert.match(firstMessage({ ...BASE, name: 'Pat' + rlo + 'x' })!, /^Name: /);
  assert.match(firstMessage({ ...BASE, location: { country: 'GB', city: 'a' + String.fromCodePoint(0) + 'b' } })!, /^City: /);
});

test('affiliation is required for industry and researcher roles only', () => {
  assert.match(affiliationError(ok(BASE), { role: 'industry' })!, /^Affiliation: /);
  assert.match(affiliationError(ok(BASE), { role: 'researcher' })!, /^Affiliation: /);
  assert.equal(affiliationError(ok(BASE), { role: 'student' }), null);
  const withAff = ok({ ...BASE, affiliations: [{ type: 'academic', org: 'NC State' }] });
  assert.equal(affiliationError(withAff, { role: 'researcher' }), null);
});

test('changing country clears the region (no stale US state for Canada)', () => {
  const f = { ...EMPTY_IDENTITY_FORM, country: 'US', region: 'TX' };
  assert.deepEqual(withCountry(f, 'CA'), { ...f, country: 'CA', region: '' });
});

test('toIdentityPayload drops blanks and untouched affiliation rows, and the result parses', () => {
  const payload = toIdentityPayload({
    ...EMPTY_IDENTITY_FORM, name: 'Pat', country: 'US', region: 'TX', city: '  ',
    socials: { ...EMPTY_IDENTITY_FORM.socials, github: 'octocat' },
    affiliations: [{ type: '', org: '', title: '' }, { type: 'media', org: 'The Ringer', title: '' }],
  });
  assert.deepEqual(payload, {
    name: 'Pat', location: { country: 'US', region: 'TX', city: undefined },
    socials: { github: 'octocat' }, affiliations: [{ type: 'media', org: 'The Ringer', title: undefined }],
  });
  assert.ok(parse(payload).success);
});

test('socialLinks builds profile URLs in a fixed order', () => {
  assert.deepEqual(socialLinks({ x: 'sdv', github: 'octocat', website: 'https://example.com/' }), [
    { key: 'github', label: 'GitHub', href: 'https://github.com/octocat' },
    { key: 'x', label: 'X', href: 'https://x.com/sdv' },
    { key: 'website', label: 'Website', href: 'https://example.com/' },
  ]);
  assert.deepEqual(socialLinks(undefined), []);
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `cd frontend && node --test --experimental-strip-types test/identity.test.ts`
Expected: FAIL — `Cannot find module '../lib/identity.ts'`.

- [ ] **Step 5: Write `lib/identity.ts`**

```ts
import { z } from "zod";
import type { Answers } from "../content/survey.ts";
import { COUNTRY_CODES, SUBDIVISIONS } from "../content/geo.ts";
import { line, optLine } from "./text.ts";

/**
 * Who someone says they are, on /join and /survey. Unverified — the email that
 * carries it is typed, not proven — so the person record keeps the LATEST and
 * `responses` keeps every one (lib/responses.ts). Spec:
 * docs/superpowers/specs/2026-09-25-community-identity-and-browser-design.md.
 */

const COUNTRY_SET = new Set(COUNTRY_CODES);

export const locationSchema = z
  .object({
    country: z.string().trim().toUpperCase().refine((c) => COUNTRY_SET.has(c), "Country: pick one from the list"),
    region: optLine(80, "State / province"),
    city: optLine(80, "City"),
  })
  .superRefine((l, ctx) => {
    const list = SUBDIVISIONS[l.country];
    if (!list) return;
    const code = l.region?.toUpperCase();
    if (!code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["region"], message: "State / province: required for this country" });
    } else if (!list.some(([c]) => c === code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["region"], message: "State / province: pick one from the list" });
    }
  })
  .transform((l) => (SUBDIVISIONS[l.country] && l.region ? { ...l, region: l.region.toUpperCase() } : l));

export type SocialKey = "github" | "bluesky" | "x" | "linkedin" | "website";

// A pasted profile URL or @handle is normalized to the bare handle, not rejected.
const HANDLES = {
  github: { label: "GitHub", host: /^(?:https?:\/\/)?(?:www\.)?github\.com\//i, re: /^[A-Za-z0-9-]{1,39}$/, hint: "a handle like octocat", lower: false },
  bluesky: { label: "Bluesky", host: /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\//i, re: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/, hint: "a handle like you.bsky.social", lower: true },
  x: { label: "X", host: /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, re: /^\w{1,15}$/, hint: "a handle like SportsDataverse", lower: false },
  linkedin: { label: "LinkedIn", host: /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\//i, re: /^[A-Za-z0-9_%-]{3,100}$/, hint: "your linkedin.com/in/ address", lower: false },
} as const;

export function normalizeHandle(raw: string, host: RegExp, lower: boolean): string {
  const s = raw.trim().replace(/^@/, "").replace(host, "").split(/[/?#]/)[0];
  return lower ? s.toLowerCase() : s;
}

/** http(s) only; a bare domain gets https:// in front. null when it isn't a web address. */
export function normalizeWebsite(raw: string): string | null {
  const s = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const handleField = (key: Exclude<SocialKey, "website">) => {
  const h = HANDLES[key];
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? normalizeHandle(v, h.host, h.lower) : blankToUndefined(v)),
    z.string().regex(h.re, `${h.label}: enter ${h.hint}`).optional()
  );
};

const websiteField = z.preprocess(
  blankToUndefined,
  z.string().trim().max(200, "Website: at most 200 characters")
    .refine((v) => normalizeWebsite(v) !== null, "Website: enter an address starting with http:// or https://")
    .transform((v) => normalizeWebsite(v) as string)
    .optional()
);

export type Socials = Partial<Record<SocialKey, string>>;

export const socialsSchema = z
  .object({ github: handleField("github"), bluesky: handleField("bluesky"), x: handleField("x"), linkedin: handleField("linkedin"), website: websiteField })
  .transform((s): Socials | undefined => {
    const kept = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Socials;
    return Object.keys(kept).length ? kept : undefined;
  });

export const AFFILIATION_TYPES = ["pro_team_league", "college_athletics", "media", "academic", "betting_fantasy", "sports_tech", "other"] as const;
export type AffiliationType = (typeof AFFILIATION_TYPES)[number];
export const AFFILIATION_LABELS: Record<AffiliationType, string> = {
  pro_team_league: "Pro team or league",
  college_athletics: "College athletics",
  media: "Media or journalism",
  academic: "University or research",
  betting_fantasy: "Betting or fantasy",
  sports_tech: "Sports tech or data company",
  other: "Other",
};

const affiliationSchema = z.object({
  type: z.enum(AFFILIATION_TYPES, { errorMap: () => ({ message: "Affiliation: pick a type" }) }),
  org: line(120, "Organization"),
  title: optLine(120, "Title"),
});

export const identitySchema = z.object({
  name: line(80, "Name"),
  location: locationSchema,
  socials: socialsSchema.optional(),
  affiliations: z.array(affiliationSchema).max(3, "Affiliations: at most 3").optional()
    .transform((a) => (a && a.length ? a : undefined)),
});

export type Identity = z.output<typeof identitySchema>;
export type Location = Identity["location"];
export type Affiliation = NonNullable<Identity["affiliations"]>[number];

// "Work in sports or media" and "Researcher / academic" in content/survey.ts.
const ROLES_REQUIRING_AFFILIATION: readonly string[] = ["industry", "researcher"];

/** The rule spans identity and answers, so it runs where both are validated. */
export function affiliationError(identity: Identity | undefined, answers: Answers): string | null {
  const role = answers.role;
  if (typeof role === "string" && ROLES_REQUIRING_AFFILIATION.includes(role) && !identity?.affiliations?.length) {
    return "Affiliation: add at least one (your team, outlet, company or university)";
  }
  return null;
}

export function affiliationRequired(role: unknown): boolean {
  return typeof role === "string" && ROLES_REQUIRING_AFFILIATION.includes(role);
}

// ---- form state (client) — pure, so it is unit-tested here ----

export type IdentityForm = {
  name: string;
  country: string;
  region: string;
  city: string;
  socials: Record<SocialKey, string>;
  affiliations: { type: AffiliationType | ""; org: string; title: string }[];
};

export const EMPTY_IDENTITY_FORM: IdentityForm = {
  name: "", country: "", region: "", city: "",
  socials: { github: "", bluesky: "", x: "", linkedin: "", website: "" },
  affiliations: [],
};

/** A region belongs to its country: changing country always clears it. */
export function withCountry(f: IdentityForm, country: string): IdentityForm {
  return { ...f, country, region: "" };
}

/** What the form sends. The server re-validates all of it (identitySchema). */
export function toIdentityPayload(f: IdentityForm) {
  const opt = (s: string) => s.trim() || undefined;
  const socials = Object.fromEntries(
    Object.entries(f.socials).map(([k, v]) => [k, opt(v)]).filter(([, v]) => v !== undefined)
  );
  const affiliations = f.affiliations
    .filter((a) => a.type || a.org.trim() || a.title.trim())
    .map((a) => ({ type: a.type, org: a.org, title: opt(a.title) }));
  return {
    name: f.name,
    location: { country: f.country, region: opt(f.region), city: opt(f.city) },
    ...(Object.keys(socials).length ? { socials } : {}),
    ...(affiliations.length ? { affiliations } : {}),
  };
}

const SOCIAL_ORDER: { key: SocialKey; label: string; href: (v: string) => string }[] = [
  { key: "github", label: "GitHub", href: (v) => `https://github.com/${v}` },
  { key: "bluesky", label: "Bluesky", href: (v) => `https://bsky.app/profile/${v}` },
  { key: "x", label: "X", href: (v) => `https://x.com/${v}` },
  { key: "linkedin", label: "LinkedIn", href: (v) => `https://www.linkedin.com/in/${v}` },
  { key: "website", label: "Website", href: (v) => v },
];

export function socialLinks(s: Socials | undefined): { key: SocialKey; label: string; href: string }[] {
  if (!s) return [];
  return SOCIAL_ORDER.filter((o) => s[o.key]).map((o) => ({ key: o.key, label: o.label, href: o.href(s[o.key]!) }));
}
```

- [ ] **Step 6: Run the tests and make them pass**

Run: `cd frontend && node --test --experimental-strip-types test/identity.test.ts test/stickers.test.ts`
Expected: all PASS (stickers still passes through the moved rule). If a zod message differs from a test's exact string, fix the schema message, not the test — the test copy is the contract.

- [ ] **Step 7: Codepoint scan, gates, commit**

```bash
cd frontend
python3 - <<'PY'
import re, subprocess
bad = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f' + chr(0x200e) + chr(0x200f) + chr(0x2028) + chr(0x2029) + chr(0x202a) + '-' + chr(0x202e) + chr(0x2066) + '-' + chr(0x2069) + ']')
n = 0
for f in subprocess.run(['git', 'ls-files', '..'], capture_output=True, text=True).stdout.split():
    if f.endswith(('.ts', '.tsx', '.mjs', '.md', '.mdx')):
        try: n += len(bad.findall(open(f, encoding='utf-8').read()))
        except Exception: pass
print('raw hits:', n)
PY
grep -n "FORBIDDEN_CHARS = " lib/text.ts   # must show backslash-u escapes as plain ASCII text
npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?
git add lib/text.ts lib/stickers.ts content/geo.ts lib/identity.ts test/identity.test.ts
git commit -m "feat(identity): one schema for name, location, socials and affiliations"
```
Expected: `raw hits: 0`; all gates green.

---

### Task 2: The `responses` collection and identity on `people`

**Files:**
- Create: `frontend/lib/responses.ts`
- Modify: `frontend/lib/people.ts` (PersonDoc ~11-42; `recordSurvey` ~117-133 deleted; `upsertJoin` ~135-170; new `upsertSurvey`)
- Modify: `frontend/lib/review.ts` (`removePerson` ~293)
- Test: `frontend/test/responses.test.ts` (new), `frontend/test/people.test.ts`, `frontend/test/review.test.ts`

**Interfaces:**
- Consumes: `Identity` (Task 1).
- Produces (`lib/responses.ts`): `type ResponseDoc = { _id: ObjectId; personId: ObjectId; source: "join" | "survey"; createdAt: Date; identity: Identity; answers: Answers; profile: Profile }`; `insertResponse(db: Db, doc: Omit<ResponseDoc, "_id">): Promise<ObjectId>`; `deleteResponsesForPerson(db: Db, personId: ObjectId): Promise<number>`; `ensureResponseIndexes(db: Db): Promise<void>`.
- Produces (`lib/people.ts`): `PersonDoc` gains `location?: Location; socials?: Socials; affiliations?: Affiliation[]; lastSubmittedAt?: Date`; `upsertJoin(db, input: { email; name?; identity?: Identity; answers; profile; wants; placement? }, now)` (`identity` wins over `name`; Task 3 removes `name`); `upsertSurvey(db, input: { email: string; identity: Identity; answers: Answers; profile: Profile }, now): Promise<{ personId: PersonId; created: boolean }>`. `recordSurvey` stays until Task 3 deletes it, so the tree compiles between tasks.

- [ ] **Step 1: Write the failing tests**

`test/responses.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Db } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { insertResponse, deleteResponsesForPerson, ensureResponseIndexes } from '../lib/responses.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const ID = { name: 'Pat', location: { country: 'US', region: 'TX' } };
const P = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as never;

test('responses are appended, one per submission, and deleted per person', async () => {
  const { db, dump } = fakeDb();
  const a = new ObjectId(), b = new ObjectId();
  await insertResponse(db, { personId: a, source: 'join', createdAt: T0, identity: ID, answers: { role: 'developer' }, profile: P });
  await insertResponse(db, { personId: a, source: 'survey', createdAt: T0, identity: ID, answers: { role: 'student' }, profile: P });
  await insertResponse(db, { personId: b, source: 'survey', createdAt: T0, identity: ID, answers: {}, profile: P });
  assert.equal(dump('responses').length, 3);
  assert.equal(await deleteResponsesForPerson(db, a), 2);
  assert.deepEqual(dump('responses').map((r) => String(r.personId)), [String(b)]);
});

test('ensureResponseIndexes creates { personId: 1, createdAt: -1 }', async () => {
  const calls: unknown[] = [];
  const db = { collection: () => ({ createIndex: async (...args: unknown[]) => { calls.push(args); return 'x'; } }) } as unknown as Db;
  await ensureResponseIndexes(db);
  assert.deepEqual(calls, [[{ personId: 1, createdAt: -1 }]]);
});
```

Append to `test/people.test.ts` (and add `upsertSurvey` to its import line; add `upsertJoin` if not already imported). Leave the existing `recordSurvey` test alone — Task 3 deletes both:

```ts
const ID1 = { name: 'Pat Doe', location: { country: 'US', region: 'TX' }, socials: { github: 'octocat' }, affiliations: [{ type: 'media' as const, org: 'The Ringer' }] };
const ID2 = { name: 'Pat D.', location: { country: 'CA', region: 'ON' } };
const PROF = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as never;

test('upsertJoin stores the latest identity, and a resubmission without socials or affiliations removes them', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', identity: ID1, answers: { role: 'developer' }, profile: PROF, wants: { newsletter: false, discord: true } }, T0);
  let p = dump('people')[0];
  assert.equal(p.name, 'Pat Doe');
  assert.deepEqual(p.location, ID1.location);
  assert.deepEqual(p.socials, { github: 'octocat' });
  assert.equal((p.lastSubmittedAt as Date).getTime(), T0.getTime());
  await upsertJoin(db, { email: 'a@b.co', identity: ID2, answers: { role: 'developer' }, profile: PROF, wants: { newsletter: false, discord: true } }, T1);
  p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal(p.name, 'Pat D.');
  assert.equal(p.socials, undefined, 'latest wins: no socials this time means none stored');
  assert.equal(p.affiliations, undefined);
});

test('upsertJoin without identity leaves identity fields alone (the queue helpers in other tests rely on it)', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, { email: 'a@b.co', identity: ID1, answers: {}, profile: PROF, wants: { newsletter: false, discord: true } }, T0);
  await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROF, wants: { newsletter: false, discord: true } }, T1);
  assert.equal(dump('people')[0].name, 'Pat Doe');
});

test('upsertSurvey creates a survey person with every want false', async () => {
  const { db, dump } = fakeDb();
  const r = await upsertSurvey(db, { email: 's@b.co', identity: ID1, answers: { role: 'student' }, profile: PROF }, T0);
  assert.equal(r.created, true);
  const p = dump('people')[0];
  assert.equal(p.status, 'survey');
  assert.deepEqual(p.wants, { discord: false, newsletter: false, stickers: false, package: false });
  assert.equal((p.answers as Record<string, unknown>).role, 'student');
  assert.equal(p.name, 'Pat Doe');
});

test('upsertSurvey on a /join person never touches wants, status, newsletter or the wants_* answers', async () => {
  const { db, dump } = fakeDb();
  await upsertJoin(db, {
    email: 'a@b.co', identity: ID1,
    answers: { role: 'developer', languages: ['R'], packages_r: ['cfbfastR'], wants_discord: 'yes', wants_newsletter: 'yes' },
    profile: PROF, wants: { newsletter: true, discord: true },
  }, T0);
  await db.collection('people').updateOne({ email: 'a@b.co' }, { $set: { newsletter: { resendContactId: 'c1', syncedAt: T0 } } });
  await upsertSurvey(db, { email: 'a@b.co', identity: ID2, answers: { role: 'student', languages: ['Python'] }, profile: PROF }, T1);
  const p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal(p.status, 'pending');
  assert.deepEqual(p.wants, { newsletter: true, discord: true, package: false, stickers: false });
  assert.deepEqual(p.newsletter, { resendContactId: 'c1', syncedAt: T0 });
  const a = p.answers as Record<string, unknown>;
  assert.equal(a.wants_discord, 'yes');
  assert.equal(a.wants_newsletter, 'yes');
  assert.equal(a.role, 'student');
  assert.deepEqual(a.languages, ['Python']);
  assert.equal(a.packages_r, undefined, 'a survey question not answered this time is cleared, not left stale');
  assert.equal(p.name, 'Pat D.');
});

test('upsertSurvey never matches a legacy anonymous row (no email)', async () => {
  const { db, dump } = fakeDb();
  await db.collection('people').insertOne({ answers: { role: 'hobbyist' }, status: 'survey', wants: { discord: false, newsletter: false, stickers: false, package: false }, createdAt: T0 });
  await upsertSurvey(db, { email: 's@b.co', identity: ID1, answers: { role: 'student' }, profile: PROF }, T1);
  assert.equal(dump('people').length, 2);
  assert.equal((dump('people')[0].answers as Record<string, unknown>).role, 'hobbyist');
});
```

Append to `test/review.test.ts` (import `insertResponse` from `'../lib/responses.ts'`):

```ts
test('deleting a person deletes their responses too', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: false, discord: true });
  await insertResponse(db, { personId: id, source: 'join', createdAt: T0, identity: { name: 'Pat', location: { country: 'US', region: 'TX' } }, answers: {}, profile: PROFILE as never });
  const r = await removePerson({ db, ...env }, id);
  assert.equal(r.ok, true);
  assert.equal(dump('responses').length, 0);
  assert.equal(dump('people').length, 0);
});

test('if the responses cannot be removed, the person is kept', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: false, discord: true });
  await insertResponse(db, { personId: id, source: 'join', createdAt: T0, identity: { name: 'Pat', location: { country: 'US', region: 'TX' } }, answers: {}, profile: PROFILE as never });
  db.failNextWriteTo('responses', new Error('mongo down'));
  const r = await removePerson({ db, ...env }, id);
  assert.equal(r.ok, false);
  assert.equal(dump('people').length, 1);
});
```

(Match the names `queued`, `env`, `T0`, `PROFILE` to what `test/review.test.ts` already defines; read its top first.)

- [ ] **Step 2: Run them and watch them fail**

Run: `cd frontend && node --test --experimental-strip-types test/responses.test.ts test/people.test.ts test/review.test.ts`
Expected: FAIL — missing module `lib/responses.ts`, missing `upsertSurvey`, identity not stored.

- [ ] **Step 3: Write `lib/responses.ts`**

```ts
import type { Db, ObjectId } from "mongodb";
import type { Answers } from "../content/survey.ts";
import type { Identity } from "./identity.ts";
import type { Profile } from "./survey.ts";

/**
 * One document per /join or /survey questionnaire submission — APPEND-ONLY.
 * The person record holds the latest identity and answers; this is the history
 * that makes an overwrite through an unverified email visible instead of silent.
 * Deleted only with the person (lib/review.ts removePerson).
 */
export type ResponseDoc = {
  _id: ObjectId;
  personId: ObjectId;
  source: "join" | "survey";
  createdAt: Date;
  identity: Identity;
  answers: Answers;
  profile: Profile;
};

const col = (db: Db) => db.collection<ResponseDoc>("responses");

export async function insertResponse(db: Db, doc: Omit<ResponseDoc, "_id">): Promise<ObjectId> {
  return (await col(db).insertOne(doc as ResponseDoc)).insertedId as ObjectId;
}

export async function deleteResponsesForPerson(db: Db, personId: ObjectId): Promise<number> {
  return (await col(db).deleteMany({ personId })).deletedCount;
}

export async function ensureResponseIndexes(db: Db): Promise<void> {
  await col(db).createIndex({ personId: 1, createdAt: -1 });
}
```

- [ ] **Step 4: Identity on `people`**

In `lib/people.ts`:
- import: `import type { Affiliation, Identity, Location, Socials } from "./identity.ts";` and change the survey import to a value import that also brings the question list: `import { QUESTIONS, SURVEY_SECTIONS, type Answers } from "../content/survey.ts";`
- `PersonDoc` gains, after `name?: string;`:

```ts
  /** latest submission's location; never a mailing address (see lib/stickers.ts) */
  location?: Location;
  /** latest submission's socials, normalized handles (lib/identity.ts) */
  socials?: Socials;
  /** latest submission's affiliations, at most 3 */
  affiliations?: Affiliation[];
  lastSubmittedAt?: Date;
```

- Add the shared builder above `upsertJoin`:

```ts
/** The latest submission wins outright: optional parts it left out are removed,
 *  not kept from an older one. History lives in `responses`. */
function identityUpdate(identity: Identity, now: Date): { $set: Record<string, unknown>; $unset: Record<string, ""> } {
  const $set: Record<string, unknown> = { name: identity.name, location: identity.location, lastSubmittedAt: now };
  const $unset: Record<string, ""> = {};
  if (identity.socials) $set.socials = identity.socials;
  else $unset.socials = "";
  if (identity.affiliations) $set.affiliations = identity.affiliations;
  else $unset.affiliations = "";
  return { $set, $unset };
}
```

- `upsertJoin`: add `identity?: Identity;` to its input type (keep `name?: string;` for now), change the name spread to `...(input.name && !input.identity ? { name: input.name } : {})` inside `$set`, and merge identity into the update:

```ts
  const id = input.identity ? identityUpdate(input.identity, now) : { $set: {}, $unset: {} };
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set: {
        answers: input.answers,
        profile: input.profile,
        "wants.newsletter": input.wants.newsletter,
        "wants.discord": input.wants.discord,
        "wants.package": input.wants.package ?? false,
        "wants.stickers": input.wants.stickers ?? false,
        updatedAt: now,
        ...id.$set,
      },
      ...(Object.keys(id.$unset).length ? { $unset: id.$unset } : {}),
      $setOnInsert: {
        email: input.email,
        status: "pending",
        createdAt: now,
        ...(input.placement ? { "signup.placement": input.placement } : {}),
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
```

- Add `upsertSurvey` directly below `recordSurvey` (which stays until Task 3):

```ts
/**
 * /survey, identified since 2026-09-25: find-or-create by email. Writes ONLY
 * identity and the survey's own questions — never `wants`, `status`,
 * `newsletter`, `discord`, stickers or packages, so a survey can never undo a
 * /join request. Each survey question is set when answered and unset when not
 * (a follow-up hidden this time must not keep last time's answer); /join-only
 * answers (the wants section) are left alone. Legacy anonymous rows have no
 * email, so the email filter can never match one.
 */
export async function upsertSurvey(
  db: Db,
  input: { email: string; identity: Identity; answers: Answers; profile: Profile },
  now: Date = new Date()
): Promise<{ personId: PersonId; created: boolean }> {
  const { $set, $unset } = identityUpdate(input.identity, now);
  for (const q of QUESTIONS) {
    if (!SURVEY_SECTIONS.includes(q.section)) continue;
    if (q.id in input.answers) $set[`answers.${q.id}`] = input.answers[q.id];
    else $unset[`answers.${q.id}`] = "";
  }
  $set.profile = input.profile;
  $set.updatedAt = now;
  const res = await people(db).findOneAndUpdate(
    { email: input.email },
    {
      $set,
      ...(Object.keys($unset).length ? { $unset } : {}),
      $setOnInsert: {
        email: input.email,
        status: "survey",
        createdAt: now,
        wants: { discord: false, newsletter: false, stickers: false, package: false },
      },
    },
    { upsert: true, returnDocument: "after", includeResultMetadata: true }
  );
  if (!res.value) throw new Error("people upsert returned no document");
  return { personId: res.value._id, created: Boolean(res.lastErrorObject?.upserted) };
}
```

Nothing else changes in this task: `lib/join.ts` keeps calling `upsertJoin` with `name`, and `handleSurvey` keeps calling `recordSurvey`, until Task 3.

- [ ] **Step 5: Cascade in `removePerson`** (`lib/review.ts`)

Import `deleteResponsesForPerson` from `./responses.ts`. Insert a step between the sticker step and the package step:

```ts
  try {
    await deleteResponsesForPerson(deps.db, personId);
  } catch {
    deps.log?.(`response delete failed for person ${String(personId)}`);
    return { ok: false, message: "Couldn't remove their survey responses, so the record was kept — try again." };
  }
```

Change the success message to: `"Deleted, with their responses, any sticker request and pending package. Remove the Resend contact by hand if they had one."` — and update any test that pins the old success text.

- [ ] **Step 6: Run the tests and make them pass**

Run: `cd frontend && npm run test:lib`
Expected: all PASS.

- [ ] **Step 7: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint; echo EXIT=$?
git add lib/responses.ts lib/people.ts lib/review.ts test/responses.test.ts test/people.test.ts test/review.test.ts
git commit -m "feat(people): keep every submission in responses, and the latest identity on the person"
```

---

### Task 3: `/join` and `/survey` accept identity; `/survey` becomes identified

**Files:**
- Modify: `frontend/lib/joinSchema.ts`
- Modify: `frontend/lib/join.ts` (`handleJoin` ~276-300, `handleSurvey` ~337-346)
- Modify: `frontend/lib/people.ts` (delete `recordSurvey`)
- Modify: `frontend/app/api/join/route.ts`, `frontend/app/api/survey/route.ts`
- Test: `frontend/test/join.test.ts`, `frontend/test/joinSchema.test.ts`, `frontend/test/people.test.ts` (delete the `recordSurvey` test)

**Interfaces:**
- Consumes: `identitySchema`, `affiliationError`, `type Identity` (Task 1); `upsertJoin` with `identity`, `upsertSurvey`, `insertResponse`, `ensureResponseIndexes` (Task 2).
- Produces: `emailSchema` (exported from `lib/joinSchema.ts`); `joinBodySchema.identity?: Identity`; `surveyBodySchema = { email, identity, answers }`.

- [ ] **Step 1: Give every existing questionnaire test body an identity (mechanical)**

Identity becomes required on `/join` whenever `answers` is present, so ~80 existing `handleJoin` bodies need one. In `test/join.test.ts`, add near `D_ANSWERS`:

```ts
const IDENTITY = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };
```

Then insert `identity: IDENTITY, ` immediately before each `answers:` key that sits inside an object literal passed as the FIRST argument of `handleJoin(`. Do it with a script, then check the counts: every `handleJoin(` call whose body has `answers:` now also has `identity:`; footer-shaped calls (no `answers`) are unchanged. Do not touch `answers:` keys elsewhere (e.g. `upsertJoin` calls). Run the suite: it must still be green before any implementation change — `joinBodySchema` does not know `identity` yet and zod strips unknown keys, so the new key is ignored until Step 4.

- [ ] **Step 2: Write the failing tests** (append to `test/join.test.ts`; import `handleSurvey` if not imported)

```ts
test('a questionnaire /join without identity is refused, naming what is missing', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 400);
  assert.match((r.body as { message: string }).message, /name and where you're based/i);
  assert.equal(dump('people').length, 0);
});

test('the footer newsletter signup (email only, no answers) still needs no identity', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', placement: 'footer' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null });
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1);
  assert.equal(dump('responses').length, 0, 'a footer signup is not a questionnaire submission');
});

test('/join stores the identity on the person and appends a response', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', identity: { ...IDENTITY, socials: { github: '@octocat' } }, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 200);
  const p = dump('people')[0];
  assert.equal(p.name, 'Pat Doe');
  assert.deepEqual(p.socials, { github: 'octocat' });
  const resp = dump('responses');
  assert.equal(resp.length, 1);
  assert.equal(resp[0].source, 'join');
  assert.equal(String(resp[0].personId), String(p._id));
});

test('an industry or researcher role without an affiliation is refused', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, role: 'industry' } } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 400);
  assert.match((r.body as { message: string }).message, /^Affiliation: /);
  assert.equal(dump('people').length, 0);
});

test('a failed response insert keeps the person and the reply unchanged', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const ok = await handleJoin({ email: 'b@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.2', { db, viewer: null });
  db.failNextWriteTo('responses', new Error('mongo down'));
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null, log: (m) => logs.push(m) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, ok.body);
  assert.ok(dump('people').some((p) => p.email === 'a@b.co'));
  assert.match(logs.join(' '), /response insert failed for person/);
  assert.ok(!logs.join(' ').includes('a@b.co'), 'log lines carry the person id, never the email');
});

const S_ANSWERS = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord', dataTypes: ['pbp'], packages_r: ['cfbfastR'] };

test('/survey now requires an email and identity', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(r.status, 400);
  assert.equal(dump('people').length, 0);
});

test('/survey stores an identified person and a survey response', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ email: 'S@B.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(r.status, 200);
  const p = dump('people')[0];
  assert.equal(p.email, 's@b.co');
  assert.equal(p.status, 'survey');
  assert.equal(dump('responses')[0].source, 'survey');
});

test('/survey replies identically for a new and a known email', async () => {
  const { db } = fakeDb();
  const first = await handleSurvey({ email: 's@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  const again = await handleSurvey({ email: 's@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.2', { db });
  const other = await handleSurvey({ email: 't@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.3', { db });
  assert.deepEqual(again, first);
  assert.deepEqual(other, first);
});

test('/survey for a /join person keeps their Discord request', async () => {
  const { db, dump } = fakeDb();
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.2', { db });
  const p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal((p.wants as { discord: boolean }).discord, true);
  assert.equal(p.status, 'pending');
  assert.equal(dump('responses').length, 2);
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd frontend && node --test --experimental-strip-types test/join.test.ts`
Expected: the new tests FAIL (identity ignored; `/survey` still anonymous).

- [ ] **Step 4: Schemas** (`lib/joinSchema.ts`)

```ts
import { identitySchema } from "./identity.ts";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
```

In `joinBodySchema`: use `email: emailSchema`, REMOVE `name` (it moves into identity), and add

```ts
  /** Required whenever `answers` is present (a questionnaire submission); the
   *  footer newsletter form sends no answers and no identity. Enforced in
   *  handleJoin, where the message can say what is missing. */
  identity: identitySchema.optional(),
```

Replace `surveyBodySchema` with:

```ts
/** /survey is identified since 2026-09-25: email and identity are required. */
export const surveyBodySchema = z.object({
  email: emailSchema,
  identity: identitySchema,
  answers: z.record(z.unknown()),
});
```

Check `test/joinSchema.test.ts` for assertions on `name`; update them to the new shape.

- [ ] **Step 5: Handlers** (`lib/join.ts`)

Imports: `affiliationError` from `./identity.ts`; `insertResponse` from `./responses.ts`; `upsertSurvey` from `./people.ts` (drop `recordSurvey`).

Add a helper near `later`:

```ts
/** The history write. The person write already stood; a failure here is logged
 *  (person id only) and never changes the reply. */
async function recordResponse(deps: JoinDeps, doc: Parameters<typeof insertResponse>[1]): Promise<void> {
  try {
    await insertResponse(deps.db, doc);
  } catch {
    deps.log?.(`response insert failed for person ${String(doc.personId)}`);
  }
}
```

In `handleJoin`, change `const { email, name, answers: rawAnswers, placement } = parsed.data;` to `const { email, identity, answers: rawAnswers, placement } = parsed.data;`. Inside `if (rawAnswers) { … }`, after `answers = v.answers;`:

```ts
    if (!identity) return { status: 400, body: { success: false, message: "Add your name and where you're based." } };
    const affErr = affiliationError(identity, answers);
    if (affErr) return { status: 400, body: { success: false, message: affErr } };
```

(Both checks run before the rate limit and before any write, like the existing package/sticker checks.) Replace the `upsertJoin` argument `{ email, name, answers, profile, wants, placement }` with `{ email, identity, answers, profile, wants, placement }`, and directly after the person write add:

```ts
  if (answers && profile && identity) {
    await recordResponse(deps, { personId, source: "join", createdAt: now, identity, answers, profile });
  }
```

Replace `handleSurvey`'s body:

```ts
export async function handleSurvey(rawBody: unknown, ip: string, deps: JoinDeps): Promise<JoinResult> {
  const parsed = surveyBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request" } };
  }
  const v = validateAnswers(QUESTIONS, SURVEY_SECTIONS, parsed.data.answers);
  if (!v.ok) return { status: 400, body: { success: false, message: v.message } };
  const affErr = affiliationError(parsed.data.identity, v.answers);
  if (affErr) return { status: 400, body: { success: false, message: affErr } };
  const lim = await limited(deps, `survey:${ip}`, SURVEY_LIMIT);
  if (lim) return lim;
  const now = nowOf(deps);
  const profile = projectProfile(v.answers);
  const { email, identity } = parsed.data;
  const { personId } = await upsertSurvey(deps.db, { email, identity, answers: v.answers, profile }, now);
  await recordResponse(deps, { personId, source: "survey", createdAt: now, identity, answers: v.answers, profile });
  // one fixed reply, whether the email was new or known (membership-oracle rule)
  return { status: 200, body: { success: true, message: "Thanks — that helps us decide what to build next." } };
}
```

Delete `recordSurvey` from `lib/people.ts` and its test from `test/people.test.ts`. In `upsertJoin`, remove the now-unused `name?: string` input and its spread (identity carries the name); fix any test that passed `name` to it.

- [ ] **Step 6: Routes ensure the new index**

`app/api/join/route.ts`: add `ensureResponseIndexes(db)` (from `@lib/responses`) to the `Promise.all` index list. `app/api/survey/route.ts`: add it to its `Promise.all` as well, and change the doc comment to `/** Identified questionnaire (name + email since 2026-09-25): no auth, rate-limited per IP inside handleSurvey. */`.

- [ ] **Step 7: Run the tests and make them pass; mutation-check**

Run: `cd frontend && npm run test:lib`
Expected: all PASS. Then each mutation must turn a test red, and be restored: (a) drop the `if (!identity)` check → the "without identity is refused" test; (b) move `recordResponse` above the person write and pass a fake id → the "stores … appends a response" test; (c) in `upsertSurvey`, `$set` the whole `answers` object instead of per key → "/survey for a /join person keeps their Discord request" or the people test; (d) make `handleSurvey` return a different message when `created` → the reply-identity test.

- [ ] **Step 8: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && timeout 600 npm run build; echo EXIT=$?
git add lib/joinSchema.ts lib/join.ts lib/people.ts app/api/join/route.ts app/api/survey/route.ts test/join.test.ts test/joinSchema.test.ts test/people.test.ts
git commit -m "feat(join): require identity on questionnaire submissions, and identify /survey"
```

---

### Task 4: The identity fields on both forms

**Files:**
- Create: `frontend/components/site/IdentityFields.tsx`
- Modify: `frontend/components/site/QuestionFlow.tsx`
- Modify: `frontend/app/(site)/survey/page.tsx` (lines 8 and 17: drop "Anonymous")
- Modify: `frontend/scripts/walkthroughs/join.mjs`, `frontend/scripts/walkthroughs/survey.mjs`

**Interfaces:**
- Consumes: `IdentityForm`, `EMPTY_IDENTITY_FORM`, `withCountry`, `toIdentityPayload`, `AFFILIATION_TYPES`, `AFFILIATION_LABELS`, `affiliationRequired`, `SocialKey` (Task 1, `@lib/identity`); `COUNTRY_CODES`, `SUBDIVISIONS` (`@content/geo`); `CONTACT_EMAIL` (`@content/links`).
- Produces: `LocationFields`, `AffiliationFields`, `ContactFields` components.

UI; verified by the build, by reading, and by the PR-evidence walkthroughs. Match the existing fieldsets in `QuestionFlow.tsx` (same `fieldset className="space-y-3"`, `legend className="font-medium"`, `grid gap-3 sm:grid-cols-2`, `Input` component).

- [ ] **Step 1: `components/site/IdentityFields.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import { Input } from "@components/ui/input";
import { Button } from "@components/ui/button";
import { COUNTRY_CODES, SUBDIVISIONS } from "@content/geo";
import { CONTACT_EMAIL } from "@content/links";
import {
  AFFILIATION_LABELS, AFFILIATION_TYPES, withCountry,
  type AffiliationType, type IdentityForm, type SocialKey,
} from "@lib/identity";

// Native <select>: accessible and type-to-jump out of the box; styled with Input's own classes.
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const REQ = { pattern: ".*\\S.*", title: "Can't be only spaces" };

type Props = { value: IdentityForm; onChange: (next: IdentityForm) => void };

export function LocationFields({ value, onChange }: Props) {
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return COUNTRY_CODES.map((c) => ({ code: c, name: names.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const regions = SUBDIVISIONS[value.country];
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Where are you based?</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <select aria-label="Country" required className={selectClass} value={value.country}
          onChange={(e) => onChange(withCountry(value, e.target.value))}>
          <option value="">Country…</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        {regions ? (
          <select aria-label="State / province" required className={selectClass} value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}>
            <option value="">State / province…</option>
            {regions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        ) : (
          <Input aria-label="State / province (optional)" placeholder="State / province (optional)" maxLength={80}
            value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })} />
        )}
        <Input aria-label="City (optional)" placeholder="City (optional)" autoComplete="address-level2" maxLength={80}
          value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
      </div>
    </fieldset>
  );
}

const EMPTY_ROW = { type: "" as const, org: "", title: "" };

export function AffiliationFields({ value, onChange, required }: Props & { required: boolean }) {
  // a required list shows one row to fill; its first edit makes it real
  const rows = value.affiliations.length === 0 && required ? [EMPTY_ROW] : value.affiliations;
  const setRows = (next: IdentityForm["affiliations"]) => onChange({ ...value, affiliations: next });
  const setRow = (i: number, patch: Partial<IdentityForm["affiliations"][number]>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-3" aria-required={required ? "true" : undefined}>
      <legend className="font-medium">
        Affiliations{required ? <span aria-hidden className="text-muted-foreground"> *</span> : <span className="text-muted-foreground"> (optional)</span>}
      </legend>
      <p className="text-sm text-muted-foreground">Your team, league, outlet, company or university.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[12rem_1fr_1fr_auto]">
          <select aria-label={`Affiliation ${i + 1} type`} required className={selectClass} value={r.type}
            onChange={(e) => setRow(i, { type: e.target.value as AffiliationType })}>
            <option value="">Type…</option>
            {AFFILIATION_TYPES.map((t) => <option key={t} value={t}>{AFFILIATION_LABELS[t]}</option>)}
          </select>
          <Input aria-label={`Affiliation ${i + 1} organization`} placeholder="Organization" required maxLength={120} {...REQ}
            value={r.org} onChange={(e) => setRow(i, { org: e.target.value })} />
          <Input aria-label={`Affiliation ${i + 1} title (optional)`} placeholder="Title (optional)" maxLength={120}
            value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} />
          {!(required && rows.length === 1) ? (
            <Button type="button" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
          ) : <span />}
        </div>
      ))}
      {rows.length < 3 ? (
        <Button type="button" variant="outline" onClick={() => setRows([...rows, { ...EMPTY_ROW }])}>
          {rows.length === 0 ? "Add an affiliation" : "Add another"}
        </Button>
      ) : null}
    </fieldset>
  );
}

const SOCIALS: { key: SocialKey; label: string; placeholder: string }[] = [
  { key: "github", label: "GitHub (optional)", placeholder: "GitHub handle (optional)" },
  { key: "bluesky", label: "Bluesky (optional)", placeholder: "Bluesky handle (optional)" },
  { key: "x", label: "X (optional)", placeholder: "X handle (optional)" },
  { key: "linkedin", label: "LinkedIn (optional)", placeholder: "LinkedIn profile URL (optional)" },
  { key: "website", label: "Website (optional)", placeholder: "Website (optional)" },
];

export function ContactFields({ value, onChange, email, onEmail }: Props & { email: string; onEmail: (v: string) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Where can we reach you?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Your name" placeholder="Your name" autoComplete="name" required maxLength={80} {...REQ}
          value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        <Input type="email" aria-label="Email address" placeholder="you@example.com" autoComplete="email" required
          value={email} onChange={(e) => onEmail(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">
        We&apos;ll use this to reply to you, and may contact you about SportsDataverse collaborations, research, or your
        answers. Ask us to stop any time: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIALS.map((s) => (
          <Input key={s.key} aria-label={s.label} placeholder={s.placeholder} maxLength={200}
            value={value.socials[s.key]} onChange={(e) => onChange({ ...value, socials: { ...value.socials, [s.key]: e.target.value } })} />
        ))}
      </div>
    </fieldset>
  );
}
```

Check: `REQ.pattern` is written in source as the four characters dot-star-backslash-S… i.e. the JS string literal `".*\\S.*"` (double backslash inside a JS string) produces the attribute value `.*\S.*`. Verify after writing with `grep -n 'pattern' components/site/IdentityFields.tsx`. Confirm `@content` resolves in `tsconfig.json` paths (QuestionFlow already imports `@content/survey`).

- [ ] **Step 2: Wire `QuestionFlow.tsx`**

- Replace `const [contact, setContact] = useState({ email: "", name: "" });` with
  `const [email, setEmail] = useState("");` and `const [identity, setIdentity] = useState<IdentityForm>(EMPTY_IDENTITY_FORM);`
  (import `EMPTY_IDENTITY_FORM`, `toIdentityPayload`, `affiliationRequired`, `type IdentityForm` from `@lib/identity`, and the three components from `@components/site/IdentityFields`).
- In `submit()`: the join body replaces `email: contact.email, name: contact.name.trim() || undefined,` with `email, identity: toIdentityPayload(identity),`; the survey body `{ answers }` becomes `{ email, identity: toIdentityPayload(identity), answers }`.
- After the `{visible.map(...)}` block, render for BOTH modes:

```tsx
      {section === "profile" ? (
        <>
          <LocationFields value={identity} onChange={setIdentity} />
          <AffiliationFields value={identity} onChange={setIdentity} required={affiliationRequired(answers.role)} />
        </>
      ) : null}
```

- Replace the `{isJoin && last ? ( … "Where can we reach you?" … ) : null}` block with `{last ? <ContactFields value={identity} onChange={setIdentity} email={email} onEmail={setEmail} /> : null}` (both modes).
- The survey thank-you copy is unchanged.

- [ ] **Step 3: `/survey` page copy** (`app/(site)/survey/page.tsx`)

Line 8 description: `"Three minutes on who you are, what you use, and how you'd like to hear from us."` (drop "Anonymous."). Line 17: `eyebrow="Survey"`.

- [ ] **Step 4: Walkthroughs** (reserved address, so nothing leaves the site)

`scripts/walkthroughs/survey.mjs`: update the header comment to "Identified survey: …"; after the three step-1 picks add

```js
  await form.getByLabel('Country', { exact: true }).selectOption('US');
  await form.getByLabel('State / province', { exact: true }).selectOption('TX');
  await form.getByPlaceholder('City (optional)', { exact: true }).fill('Austin');
```

and before `Send answers`:

```js
  await form.getByPlaceholder('Your name', { exact: true }).fill('Walkthrough Tester');
  await form.getByPlaceholder('you@example.com', { exact: true }).fill('walkthrough-survey@example.com');
  await form.getByPlaceholder('GitHub handle (optional)', { exact: true }).fill('https://github.com/octocat');
```

`scripts/walkthroughs/join.mjs`: change the role pick from `'Student'` to `'Work in sports or media'`, then on step 1 add the same three location lines plus

```js
  await form.getByLabel('Affiliation 1 type', { exact: true }).selectOption('media');
  await form.getByPlaceholder('Organization', { exact: true }).fill('Walkthrough Weekly');
```

and on the last step add `await form.getByPlaceholder('Your name', { exact: true }).fill('Walkthrough Tester');` before the email line. Make every existing `getByPlaceholder(...)` in both files `{ exact: true }` (the new "City (optional)" and the sticker "City" must never collide). Update join.mjs's header comment to mention identity. Run `node --check` on both files.

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && timeout 600 npm run build; echo EXIT=$?
ps aux | grep "[n]ext build"   # nothing
git add components/site/IdentityFields.tsx components/site/QuestionFlow.tsx "app/(site)/survey/page.tsx" scripts/walkthroughs/join.mjs scripts/walkthroughs/survey.mjs
git commit -m "feat(join): ask for name, location, socials and affiliations on /join and /survey"
```

---

### Task 5: Discord reviewers see self-reported affiliations and socials

**Files:**
- Create: `frontend/lib/peopleRow.ts`
- Modify: `frontend/app/api/platform/people/route.ts` (move `row()` out; import it)
- Modify: `frontend/app/(platform)/platform/people/PeopleClient.tsx` (`PersonRow` type ~20-34; person cell ~206-225)
- Test: `frontend/test/peopleRow.test.ts` (new)

**Interfaces:**
- Consumes: `PersonDoc` (Task 2), `socialLinks`, `AFFILIATION_LABELS` (Task 1).
- Produces: `personRow(p: PersonDoc)` — the existing row fields plus `affiliations: Affiliation[] | null` and `socials: Socials | null`, populated ONLY when `p.status === "pending" && p.wants?.discord`.

- [ ] **Step 1: Write the failing test** (`test/peopleRow.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { personRow } from '../lib/peopleRow.ts';

const base = {
  _id: new ObjectId(), email: 'a@b.co', name: 'Pat', status: 'pending' as const,
  wants: { discord: true, newsletter: false, stickers: false, package: false },
  createdAt: new Date('2026-09-25T12:00:00Z'), updatedAt: new Date('2026-09-25T12:00:00Z'),
  socials: { github: 'octocat' }, affiliations: [{ type: 'media' as const, org: 'The Ringer' }],
  location: { country: 'US', region: 'TX' }, answers: { role: 'industry' },
};

test('a Discord requester awaiting review shows affiliations and socials', () => {
  const r = personRow(base as never);
  assert.deepEqual(r.socials, { github: 'octocat' });
  assert.deepEqual(r.affiliations, [{ type: 'media', org: 'The Ringer' }]);
});

test('anyone else shows neither', () => {
  for (const p of [{ ...base, status: 'approved' }, { ...base, wants: { ...base.wants, discord: false } }, { ...base, status: 'survey' }]) {
    const r = personRow(p as never);
    assert.equal(r.socials, null);
    assert.equal(r.affiliations, null);
  }
});

test('a row never carries location, answers or the invite code', () => {
  const r = personRow({ ...base, discord: { code: 'SECRET', expiresAt: new Date(), invitedAt: new Date() } } as never) as Record<string, unknown>;
  assert.equal('location' in r, false);
  assert.equal('answers' in r, false);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.equal(r.hasInvite, true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && node --test --experimental-strip-types test/peopleRow.test.ts`
Expected: FAIL — cannot find `lib/peopleRow.ts`.

- [ ] **Step 3: Move `row()` to `lib/peopleRow.ts` and extend it**

Cut `function row(p: PersonDoc) { … }` (with its comments) from `app/api/platform/people/route.ts` into `lib/peopleRow.ts` as `export function personRow(p: PersonDoc)`, importing `type PersonDoc` from `./people.ts`. Before its `return`, add:

```ts
  // Self-reported, and only for someone a member is being asked to vouch for.
  // Location and answers never reach this member-readable list.
  const reviewing = p.status === "pending" && Boolean(p.wants?.discord);
```

and add to the returned object:

```ts
    affiliations: reviewing ? p.affiliations ?? null : null,
    socials: reviewing ? p.socials ?? null : null,
```

In the route, `import { personRow } from "@lib/peopleRow";` and use `people.map(personRow)`.

- [ ] **Step 4: Render them** (`PeopleClient.tsx`)

Add to `PersonRow`: `affiliations: { type: string; org: string; title?: string }[] | null; socials: Record<string, string> | null;`. Import `AFFILIATION_LABELS, socialLinks` from `@lib/identity`. In the person cell, after the claimed-login block:

```tsx
                      {p.affiliations?.length || p.socials ? (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {p.affiliations?.map((a, i) => (
                            <div key={i}>
                              {AFFILIATION_LABELS[a.type as keyof typeof AFFILIATION_LABELS] ?? a.type} · {a.org}
                              {a.title ? ` — ${a.title}` : ""}
                            </div>
                          ))}
                          {socialLinks(p.socials ?? undefined).length ? (
                            <div className="flex flex-wrap gap-2">
                              {socialLinks(p.socials ?? undefined).map((s) => (
                                <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-4 hover:underline">{s.label}</a>
                              ))}
                            </div>
                          ) : null}
                          <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide">self-reported</span>
                        </div>
                      ) : null}
```

- [ ] **Step 5: Gates and commit**

```bash
cd frontend && npm run test:lib && npx tsc --noEmit && npm run lint && timeout 600 npm run build; echo EXIT=$?
git add lib/peopleRow.ts app/api/platform/people/route.ts "app/(platform)/platform/people/PeopleClient.tsx" test/peopleRow.test.ts
git commit -m "feat(people): show Discord reviewers a requester's self-reported affiliations and socials"
```

---

### Task 6: Privacy page, setup doc, CLAUDE.md

**Files:**
- Modify: `frontend/static_pages/privacy-policy.mdx` (front-matter `date:`; paragraphs at lines ~12 and ~16; the deletion paragraph)
- Modify: `frontend/SETUP-community.md` (new "Identity and responses" section after "Survey")
- Modify: `CLAUDE.md` (Community bullet; one new rule bullet)

**Document the merged code, not this plan.** Read Tasks 1–5 as merged; list every place they differ from this plan in your report.

- [ ] **Step 1: `privacy-policy.mdx`** — bump `date:` to the commit date; rewrite:
  - the opening sentence's list: "…what you enter in the newsletter sign-up, the join form or the survey, including a name and mailing address if you ask for stickers";
  - **Survey and join.** paragraph: both forms ask for your name, email and where you're based (country, state or province, optionally city), plus optional social handles and your affiliations; answers given to the survey before 2026-09-25 were anonymous and stay that way; location is used to understand where the community is and never to mail anything; giving an email means we may contact you about collaborations, research or your answers, and writing to sportsdataverse@gmail.com stops that; org admins can see everything you submit; org members who review Discord requests see a requester's affiliations and social handles;
  - the deletion paragraph: deleting your record also deletes every submission you made (answers and history).
  Only claim what the code does; each sentence must trace to a file:line in your report.

- [ ] **Step 2: `SETUP-community.md`** — "## Identity and responses": what both forms collect and which fields are required (and the US/CA/AU region rule); the `responses` collection (append-only, one per questionnaire submission, the person keeps the latest; footer signups write none); the unverified-email behavior (latest wins, history keeps the old one); what reviewers see in the queue and why only for Discord requesters; that PR 2 adds the admin browser.

- [ ] **Step 3: `CLAUDE.md`** — in the **Community** bullet, add: `/survey` is identified (name + email) since 2026-09-25; every questionnaire submission appends a `responses` document (`lib/responses.ts`) and `people` holds the latest identity (`lib/identity.ts`). Add a bullet next to **Sticker address visibility**:
  `- **Identity visibility:** a person's location, answers and \`responses\` are never shown to non-admin members. The member review queue (\`lib/peopleRow.ts\`) shows affiliations and socials only for people awaiting a Discord decision, labeled self-reported — keep it that way.`

- [ ] **Step 4: Gate and commit**

```bash
cd frontend && npm run test:lib; echo EXIT=$?
git add static_pages/privacy-policy.mdx SETUP-community.md ../CLAUDE.md
git commit -m "docs(identity): what the forms now collect, who sees it, and how it is kept"
```
