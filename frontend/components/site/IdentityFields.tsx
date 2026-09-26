"use client";

import { useId, useMemo } from "react";
import { Input } from "@components/ui/input";
import { Button } from "@components/ui/button";
import { COUNTRY_CODES, SUBDIVISIONS } from "@content/geo";
import { CONTACT_EMAIL } from "@content/links";
import {
  AFFILIATION_LABELS, AFFILIATION_TYPES, withCountry,
  type AffiliationType, type IdentityForm, type SocialKey,
} from "@lib/identity";

// Native <select>: accessible and type-to-jump out of the box; styled with Input's own classes.
// text-base md:text-sm (not a flat text-sm) matches Input's own sizing — iOS Safari zooms the
// page on focusing any control smaller than 16px, and Country is the first field on both forms.
const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";
const REQ = { pattern: ".*\\S.*", title: "Can't be only spaces" };

type Props = { value: IdentityForm; onChange: (next: IdentityForm) => void };

export function LocationFields({ value, onChange }: Props) {
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    // "en" pinned, not the runtime locale: the server always renders in en-US, and a
    // browser with a different default locale would otherwise sort <option>s in a
    // different order than the server did, tripping a React hydration mismatch.
    return COUNTRY_CODES.map((c) => ({ code: c, name: names.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, "en"));
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
  // Consent to be contacted is implied by this notice, so it must reach assistive
  // tech too — aria-describedby on the email input ties them together for a
  // screen reader, not just visual proximity.
  const contactNoticeId = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Where can we reach you?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Your name" placeholder="Your name" autoComplete="name" required maxLength={80} {...REQ}
          value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        <Input type="email" aria-label="Email address" placeholder="you@example.com" autoComplete="email" required
          aria-describedby={contactNoticeId}
          value={email} onChange={(e) => onEmail(e.target.value)} />
      </div>
      <p id={contactNoticeId} className="text-sm text-muted-foreground">
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
