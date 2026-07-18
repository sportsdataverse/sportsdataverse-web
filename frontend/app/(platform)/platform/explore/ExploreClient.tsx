"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { Bookmark, Download, Play, Plus, X } from "lucide-react";
import { formatBytes, timeAgo } from "@components/platform/widgets";
import { Button } from "@components/ui/button";
import { EXPLORE_PRESETS, quickWhere } from "@content/presets";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import type { QueryResult } from "@lib/platform/duckdb";
import type { BookmarkDoc } from "@lib/platform/schemas";

/**
 * CFBD-exporter-style data exploration: pick a dataset (release tag) → pick
 * season assets → filter/query → preview grid → export CSV. Queries run
 * entirely in the browser (DuckDB-WASM over release parquet/csv via HTTP
 * range reads) — imported dynamically so none of it touches SSR.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const QUERYABLE = /\.(parquet|csv|csv\.gz)$/i;

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

  const preset = tag ? EXPLORE_PRESETS[tag] : undefined;
  const [quickValues, setQuickValues] = useState<Record<string, string>>({});
  const quickSeasons = useMemo(
    () =>
      preset
        ? queryable
            .map((a) => a.name)
            .filter((n) => n.startsWith(preset.assetPrefix) && n.endsWith(".parquet"))
            .sort()
            .reverse()
        : [],
    [preset, queryable]
  );
  const [quickSeason, setQuickSeason] = useState("");

  async function quickRun() {
    if (!preset) return;
    const asset = quickSeason || quickSeasons[0];
    if (!asset) return;
    const { runQuery } = await import("@lib/platform/duckdb");
    const url = `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(tag)}&asset=${encodeURIComponent(asset)}`;
    const where = quickWhere(preset.fields, quickValues);
    const statement = [
      `SELECT * FROM read_parquet('${url}')`,
      where ? `WHERE ${where}` : null,
      `LIMIT ${Math.max(1, limit)}`,
    ]
      .filter(Boolean)
      .join("\n");
    setPicked(new Set([asset]));
    setSqlMode(true);
    setSql(statement);
    await withEngine("Querying…", async () => {
      setResult(await runQuery(statement, 500));
    });
  }

  function selectTag(next: string) {
    setTag(next);
    setQuickValues({});
    setQuickSeason("");
    setPicked(new Set());
    setColumns([]);
    setFilters([]);
    setResult(null);
    setSql("");
    setQueryError(null);
  }

  function togglePicked(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setColumns([]);
    setResult(null);
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
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 font-inter text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          Failed to load the dataset catalog: {error}
        </div>
      ) : null}

      {bookmarks && bookmarks.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="font-inter text-sm text-muted-foreground">Saved:</span>
          {bookmarks.map((b) => (
            <span
              key={b._id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary dark:bg-white/10 dark:text-sky-300"
            >
              <button onClick={() => applyBookmark(b)} title={`${b.tag} · ${b.assets.length} file(s)`}>
                {b.name}
              </button>
              <button
                onClick={() => removeBookmark(b._id)}
                aria-label={`Delete saved query ${b.name}`}
                className="text-muted-foreground hover:text-red-600"
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
        className="mb-6 w-full max-w-xl rounded-md border border-gray-300 bg-white px-3 py-2 font-inter text-sm dark:border-gray-600 dark:bg-darkSecondary"
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

      {preset && quickSeasons.length > 0 ? (
        <div className="mb-8 rounded-lg border border-primary/30 bg-primary/5 p-4 dark:border-sky-800 dark:bg-sky-950/20">
          <h2 className="mb-3 font-barlow text-lg font-semibold">Quick query</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-inter text-xs text-muted-foreground">
              Season
              <select
                value={quickSeason || quickSeasons[0]}
                onChange={(e) => setQuickSeason(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-foreground dark:border-gray-600 dark:bg-darkSecondary"
              >
                {quickSeasons.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset.replace(preset.assetPrefix, "").replace(".parquet", "")}
                  </option>
                ))}
              </select>
            </label>
            {preset.fields.map((field) => (
              <label
                key={field.label}
                className="flex flex-col gap-1 font-inter text-xs text-muted-foreground"
              >
                {field.label}
                <input
                  value={quickValues[field.label] ?? ""}
                  onChange={(e) =>
                    setQuickValues({ ...quickValues, [field.label]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  className="w-36 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-foreground dark:border-gray-600 dark:bg-darkSecondary"
                />
              </label>
            ))}
            <Button onClick={quickRun} disabled={busy !== null}>
              <Play className="mr-1 h-4 w-4" /> {busy ?? "Run quick query"}
            </Button>
          </div>
          <p className="mt-2 font-inter text-xs text-muted-foreground">
            Runs against one season file with a 500-row preview; the generated SQL lands
            in SQL mode below for tweaking or export.
          </p>
        </div>
      ) : null}

      {/* Step 2 — assets */}
      {tag ? (
        <>
          <h2 className="mb-2 font-barlow text-lg font-semibold">2 · Files</h2>
          {assetsError ? (
            <p className="mb-4 font-inter text-sm text-red-600 dark:text-red-400">
              {assetsError.message}
            </p>
          ) : assetsLoading ? (
            <p className="mb-4 font-inter text-sm text-muted-foreground">Loading files…</p>
          ) : queryable.length === 0 ? (
            <p className="mb-4 font-inter text-sm text-muted-foreground">
              No parquet/csv assets in this release.
            </p>
          ) : (
            <div className="mb-6 grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-2 lg:grid-cols-3">
              {queryable.map((a) => (
                <label key={a.name} className="flex items-center gap-2 font-mono text-xs">
                  <input
                    type="checkbox"
                    checked={picked.has(a.name)}
                    onChange={() => togglePicked(a.name)}
                  />
                  <span className="truncate" title={a.name}>
                    {a.name}
                  </span>
                  <span className="ml-auto whitespace-nowrap text-muted-foreground">
                    {formatBytes(a.size)}
                  </span>
                </label>
              ))}
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
                    className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-darkSecondary"
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
                  className="w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-xs dark:border-gray-600 dark:bg-darkSecondary"
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
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-darkSecondary"
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
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-darkSecondary"
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
                        className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-600 dark:bg-darkSecondary"
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
            <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 font-mono text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
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
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="sticky top-0 bg-gray-50 uppercase text-muted-foreground dark:bg-gray-800">
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
                      <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
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
