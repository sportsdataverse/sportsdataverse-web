"use client";

import { timeAgo } from "@components/platform/widgets";
import DelegatedKeysCard from "@components/platform/DelegatedKeysCard";
import { useAdmin } from "../AdminOverviewClient";

type KeyRow = {
  key_id: string;
  requests: number;
  rows_served: number;
  top_tables: { table_name: string; n: number }[];
  last_seen: string | null;
};

export default function KeysClient() {
  const { data, error } = useAdmin<{ rows: KeyRow[] }>("keys");
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Keys</h1>
      </div>

      <DelegatedKeysCard />

      <h2 className="pt-2 font-display text-lg font-semibold tracking-tight">
        Usage
      </h2>
      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load keys.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left font-inter text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Key</th>
                <th className="px-4 py-2">Requests</th>
                <th className="px-4 py-2">Rows served</th>
                <th className="px-4 py-2">Top tables</th>
                <th className="px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key_id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{r.key_id}</td>
                  <td className="px-4 py-2">{r.requests.toLocaleString()}</td>
                  <td className="px-4 py-2">{r.rows_served.toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.top_tables.map((t) => t.table_name).join(", ") || "–"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{timeAgo(r.last_seen)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground" colSpan={5}>
                    No active keys.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
