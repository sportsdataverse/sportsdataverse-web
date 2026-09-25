"use client";

import { useEffect, useState } from "react";
import type { Count, Population } from "@lib/population";

/** Plausible reports a missing property value as the literal string "(none)". */
function displayKey(key: string): string {
  return key === "(none)" ? "unknown" : key;
}

function Bars({ title, counts }: { title: string; counts: Count[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 font-barlow text-lg font-semibold">{title}</h3>
      {counts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No answers yet.</p>
      ) : (
        <ul className="space-y-1">
          {counts.map((c) => (
            <li key={c.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
              <span className="truncate">{displayKey(c.key)}</span>
              <span className="h-2 rounded bg-primary/70" style={{ width: `${(c.count / max) * 100}%` }} aria-hidden />
              <span className="text-right tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-inter text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

export default function PopulationPanel() {
  const [data, setData] = useState<Population | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/people/population")
      .then(async (r) => (r.ok ? ((await r.json()) as { population: Population }).population : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError("Couldn't load the population numbers."));
  }, []);

  // Mounted unconditionally, same pattern as PeopleClient's live region, so the
  // status/alert node exists in the a11y tree before its text changes.
  return (
    <div className="space-y-4">
      <div role="alert" className={error ? "text-sm text-destructive" : "sr-only"}>
        {error}
      </div>
      <p role="status" className={!data && !error ? "text-sm text-muted-foreground" : "sr-only"}>
        {!data && !error ? "Loading…" : ""}
      </p>
      {data ? (
        <div className="space-y-8">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="People" value={data.totals.people} />
            <Stat label="Answered the survey" value={data.totals.withProfile} />
            <Stat label="Newsletter (synced)" value={data.newsletter.synced} />
            <Stat label="Discord members" value={data.passive.discordMembers ?? "—"} />
          </dl>
          <div className="grid gap-6 md:grid-cols-2">
            <Bars title="First found us via" counts={data.funnel.discoveredVia} />
            <Bars title="Hears about updates via" counts={data.funnel.updatesVia} />
            <Bars title="Wants news delivered by" counts={data.funnel.newsChannel} />
            <Bars title="Role" counts={data.byRole} />
            <Bars title="Language" counts={data.byLanguage} />
            <Bars title="Sport" counts={data.bySport} />
            <Bars title="Status" counts={data.byStatus} />
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 font-barlow text-lg font-semibold">Follow / support clicks (last 91 days)</h3>
              {data.clicks.status === "ok" && data.clicks.rows.length > 0 ? (
                <ul className="space-y-1">
                  {data.clicks.rows.map((r) => {
                    const max = Math.max(1, ...data.clicks.rows.map((row) => row.count));
                    return (
                      <li
                        key={`${r.event}-${r.platform}-${r.placement}`}
                        className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm"
                      >
                        <span className="truncate">
                          {displayKey(r.platform)} · {displayKey(r.placement)}
                        </span>
                        <span
                          className="h-2 rounded bg-primary/70"
                          style={{ width: `${(r.count / max) * 100}%` }}
                          aria-hidden
                        />
                        <span className="text-right tabular-nums">{r.count}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                // say WHY it is empty — an empty chart would read as "nobody clicked"
                <p className="text-sm text-muted-foreground">
                  {data.clicks.status === "unconfigured"
                    ? "Not configured — set PLAUSIBLE_API_KEY on Vercel to see these."
                    : data.clicks.status === "error"
                      ? `Plausible didn't answer${data.clicks.httpStatus ? ` (HTTP ${data.clicks.httpStatus})` : ""}. Check the API key and the site's goals.`
                      : "No clicks were recorded in the last 91 days. If that's unexpected, check that the follow_click and support_click goals, and the platform and placement custom properties, are configured in Plausible's site settings."}
                </p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
