import { useMemo, useState } from "react";
import type { GetServerSidePropsContext } from "next";
import useSWR from "swr";
import { Download, Play, Plus, X } from "lucide-react";
import PlatformShell, { formatBytes, timeAgo } from "@components/platform/PlatformShell";
import { Button } from "@components/ui/button";
import { classifyReleaseTag } from "@content/platform";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import { listRepoReleases } from "@lib/platform/github";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import type { QueryResult } from "@lib/platform/duckdb";

/**
 * CFBD-exporter-style data exploration: pick a dataset (release tag) → pick
 * season assets → filter/query → preview grid → export CSV. Queries run
 * entirely in the browser (DuckDB-WASM over release parquet/csv via HTTP
 * range reads) — imported dynamically so none of it touches SSR.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const QUERYABLE = /\.(parquet|csv|csv\.gz)$/i;

type DatasetOption = { tag: string; sport: string; updated: string | null };

type ExploreProps = {
  platformSession: PlatformSessionProps;
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

export default function PlatformExplore({ platformSession: session, datasets, error }: ExploreProps) {
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
    session.authorized && tag
      ? `/api/platform/datasets/assets?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(tag)}`
      : null,
    fetcher
  );

  const queryable = useMemo(() => (assets ?? []).filter((a) => QUERYABLE.test(a.name)), [assets]);

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

  function selectTag(next: string) {
    setTag(next);
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
    <PlatformShell session={session} title="Explore">
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
          {columns.length === 0 ? (
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
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getPlatformSessionProps(ctx);
  if (!session.authorized) {
    return { props: { platformSession: session, datasets: [], error: null } };
  }
  try {
    const releases = await listRepoReleases(DATA_REPO);
    const datasets: DatasetOption[] = releases.map((rel) => ({
      tag: rel.tag,
      sport: classifyReleaseTag(rel.tag).sport,
      updated: rel.latest_asset_at,
    }));
    return { props: { platformSession: session, datasets, error: null } };
  } catch (error) {
    return {
      props: {
        platformSession: session,
        datasets: [],
        error: error instanceof Error ? error.message : "GitHub error",
      },
    };
  }
}
