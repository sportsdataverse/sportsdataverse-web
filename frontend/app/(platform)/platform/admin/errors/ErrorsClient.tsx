"use client";

import { useState } from "react";
import { timeAgo } from "@components/platform/widgets";
import { useAdmin } from "../AdminOverviewClient";

type ErrorRow = {
  message: string;
  service: string;
  n: number;
  last_ts: string | null;
  sample_stack: string | null;
};

export default function ErrorsClient() {
  const { data, error } = useAdmin<{ rows: ErrorRow[] }>("errors");
  const rows = data?.rows ?? [];
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Errors</h1>
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load errors.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors recorded.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={`${r.service}-${r.message}-${i}`} className="rounded-lg border border-border bg-card p-4">
              <button
                type="button"
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground">{r.service}</span>
                  <p className="truncate font-inter text-sm font-medium">{r.message}</p>
                </span>
                <span className="inline-block rounded-full bg-status-failed/15 px-2 py-0.5 font-mono text-xs font-semibold text-status-failed-ink dark:text-status-failed">
                  {r.n.toLocaleString()}
                </span>
                <span className="font-inter text-xs text-muted-foreground">
                  {timeAgo(r.last_ts)}
                </span>
              </button>
              {expanded === i && r.sample_stack ? (
                <pre className="mt-3 overflow-x-auto text-xs">{r.sample_stack}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
