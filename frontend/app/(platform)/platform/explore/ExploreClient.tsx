"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { Bookmark, Download, Play, Plus, X } from "lucide-react";
import { timeAgo } from "@components/platform/widgets";
import { Button } from "@components/ui/button";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import type { QueryResult } from "@lib/platform/duckdb";
import type { BookmarkDoc } from "@lib/platform/schemas";

/**
 * CFBD-exporter-style data exploration: pick a dataset (release tag) → pick
 * the table + partition (season) → filterable preview grid → export CSV.
 * Queries run entirely in the browser (DuckDB-WASM over release parquet via
 * HTTP range reads) — imported dynamically so none of it touches SSR.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const QUERYABLE = /\.(parquet|csv|csv\.gz)$/i;

/** `<stem>_<partition>.<ext>` → {stem, partition}; unpartitioned files keep
 *  their whole basename as the stem. Partitions are season-like tokens
 *  (2024, 2024_25, 20242025). */
const PARTITION_RE = /^(.*?)_(\d{4}(?:_\d{2}|\d{4})?)\.(parquet|csv|csv\.gz)$/i;

function parseAsset(name: string): { stem: string; partition: string | null } {
  const m = PARTITION_RE.exec(name);
  if (m) return { stem: m[1], partition: m[2] };
  return { stem: name.replace(QUERYABLE, ""), partition: null };
}

export type DatasetOption = { tag: string; sport: string; updated: string | null };

type ExploreProps = {
  datasets: DatasetOption[];
  error: string | null;
};

type Filter = { column: string; op: string; value: string };

const OPS = ["=", "!=", ">", ">=", "<", "<=", "contains"] as const;

function sqlLiteral(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) return value.trim();
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(source: string, filters: Filter[], limit: number): string {
  const where = filters
    .filter((f) => f.column && f.value !== "")
    .map((f) =>
      f.op === "contains"
        ? `CAST("${f.column}" AS VARCHAR) ILIKE '%${f.value.replace(/'/g, "''")}%'`
        : `"${f.column}" ${f.op} ${sqlLiteral(f.value)}`
    )
    .join("\n  AND ");
  return [
    `SELECT *`,
    `FROM ${source}`,
    where ? `WHERE ${where}` : null,
    `LIMIT ${Math.max(1, limit)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

export default function ExploreClient({ datasets, error }: ExploreProps) {
  const [tag, setTag] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<{ name: string; type: string }[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [limit, setLimit] = useState(100);
  const [sql, setSql] = useState("");
  const [sqlMode, setSqlMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const { data: assets, error: assetsError, isLoading: assetsLoading } = useSWR(
    tag
      ? `/api/platform/datasets/assets?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(tag)}`
      : null,
    fetcher
  );

  const queryable = useMemo(() => (assets ?? []).filter((a) => QUERYABLE.test(a.name)), [assets]);

  const { data: bookmarks } = useSWR(
    "/api/platform/bookmarks",
    async (url: string) => {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
      return data.message as BookmarkDoc[];
    }
  );
  const [pendingBookmark, setPendingBookmark] = useState<BookmarkDoc | null>(null);

  // Applying a bookmark is two-phase: select its tag, then once that tag's
  // asset list arrives, restore the picked files + SQL (in SQL mode).
  useEffect(() => {
    if (!pendingBookmark || pendingBookmark.tag !== tag || !assets) return;
    const names = new Set(queryable.map((a) => a.name));
    setPicked(new Set(pendingBookmark.assets.filter((a) => names.has(a))));
    setSqlMode(true);
    setSql(pendingBookmark.sql);
    setPendingBookmark(null);
  }, [pendingBookmark, tag, assets, queryable]);

  async function saveBookmark() {
    const name = window.prompt("Name this query:");
    if (!name) return;
    const statement = sqlMode
      ? sql
      : buildSql(
          (await import("@lib/platform/duckdb")).sourceFor(pickedUrls),
          filters,
          limit
        );
    const res = await fetch("/api/platform/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tag, assets: Array.from(picked), sql: statement }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setQueryError(data.message || "Save failed");
      return;
    }
    await swrMutate("/api/platform/bookmarks");
  }

  function applyBookmark(bookmark: BookmarkDoc) {
    setPendingBookmark(bookmark);
    if (bookmark.tag !== tag) selectTag(bookmark.tag);
  }

  async function removeBookmark(id: string) {
    await fetch(`/api/platform/bookmarks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await swrMutate("/api/platform/bookmarks");
  }

  const grouped = useMemo(() => {
    const bySport = new Map<string, DatasetOption[]>();
    for (const d of datasets) {
      const bucket = bySport.get(d.sport);
      if (bucket) bucket.push(d);
      else bySport.set(d.sport, [d]);
    }
    return Array.from(bySport.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [datasets]);

  // Same-origin proxy URLs (api/platform/datasets/file): GitHub's release
  // asset hosts send no CORS headers, so the browser can only range-read
  // them through our own origin. Absolute URLs because DuckDB's worker
  // resolves them outside the page's base URL. `asset` must remain the LAST
  // query param — sourceFor() sniffs the file extension off the URL tail.
  const pickedUrls = useMemo(
    () =>
      queryable
        .filter((a) => picked.has(a.name))
        .map(
          (a) =>
            `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(tag)}&asset=${encodeURIComponent(a.name)}`
        ),
    [queryable, picked, tag]
  );

  // --- table (stem) + partition (season) selection over the release assets --
  const [stem, setStem] = useState("");
  const [partition, setPartition] = useState("");

  const parsed = useMemo(
    () =>
      queryable.map((a) => ({ asset: a, ...parseAsset(a.name) })),
    [queryable]
  );
  const stems = useMemo(
    () => Array.from(new Set(parsed.map((p) => p.stem))).sort(),
    [parsed]
  );
  const partitions = useMemo(
    () =>
      Array.from(
        new Set(
          parsed
            .filter((p) => p.stem === stem && p.partition)
            .map((p) => p.partition as string)
        )
      )
        .sort()
        .reverse(),
    [parsed, stem]
  );

  /** Best asset for the current stem+partition (parquet preferred). */
  const selectedAsset = useMemo(() => {
    const candidates = parsed.filter(
      (p) => p.stem === stem && (p.partition ?? "") === partition
    );
    const pq = candidates.find((p) => p.asset.name.endsWith(".parquet"));
    return (pq ?? candidates[0])?.asset.name ?? null;
  }, [parsed, stem, partition]);

  // Default the dropdowns as data arrives: first stem, newest partition.
  useEffect(() => {
    if (stems.length && !stems.includes(stem)) setStem(stems[0]);
  }, [stems, stem]);
  useEffect(() => {
    if (!stem) return;
    if (partitions.length) {
      if (!partitions.includes(partition)) setPartition(partitions[0]);
    } else if (partition !== "") {
      setPartition(""); // unpartitioned release: single whole-file "season"
    }
  }, [stem, partitions, partition]);

  // Selection drives everything: pick the asset, then auto-load its schema and
  // an initial preview so the user lands straight in a filterable grid.
  useEffect(() => {
    if (!selectedAsset || pendingBookmark) return;
    setPicked(new Set([selectedAsset]));
    setColumns([]);
    setResult(null);
    setSqlMode(false);
    setSql("");
  }, [selectedAsset, pendingBookmark]);

  function selectTag(next: string) {
    setTag(next);
    setStem("");
    setPartition("");
    setPicked(new Set());
    setColumns([]);
    setFilters([]);
    setResult(null);
    setSql("");
    setQueryError(null);
  }

  async function withEngine<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setQueryError(null);
    try {
      return await fn();
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function loadSchema() {
    const { runQuery, sourceFor } = await import("@lib/platform/duckdb");
    await withEngine("Loading schema…", async () => {
      const described = await runQuery(`DESCRIBE SELECT * FROM ${sourceFor(pickedUrls)}`, 1000);
      const nameIdx = described.columns.indexOf("column_name");
      const typeIdx = described.columns.indexOf("column_type");
      setColumns(
        described.rows.map((r) => ({ name: r[nameIdx] ?? "", type: r[typeIdx] ?? "" }))
      );
      setFilters([{ column: "", op: "=", value: "" }]);
    });
  }

  // Auto flow: whenever the selected season file changes, load its schema and
  // an unfiltered preview in one pass — the grid is immediately filterable.
  useEffect(() => {
    if (pickedUrls.length !== 1 || sqlMode || columns.length > 0) return;
    let cancelled = false;
    (async () => {
      const { runQuery, sourceFor } = await import("@lib/platform/duckdb");
      const source = sourceFor(pickedUrls);
      await withEngine("Loading season…", async () => {
        const described = await runQuery(`DESCRIBE SELECT * FROM ${source}`, 1000);
        if (cancelled) return;
        const nameIdx = described.columns.indexOf("column_name");
        const typeIdx = described.columns.indexOf("column_type");
        setColumns(
          described.rows.map((r) => ({ name: r[nameIdx] ?? "", type: r[typeIdx] ?? "" }))
        );
        setFilters([{ column: "", op: "=", value: "" }]);
        const preview = await runQuery(buildSql(source, [], limit), 500);
        if (!cancelled) setResult(preview);
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only on file change
  }, [pickedUrls, sqlMode]);

  async function run() {
    const { runQuery, sourceFor } = await import("@lib/platform/duckdb");
    const statement = sqlMode ? sql : buildSql(sourceFor(pickedUrls), filters, limit);
    if (!sqlMode) setSql(statement);
    await withEngine("Querying…", async () => {
      setResult(await runQuery(statement, 500));
    });
  }

  async function downloadCsv() {
    const { queryToCsvBlob, sourceFor } = await import("@lib/platform/duckdb");
    const statement = sqlMode ? sql : buildSql(sourceFor(pickedUrls), filters, limit);
    await withEngine("Exporting…", async () => {
      const { blob } = await queryToCsvBlob(statement);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tag || "export"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Explore</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Query and export the org&apos;s release datasets — pick a dataset, choose season
        files, filter, preview, download CSV. Queries run in your browser via DuckDB;
        only the row groups you touch are downloaded.
      </p>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-inter text-sm text-destructive">
          Failed to load the dataset catalog: {error}
        </div>
      ) : null}

      {bookmarks && bookmarks.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="font-inter text-sm text-muted-foreground">Saved:</span>
          {bookmarks.map((b) => (
            <span
              key={b._id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              <button onClick={() => applyBookmark(b)} title={`${b.tag} · ${b.assets.length} file(s)`}>
                {b.name}
              </button>
              <button
                onClick={() => removeBookmark(b._id)}
                aria-label={`Delete saved query ${b.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Step 1 — dataset */}
      <h2 className="mb-2 font-barlow text-lg font-semibold">1 · Dataset</h2>
      <select
        value={tag}
        onChange={(e) => selectTag(e.target.value)}
        className="mb-6 w-full max-w-xl rounded-md border border-input bg-card px-3 py-2 font-inter text-sm"
      >
        <option value="">Select a dataset…</option>
        {grouped.map(([sport, options]) => (
          <optgroup key={sport} label={sport.toUpperCase()}>
            {options.map((d) => (
              <option key={d.tag} value={d.tag}>
                {d.tag} · updated {timeAgo(d.updated)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Step 2 — table + season (partition) */}
      {tag ? (
        <>
          <h2 className="mb-2 font-barlow text-lg font-semibold">2 · Season</h2>
          {assetsError ? (
            <p className="mb-4 font-inter text-sm text-destructive">
              {assetsError.message}
            </p>
          ) : assetsLoading ? (
            <p className="mb-4 font-inter text-sm text-muted-foreground">Loading release…</p>
          ) : queryable.length === 0 ? (
            <p className="mb-4 font-inter text-sm text-muted-foreground">
              No parquet/csv assets in this release.
            </p>
          ) : (
            <div className="mb-6 flex flex-wrap items-end gap-3">
              {stems.length > 1 ? (
                <label className="flex flex-col gap-1 font-inter text-xs text-muted-foreground">
                  Table
                  <select
                    value={stem}
                    onChange={(e) => setStem(e.target.value)}
                    className="rounded-md border border-input bg-card px-2 py-1.5 font-mono text-sm text-foreground"
                  >
                    {stems.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex flex-col gap-1 font-inter text-xs text-muted-foreground">
                Season
                <select
                  value={partition}
                  onChange={(e) => setPartition(e.target.value)}
                  disabled={partitions.length === 0}
                  className="rounded-md border border-input bg-card px-2 py-1.5 font-mono text-sm text-foreground"
                >
                  {partitions.length === 0 ? (
                    <option value="">full file</option>
                  ) : (
                    partitions.map((p) => (
                      <option key={p} value={p}>
                        {p.replace("_", "-")}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {selectedAsset ? (
                <span className="pb-1.5 font-mono text-xs text-muted-foreground">
                  {selectedAsset}
                </span>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {/* Step 3 — query */}
      {pickedUrls.length > 0 ? (
        <>
          <h2 className="mb-2 font-barlow text-lg font-semibold">3 · Query &amp; export</h2>
          {columns.length === 0 && !sqlMode ? (
            <Button onClick={loadSchema} disabled={busy !== null}>
              {busy ?? "Load schema"}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-inter text-sm">
                  <input type="checkbox" checked={sqlMode} onChange={(e) => setSqlMode(e.target.checked)} />
                  SQL mode
                </label>
                <label className="flex items-center gap-2 font-inter text-sm">
                  Limit
                  <input
                    type="number"
                    value={limit}
                    min={1}
                    max={1_000_000}
                    onChange={(e) => setLimit(Number(e.target.value) || 100)}
                    className="w-24 rounded-md border border-input bg-card px-2 py-1"
                    disabled={sqlMode}
                  />
                </label>
              </div>

              {sqlMode ? (
                <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="w-full rounded-md border border-input bg-card p-3 font-mono text-xs"
                />
              ) : (
                <div className="space-y-2">
                  {filters.map((f, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select
                        value={f.column}
                        onChange={(e) =>
                          setFilters(filters.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))
                        }
                        className="rounded-md border border-input bg-card px-2 py-1 font-mono text-xs"
                      >
                        <option value="">column…</option>
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.op}
                        onChange={(e) =>
                          setFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))
                        }
                        className="rounded-md border border-input bg-card px-2 py-1 font-mono text-xs"
                      >
                        {OPS.map((op) => (
                          <option key={op}>{op}</option>
                        ))}
                      </select>
                      <input
                        value={f.value}
                        onChange={(e) =>
                          setFilters(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                        }
                        placeholder="value"
                        className="w-44 rounded-md border border-input bg-card px-2 py-1 font-mono text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove filter"
                        onClick={() => setFilters(filters.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters([...filters, { column: "", op: "=", value: "" }])}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add filter
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={run} disabled={busy !== null}>
                  <Play className="mr-1 h-4 w-4" /> {busy ?? "Run"}
                </Button>
                <Button variant="outline" onClick={downloadCsv} disabled={busy !== null}>
                  <Download className="mr-1 h-4 w-4" /> Download CSV
                </Button>
                <Button variant="ghost" onClick={saveBookmark} disabled={busy !== null}>
                  <Bookmark className="mr-1 h-4 w-4" /> Save query
                </Button>
              </div>
            </div>
          )}

          {queryError ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
              {queryError}
            </div>
          ) : null}

          {result ? (
            <div className="mt-6">
              <p className="mb-2 font-inter text-sm text-muted-foreground">
                {result.rowCount.toLocaleString("en-US")} row{result.rowCount === 1 ? "" : "s"}
                {result.rowCount > result.rows.length
                  ? ` (showing first ${result.rows.length})`
                  : ""}
              </p>
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-muted uppercase text-muted-foreground">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="whitespace-nowrap px-3 py-2">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {row.map((cell, j) => (
                          <td key={j} className="max-w-[16rem] truncate whitespace-nowrap px-3 py-1" title={cell ?? ""}>
                            {cell ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
