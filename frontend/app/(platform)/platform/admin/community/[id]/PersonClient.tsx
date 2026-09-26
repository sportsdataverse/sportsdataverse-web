"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { useAdmin } from "../../AdminOverviewClient";
import { dimension, labelOf } from "@lib/community";
import { AFFILIATION_LABELS, socialLinks } from "@lib/identity";
import type { AffiliationType, Socials } from "@lib/identity";
import { QUESTIONS } from "@content/survey";

type Location = { country: string; region?: string; city?: string };
type Affiliation = { type: string; org: string; title?: string };
type Wants = { discord: boolean; newsletter: boolean; stickers: boolean; package: boolean };

type Person = {
  name: string | null;
  email: string | null;
  location?: Location;
  socials?: Socials;
  affiliations?: Affiliation[];
  wants: Wants;
  status: "pending" | "approved" | "declined" | "auto" | "survey";
  doNotContact?: { at: string; by: string };
  latestSource: "join" | "survey";
  identityChanged: boolean;
};

type HistoryEntry = {
  at: string | null;
  source: "join" | "survey";
  identity: Record<string, unknown>;
  answers: Record<string, unknown>;
  implicit: boolean;
  identityChanged: boolean;
};

type PersonResponse = { person: Person; history: HistoryEntry[] };
type DncResult = { success: boolean; message: string };

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string): string => {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
};

const sourceDim = dimension("source");
const sourceLabel = (s: string): string => (sourceDim ? labelOf(sourceDim, s) : s);

const regionDim = dimension("region");
/** Same composite-key lookup every other region display in this feature uses
 *  (@lib/community's "region" dimension keys its labels on "<country>:<region>") —
 *  never show the raw stored code ("TX") on its own. */
function regionName(country: string, region: string | undefined): string | null {
  if (!region) return null;
  return regionDim ? labelOf(regionDim, `${country}:${region}`) : region;
}

const WANTS_LABELS: [keyof Wants, string][] = [
  ["discord", "Discord"],
  ["newsletter", "Newsletter"],
  ["package", "Package listing"],
  ["stickers", "Stickers"],
];

function affiliationLine(a: Affiliation): string {
  const label = AFFILIATION_LABELS[a.type as AffiliationType] ?? a.type;
  return `${label} · ${a.org}${a.title ? ` — ${a.title}` : ""}`;
}

/** A history entry's identity snapshot — same shape as the person's current
 *  identity, rendered generically since older entries may be missing fields. */
function IdentityFields({ identity }: { identity: Record<string, unknown> }) {
  const name = typeof identity.name === "string" ? identity.name : null;
  const location = identity.location as Location | undefined;
  const socials = identity.socials as Record<string, string> | undefined;
  const affiliations = identity.affiliations as Affiliation[] | undefined;
  const locationText = location
    ? [location.country ? countryName(location.country) : null, regionName(location.country, location.region), location.city]
        .filter(Boolean)
        .join(", ")
    : null;
  const rows: [string, string][] = [
    ...(name ? [["Name", name] as [string, string]] : []),
    ...(locationText ? [["Location", locationText] as [string, string]] : []),
    ...(socials && Object.keys(socials).length
      ? [["Socials", Object.entries(socials).map(([k, v]) => `${k}: ${v}`).join(", ")] as [string, string]]
      : []),
    ...(affiliations?.length ? [["Affiliations", affiliations.map(affiliationLine).join("; ")] as [string, string]] : []),
  ];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No identity recorded.</p>;
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** One submission's answers, labelled from content/survey.ts so a question id
 *  never leaks to the screen; option values are shown by their option label
 *  too, when the question still has one. */
function AnswerFields({ answers }: { answers: Record<string, unknown> }) {
  const entries = Object.entries(answers).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No answers recorded.</p>;
  return (
    <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
      {entries.map(([id, value]) => {
        const question = QUESTIONS.find((qn) => qn.id === id);
        const values = Array.isArray(value) ? value : [value];
        const text = values
          .map((v) => {
            const s = String(v);
            return question?.options?.find((o) => o.value === s)?.label ?? s;
          })
          .join(", ");
        return (
          <Fragment key={id}>
            <dt className="text-muted-foreground">{question?.label ?? id}</dt>
            <dd>{text}</dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

export default function PersonClient({ id }: { id: string }) {
  const { data, error, mutate } = useAdmin<PersonResponse>(`community/${id}`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function toggleDnc() {
    if (!data) return;
    const turningOn = !data.person.doNotContact;
    const label = data.person.name ?? data.person.email ?? "this person";
    const question = turningOn
      ? `Mark ${label} do-not-contact? They'll be left out of every future export.`
      : `Clear do-not-contact for ${label}? They'll be included in exports again.`;
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/platform/admin/community/${id}/do-not-contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: turningOn }),
      });
      let body: DncResult | null = null;
      try {
        body = (await res.json()) as DncResult;
      } catch {
        body = null;
      }
      setResult(!res.ok || !body ? "Couldn't update — try again." : body.message);
      await mutate();
    } catch {
      setResult("Couldn't update — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* No filters carried over — this is always the unfiltered browser. */}
      <Link href="/platform/admin/community" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Back to Community
      </Link>

      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load that person.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">{data.person.name ?? "(anonymous)"}</h1>
                <p className="text-sm text-muted-foreground">{data.person.email ?? "no email on file"}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={data.person.doNotContact ? "outline" : "destructive"}
                disabled={busy}
                onClick={toggleDnc}
              >
                {busy ? "Updating…" : data.person.doNotContact ? "Clear do-not-contact" : "Mark do-not-contact"}
              </Button>
            </div>

            {/* Mounted unconditionally so the live region already exists in the
                accessibility tree before the first action's text lands. */}
            <div role="status" className={result ? "rounded-lg border border-border bg-muted/40 p-3 text-sm" : "sr-only"}>
              {result}
            </div>

            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
                <dd className="mt-0.5">
                  {data.person.location
                    ? [
                        countryName(data.person.location.country),
                        regionName(data.person.location.country, data.person.location.region),
                        data.person.location.city,
                      ]
                        .filter(Boolean)
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Socials</dt>
                <dd className="mt-0.5">
                  {socialLinks(data.person.socials).length ? (
                    <div className="flex flex-wrap gap-2">
                      {socialLinks(data.person.socials).map((s) => (
                        <a
                          key={s.key}
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {s.label}
                        </a>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Affiliations</dt>
                <dd className="mt-0.5 space-y-0.5">
                  {data.person.affiliations?.length
                    ? data.person.affiliations.map((a, i) => <div key={i}>{affiliationLine(a)}</div>)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Asked for</dt>
                <dd className="mt-0.5">
                  {WANTS_LABELS.filter(([k]) => data.person.wants[k])
                    .map(([, label]) => label)
                    .join(", ") || "nothing recorded"}
                  {data.person.wants.discord ? ` — Discord status: ${data.person.status}` : ""}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Submissions</h2>
            {data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions recorded.</p>
            ) : (
              data.history.map((h, i) => (
                <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {h.implicit ? "before history was kept" : h.at ? new Date(h.at).toLocaleString() : "—"}
                    </span>
                    <Badge variant="outline">{sourceLabel(h.source)}</Badge>
                    {h.identityChanged ? <Badge variant="secondary">Identity changed</Badge> : null}
                  </div>
                  <IdentityFields identity={h.identity} />
                  <AnswerFields answers={h.answers} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
