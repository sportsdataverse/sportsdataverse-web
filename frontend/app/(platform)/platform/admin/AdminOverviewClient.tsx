"use client";

import useSWR from "swr";
import { Sparkline } from "@components/platform/widgets";

const fetcher = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

/** Shared fetch hook for every /platform/admin page — server-proxied,
 *  admin-gated `/api/platform/admin/{name}` endpoints, refreshed every 30s. */
export function useAdmin<T>(name: string, params = "") {
  return useSWR<T>(`/api/platform/admin/${name}${params}`, fetcher, {
    refreshInterval: 30_000,
  });
}

type Summary = {
  requests: { bucket: string; n: number; errors: number }[];
  top_endpoints: { route_pattern: string; n: number }[];
  latency: { route_pattern: string; p50: number; p95: number; p99: number }[];
  active_keys: number;
};

function Stat({
  label,
  value,
  extra,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-inter text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</p>
      {extra ? <div className="mt-2">{extra}</div> : null}
    </div>
  );
}

function TopEndpoints({ rows }: { rows: Summary["top_endpoints"] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 font-barlow text-lg font-semibold">Top endpoints</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left font-inter text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Route</th>
              <th className="px-4 py-2">Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.route_pattern} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{r.route_pattern}</td>
                <td className="px-4 py-2">{r.n.toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                  No data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LatencyTable({ rows }: { rows: Summary["latency"] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 font-barlow text-lg font-semibold">Latency by route</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left font-inter text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Route</th>
              <th className="px-4 py-2">p50</th>
              <th className="px-4 py-2">p95</th>
              <th className="px-4 py-2">p99</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.route_pattern} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{r.route_pattern}</td>
                <td className="px-4 py-2">{Math.round(r.p50)} ms</td>
                <td className="px-4 py-2">{Math.round(r.p95)} ms</td>
                <td className="px-4 py-2">{Math.round(r.p99)} ms</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-2 text-muted-foreground" colSpan={4}>
                  No data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminOverviewClient() {
  const { data, error } = useAdmin<Summary>("summary", "?hours=24");
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load summary — is the admin key configured?
      </p>
    );
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const reqSeries = data.requests.map((b) => b.n);
  const errTotal = data.requests.reduce((s, b) => s + b.errors, 0);
  const reqTotal = data.requests.reduce((s, b) => s + b.n, 0);
  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Admin</h1>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Requests (24h)"
          value={reqTotal.toLocaleString()}
          extra={<Sparkline values={reqSeries} />}
        />
        <Stat
          label="Error rate"
          value={reqTotal ? `${((100 * errTotal) / reqTotal).toFixed(2)}%` : "–"}
        />
        <Stat label="Active keys" value={String(data.active_keys)} />
        <Stat
          label="Slowest p99"
          value={data.latency[0] ? `${Math.round(data.latency[0].p99)} ms` : "–"}
        />
      </div>
      <TopEndpoints rows={data.top_endpoints} />
      <LatencyTable rows={data.latency} />
    </div>
  );
}
