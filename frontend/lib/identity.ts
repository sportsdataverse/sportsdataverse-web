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
