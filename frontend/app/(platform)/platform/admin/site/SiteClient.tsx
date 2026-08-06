"use client";

import { useAdmin } from "../AdminOverviewClient";

type Site = {
  pageviews: { path: string; n: number; uniques: number }[];
  referrers: { referrer: string; n: number }[];
  vitals: { name: string; p75: number }[];
  actions: { name: string; n: number }[];
};

function formatVital(name: string, p75: number): string {
  return name.toUpperCase() === "CLS" ? p75.toFixed(3) : `${Math.round(p75)} ms`;
}

export default function SiteClient() {
  const { data, error } = useAdmin<Site>("site");

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Site</h1>
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load site stats.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 font-barlow text-lg font-semibold">Web vitals</h3>
            <div className="flex flex-wrap gap-6">
              {data.vitals.map((v) => (
                <div key={v.name}>
                  <p className="font-inter text-xs uppercase tracking-wide text-muted-foreground">
                    {v.name}
                  </p>
                  <p className="font-display text-lg font-bold">{formatVital(v.name, v.p75)}</p>
                </div>
              ))}
              {data.vitals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vitals recorded.</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 font-barlow text-lg font-semibold">Pageviews</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left font-inter text-sm">
                  <thead className="bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Path</th>
                      <th className="px-4 py-2">Views</th>
                      <th className="px-4 py-2">Uniques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pageviews.map((p) => (
                      <tr key={p.path} className="border-t border-border">
                        <td className="px-4 py-2 font-mono text-xs">{p.path}</td>
                        <td className="px-4 py-2">{p.n.toLocaleString()}</td>
                        <td className="px-4 py-2">{p.uniques.toLocaleString()}</td>
                      </tr>
                    ))}
                    {data.pageviews.length === 0 ? (
                      <tr>
                        <td className="px-4 py-2 text-muted-foreground" colSpan={3}>
                          No pageviews.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-2 font-barlow text-lg font-semibold">API Referrers</h3>
              <p className="mb-2 font-inter text-xs text-muted-foreground">
                Sourced from API request referrers, not client pageview referrers.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left font-inter text-sm">
                  <thead className="bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Referrer</th>
                      <th className="px-4 py-2">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.referrers.map((r) => (
                      <tr key={r.referrer} className="border-t border-border">
                        <td className="px-4 py-2 font-mono text-xs">{r.referrer || "–"}</td>
                        <td className="px-4 py-2">{r.n.toLocaleString()}</td>
                      </tr>
                    ))}
                    {data.referrers.length === 0 ? (
                      <tr>
                        <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                          No referrers.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 font-barlow text-lg font-semibold">Actions</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left font-inter text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actions.map((a) => (
                    <tr key={a.name} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{a.name}</td>
                      <td className="px-4 py-2">{a.n.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.actions.length === 0 ? (
                    <tr>
                      <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                        No actions.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
