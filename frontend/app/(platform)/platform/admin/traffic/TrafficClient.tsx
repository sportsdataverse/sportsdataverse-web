"use client";

import { Fragment, useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronRight } from "lucide-react";
import { cn } from "@lib/utils";
import { useAdmin } from "../AdminOverviewClient";

type RequestRow = {
  ts: string;
  service: string;
  method: string;
  path: string;
  route_pattern: string;
  status: number;
  duration_ms: number;
  key_id: string | null;
  ip: string | null;
  ua: string | null;
  referrer: string | null;
  bytes_out: number | null;
  schema_name: string | null;
  table_name: string | null;
};

/** HTTP-code-aware status chip — StatusBadge's tone ladder only matches
 *  workflow words (success/failure/running...), so every numeric status
 *  falls through to the same neutral gray there. Same chip shape/classes,
 *  bucketed by status-code class instead. Do not touch StatusBadge itself —
 *  other pages depend on its word ladder. */
function HttpStatusBadge({ status }: { status: number | null | undefined }) {
  if (status == null) return <span className="text-xs text-muted-foreground">–</span>;
  const tone =
    status >= 200 && status < 300
      ? "bg-status-success/15 text-status-success-ink dark:text-status-success"
      : status >= 300 && status < 400
        ? "bg-status-scheduled/15 text-status-scheduled-ink dark:text-status-scheduled"
        : status >= 400 && status < 500
          ? "bg-status-running/15 text-status-running-ink dark:text-status-running"
          : status >= 500
            ? "bg-status-failed/15 text-status-failed-ink dark:text-status-failed"
            : "bg-status-cancelled/20 text-status-cancelled-ink dark:text-status-cancelled";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

/** Stable per-row identity for expansion state — an array index would track
 *  "row 3" across a 30s SWR refresh even after the underlying rows reorder,
 *  silently expanding the wrong request. */
function rowKey(r: RequestRow): string {
  return `${r.ts}|${r.key_id ?? ""}|${r.path}`;
}

type TableMeta = { expandedKey: string | null; toggle: (key: string) => void };

const columnHelper = createColumnHelper<RequestRow>();
const columns = [
  columnHelper.accessor("ts", {
    header: "Time",
    cell: (c) => {
      const meta = c.table.options.meta as TableMeta;
      const key = rowKey(c.row.original);
      const isExpanded = meta.expandedKey === key;
      return (
        <button
          type="button"
          onClick={() => meta.toggle(key)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse request details" : "Expand request details"}
          className="flex items-center gap-1.5 font-mono text-xs hover:text-primary"
        >
          <ChevronRight className={cn("size-3 shrink-0 transition-transform", isExpanded && "rotate-90")} />
          {c.getValue()}
        </button>
      );
    },
  }),
  columnHelper.accessor("method", { header: "Method" }),
  columnHelper.accessor("path", {
    header: "Path",
    cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (c) => <HttpStatusBadge status={c.getValue()} />,
  }),
  columnHelper.accessor("duration_ms", {
    header: "Duration",
    cell: (c) => `${Math.round(c.getValue())} ms`,
  }),
  columnHelper.accessor("key_id", { header: "Key" }),
  columnHelper.accessor("ip", { header: "IP" }),
];

export default function TrafficClient() {
  const [hours, setHours] = useState("24");
  const [status, setStatus] = useState("");
  const [keyId, setKeyId] = useState("");
  const [pathPrefix, setPathPrefix] = useState("");
  const [service, setService] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ hours, limit: "200" });
    if (status) p.set("status", status);
    if (keyId) p.set("key_id", keyId);
    if (pathPrefix) p.set("path_prefix", pathPrefix);
    if (service) p.set("service", service);
    return `?${p.toString()}`;
  }, [hours, status, keyId, pathPrefix, service]);

  const { data, error } = useAdmin<{ rows: RequestRow[] }>("requests", qs);
  const rows = data?.rows ?? [];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      expandedKey,
      toggle: (key: string) => setExpandedKey((cur) => (cur === key ? null : key)),
    } satisfies TableMeta,
  });

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Traffic</h1>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hours
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-20 rounded-md border border-input bg-card px-2 py-1 font-inter text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Status
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="e.g. 500"
            className="w-24 rounded-md border border-input bg-card px-2 py-1 font-inter text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Service
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-32 rounded-md border border-input bg-card px-2 py-1 font-inter text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Key ID
          <input
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            className="w-32 rounded-md border border-input bg-card px-2 py-1 font-inter text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Path prefix
          <input
            value={pathPrefix}
            onChange={(e) => setPathPrefix(e.target.value)}
            placeholder="/v1/..."
            className="w-40 rounded-md border border-input bg-card px-2 py-1 font-inter text-sm"
          />
        </label>
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load requests.</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left font-inter text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-2">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isExpanded = expandedKey === rowKey(row.original);
                return (
                  <Fragment key={row.id}>
                    <tr className="border-t border-border hover:bg-secondary/50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {isExpanded ? (
                      <tr className="border-t border-border bg-secondary/30">
                        <td colSpan={columns.length} className="px-4 py-2">
                          <pre className="overflow-x-auto text-xs">
                            {JSON.stringify(row.original, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground" colSpan={columns.length}>
                    No requests in this window.
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
