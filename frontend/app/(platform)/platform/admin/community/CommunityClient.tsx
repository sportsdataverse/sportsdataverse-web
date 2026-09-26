"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@components/ui/table";
import { useAdmin } from "../AdminOverviewClient";
import { countryName, dimension, labelOf } from "@lib/community";
import type { Count } from "@lib/community";
import { AFFILIATION_LABELS } from "@lib/identity";
import type { AffiliationType } from "@lib/identity";
import CommunityFilters from "./CommunityFilters";
import CommunityAggregates from "./CommunityAggregates";

type PersonRow = {
  id: string;
  name: string | null;
  email: string | null;
  affiliation: { type: string; org: string } | null;
  role: string | null;
  country: string | null;
  region: string | null;
  source: "join" | "survey" | "newsletter";
  lastSubmitted: string | null;
  doNotContact: boolean;
  anonymous: boolean;
  test: boolean;
  identityChanged: boolean;
};

export type Aggregate = { key: string; label: string; counts: Count[] };
export type CrossTab = { x: string[]; y: string[]; cells: Record<string, Record<string, number>> } | null;

type ListResponse = {
  total: number;
  page: number;
  pages: number;
  exportable: number;
  rows: PersonRow[];
  aggregates: Aggregate[];
  options: Record<string, Count[]>;
  crossTab: CrossTab;
};

// q.role's options carry a proper label; source's do too — reuse the same
// lookup the filters use rather than re-typing the survey's labels here.
const roleDim = dimension("q.role");
const sourceDim = dimension("source");
const regionDim = dimension("region");

function roleLabel(role: string | null): string {
  if (!role) return "—";
  return roleDim ? labelOf(roleDim, role) : role;
}

function sourceLabel(source: string): string {
  return sourceDim ? labelOf(sourceDim, source) : source;
}

function locationLabel(country: string | null, region: string | null): string {
  if (!country) return "—";
  const c = countryName(country);
  if (!region) return c;
  const label = regionDim ? labelOf(regionDim, `${country}:${region}`) : region;
  return `${c} — ${label}`;
}

/** The admin-only Community browser: every submission, filterable, exportable.
 *  The URL is the state — every control here writes it with router.push, and
 *  useAdmin re-fetches from it, so a link to a filtered view is shareable.
 *  (push, not replace: a filter, search or paging change adds a browser
 *  history entry, so Back undoes it one step at a time.) */
export default function CommunityClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The box follows the URL: when q changes underneath it (a shared link, another
  // tab's navigation), adopt the new value during render instead of keeping stale
  // text that the next submit would write back over the URL.
  const urlQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ);
    setQ(urlQ);
  }
  const { data, error, isLoading } = useAdmin<ListResponse>("community", `?${searchParams.toString()}`);
  const [exportError, setExportError] = useState<string | null>(null);

  function updateParams(mutate: (params: URLSearchParams) => void, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    if (resetPage) params.delete("page");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function toggleFilter(key: string, value: string) {
    updateParams((params) => {
      const paramKey = `f.${key}`;
      const values = params.getAll(paramKey);
      params.delete(paramKey);
      const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      for (const v of next) params.append(paramKey, v);
    });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    updateParams((params) => {
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
    });
  }

  function setDateParam(key: "from" | "to", value: string) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  function setPage(page: number) {
    updateParams((params) => params.set("page", String(page)), false);
  }

  function setDim(key: "x" | "y", value: string) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    }, false);
  }

  function exportHref(): string {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("x");
    params.delete("y");
    return `/api/platform/admin/community/export?${params.toString()}`;
  }

  /** A filtered list view's current query, carried onto a person's link so
   *  "Back to Community" (PersonClient) can return to it instead of the bare,
   *  unfiltered browser. */
  function personHref(id: string): string {
    const list = searchParams.toString();
    return list ? `/platform/admin/community/${id}?from=${encodeURIComponent(list)}` : `/platform/admin/community/${id}`;
  }

  // A navigation to the export route would otherwise render its JSON error
  // body as a raw page on failure (the route returns 500 + { error } — see
  // app/api/platform/admin/community/export/route.ts) — fetch it instead, so
  // a failure can be shown as a normal message here (M12).
  async function handleExport() {
    if (!data || isLoading || data.exportable === 0) return; // the count must be this filter's
    const ok = confirm(
      `Export ${data.exportable} people to CSV? Left out: anyone marked do-not-contact, anonymous rows, anyone who hasn't made an identified /join or /survey submission since the contact notice was added, anyone unsubscribed from the newsletter, and test addresses.`
    );
    if (!ok) return;
    setExportError(null);
    try {
      const res = await fetch(exportHref());
      if (!res.ok) {
        let message = "Couldn't build the export.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // not JSON — keep the default message
        }
        setExportError(message);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `sdv-community-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't build the export.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Community</h1>
      </div>

      {/* Mounted unconditionally so the live region already exists in the
          accessibility tree before the first export error's text lands. */}
      <div
        role="status"
        className={exportError ? "rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive" : "sr-only"}
      >
        {exportError}
      </div>

      <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="community-q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="community-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, org…"
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="community-from" className="text-xs text-muted-foreground">
            From
          </label>
          <input
            id="community-from"
            type="date"
            value={searchParams.get("from") ?? ""}
            onChange={(e) => setDateParam("from", e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="community-to" className="text-xs text-muted-foreground">
            To
          </label>
          <input
            id="community-to"
            type="date"
            value={searchParams.get("to") ?? ""}
            onChange={(e) => setDateParam("to", e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      <div className="flex flex-col gap-4 lg:flex-row">
        <CommunityFilters searchParams={searchParams} options={data?.options ?? {}} onToggle={toggleFilter} />

        <div className="min-w-0 flex-1 space-y-4">
          {error ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load people.</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {data.total.toLocaleString()} people · page {data.page} of {data.pages}
                </p>
                <Button type="button" size="sm" variant="outline" disabled={isLoading || data.exportable === 0} onClick={handleExport}>
                  Export {data.exportable.toLocaleString()} to CSV
                </Button>
              </div>

              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one matches these filters.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Affiliation</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Last submitted</TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Link
                                href={personHref(r.id)}
                                className="font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {r.name ?? r.email ?? "Anonymous"}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.affiliation
                                ? `${AFFILIATION_LABELS[r.affiliation.type as AffiliationType] ?? r.affiliation.type} · ${r.affiliation.org}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{roleLabel(r.role)}</TableCell>
                            <TableCell className="text-muted-foreground">{locationLabel(r.country, r.region)}</TableCell>
                            <TableCell className="text-muted-foreground">{sourceLabel(r.source)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.lastSubmitted ? new Date(r.lastSubmitted).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {r.doNotContact ? <Badge variant="destructive">Do not contact</Badge> : null}
                                {r.anonymous ? <Badge variant="secondary">Anonymous</Badge> : null}
                                {r.test ? <Badge variant="secondary">Test address</Badge> : null}
                                {r.identityChanged ? <Badge variant="outline">Identity changed</Badge> : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={data.page <= 1}
                      onClick={() => setPage(data.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={data.page >= data.pages}
                      onClick={() => setPage(data.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}

              <CommunityAggregates
                aggregates={data.aggregates}
                crossTab={data.crossTab}
                xKey={searchParams.get("x") ?? ""}
                yKey={searchParams.get("y") ?? ""}
                onSetX={(v) => setDim("x", v)}
                onSetY={(v) => setDim("y", v)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
