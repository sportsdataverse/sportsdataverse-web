"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Play,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import fetcher from "@lib/fetcher";
import type { QueryResult as SqlResult } from "@lib/platform/duckdb";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Input } from "@components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";
import { Skeleton } from "@components/ui/skeleton";
import { cn } from "@lib/utils";
import ResultsGrid from "@components/platform/ResultsGrid";
import { columnTip, tableTip } from "@lib/platform/glossary";

const OPERATORS = [
  { suffix: "", label: "=" },
  { suffix: "__ne", label: "≠" },
  { suffix: "__gt", label: ">" },
  { suffix: "__gte", label: "≥" },
  { suffix: "__lt", label: "<" },
  { suffix: "__lte", label: "≤" },
  { suffix: "__like", label: "like" },
] as const;

/** The API's curated typed filter params (mirror of sdv-db curation filter_keys):
 *  any of these present on the selected table surface as one-click filter tags. */
const FILTER_TAGS = [
  "season",
  "season_type",
  "week",
  "game_id",
  "game_date",
  "date",
  "team_id",
  "team",
  "pos_team",
  "home_team_id",
  "away_team_id",
  "home_team",
  "away_team",
  "athlete_id",
  "player_id",
  "play_id",
  "posteam",
  "defteam",
  "conference",
  "division",
] as const;

interface Filter {
  column: string;
  op: string;
  value: string;
}

interface QueryResult {
  schema_name: string;
  table: string;
  count: number;
  data: Record<string, unknown>[];
}

function buildParams(
  schema: string,
  table: string,
  filters: Filter[],
  select: string[],
  order: string,
  limit: number
): URLSearchParams {
  const p = new URLSearchParams({ schema, table });
  for (const f of filters) {
    if (f.column && f.value !== "") p.set(`${f.column}${f.op}`, f.value);
  }
  if (select.length) p.set("select", select.join(","));
  if (order) p.set("order", order);
  p.set("limit", String(limit));
  return p;
}

function toCells(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function QueryBuilder({ schemas }: { schemas: string[] }) {
  const [schema, setSchema] = useState(schemas[0] ?? "");
  const [table, setTable] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [colSearch, setColSearch] = useState("");
  const [dragChip, setDragChip] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [select, setSelect] = useState<string[]>([]);
  const [order, setOrder] = useState("");
  const [limit, setLimit] = useState(100);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- SQL-on-result (DuckDB over the fetched rows) ---
  const [sql, setSql] = useState("");
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);

  const { data: tablesPayload } = useSWR<{
    schema_name: string;
    tables: Record<string, Record<string, string>>;
  }>(schema ? `/api/platform/query/tables?schema=${schema}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const tables = useMemo(
    () => Object.keys(tablesPayload?.tables ?? {}).sort(),
    [tablesPayload]
  );
  const visibleTables = useMemo(
    () =>
      tableSearch
        ? tables.filter((t) => t.includes(tableSearch.toLowerCase()))
        : tables,
    [tables, tableSearch]
  );
  const columnTypes = useMemo(
    () => tablesPayload?.tables?.[table] ?? {},
    [tablesPayload, table]
  );
  const columnNames = useMemo(() => Object.keys(columnTypes), [columnTypes]);
  /** Selected columns first (in their chosen order), the rest alphabetical —
   *  the rearrangement IS the API `select` order. */
  const arrangedColumns = useMemo(() => {
    const rest = columnNames
      .filter((c) => !select.includes(c))
      .filter((c) => !colSearch || c.includes(colSearch.toLowerCase()))
      .sort();
    return [...select, ...rest];
  }, [columnNames, select, colSearch]);

  const suggestedTags = useMemo(
    () => FILTER_TAGS.filter((t) => t in columnTypes),
    [columnTypes]
  );

  useEffect(() => {
    // reset table-dependent state when the schema/table changes
    setFilters([]);
    setSelect([]);
    setOrder("");
    setResult(null);
    setSqlResult(null);
    setSqlOpen(false);
    setColSearch("");
  }, [schema, table]);

  const params = buildParams(schema, table, filters, select, order, limit);
  const apiUrl = `https://data.sportsdataverse.org/v1/${schema}/${table}?${(() => {
    const p = new URLSearchParams(params);
    p.delete("schema");
    p.delete("table");
    return p.toString();
  })()}`;
  const curl = `curl -H "Authorization: Bearer $SDV_API_KEY" \\\n  "${apiUrl}"`;

  async function run() {
    if (!schema || !table) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/platform/query/run?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as QueryResult);
      setSqlResult(null);
    } catch (err) {
      toast.error("Query failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  }

  async function runSql() {
    if (!result?.data?.length) return;
    setSqlBusy(true);
    try {
      const { queryOverRows } = await import("@lib/platform/duckdb");
      setSqlResult(await queryOverRows(result.data, sql));
    } catch (err) {
      toast.error("SQL failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSqlBusy(false);
    }
  }

  async function downloadCsv() {
    const p = new URLSearchParams(params);
    p.set("format", "csv");
    const res = await fetch(`/api/platform/query/run?${p}`);
    if (!res.ok) {
      toast.error(`CSV export failed (HTTP ${res.status})`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${schema}_${table}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function addTagFilter(column: string) {
    setFilters((fs) =>
      fs.some((f) => f.column === column && f.value === "")
        ? fs
        : [...fs, { column, op: "", value: "" }]
    );
  }

  function dropChipOn(target: string) {
    if (!dragChip || dragChip === target) return;
    setSelect((s) => {
      const src = s.indexOf(dragChip);
      const dst = s.indexOf(target);
      if (src < 0 || dst < 0) return s;
      const next = [...s];
      next.splice(src, 1);
      next.splice(dst, 0, dragChip);
      return next;
    });
    setDragChip(null);
  }

  function moveSelected(name: string, delta: -1 | 1) {
    setSelect((s) => {
      const i = s.indexOf(name);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const previewColumns = result?.data?.length ? Object.keys(result.data[0]) : [];
  const previewRows = useMemo(
    () =>
      (result?.data ?? []).map((row) => previewColumns.map((c) => toCells(row[c]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewColumns derives from result
    [result]
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Build a query</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-muted-foreground">league</label>
              <Select value={schema} onValueChange={setSchema}>
                <SelectTrigger className="w-36 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schemas.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-muted-foreground">order</label>
              <Input
                className="w-40 font-mono"
                placeholder="-season"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-xs text-muted-foreground">limit</label>
              <Input
                type="number"
                className="w-24 font-mono"
                min={1}
                max={10000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 100)}
              />
            </div>
            <Button onClick={run} disabled={!table || running} className="gap-2">
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run
            </Button>
            <Button
              variant="outline"
              onClick={downloadCsv}
              disabled={!table}
              className="gap-2"
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>

          {/* table picker: searchable chip rail, not a blind dropdown */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                table ({tables.length})
              </span>
              <Input
                className="h-7 w-48 font-mono text-xs"
                placeholder="search tables…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {visibleTables.map((t) => (
                <button
                  key={t}
                  type="button"
                  title={tableTip(t)}
                  onClick={() => setTable(t)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
                    t === table
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
              {tables.length === 0 ? (
                <span className="font-mono text-xs text-muted-foreground">loading…</span>
              ) : null}
            </div>
          </div>

          {table ? (
            <>
              {/* one-click filter tags from the API's typed filter params */}
              {suggestedTags.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    filter tags
                  </span>
                  {suggestedTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      title={columnTip(t, columnTypes[t])}
                      onClick={() => addTagFilter(t)}
                      className="rounded-full border border-dashed border-primary/50 px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/10"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">filters</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 font-mono text-xs"
                    onClick={() =>
                      setFilters((f) => [...f, { column: "", op: "", value: "" }])
                    }
                  >
                    <Plus className="size-3" /> add
                  </Button>
                </div>
                {filters.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={f.column}
                      onValueChange={(v) =>
                        setFilters((fs) =>
                          fs.map((x, j) => (j === i ? { ...x, column: v } : x))
                        )
                      }
                    >
                      <SelectTrigger className="w-52 font-mono text-xs">
                        <SelectValue placeholder="column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columnNames.map((name) => (
                          <SelectItem key={name} value={name} className="font-mono text-xs">
                            {name}{" "}
                            <span className="text-muted-foreground">
                              ({columnTypes[name]})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={f.op}
                      onValueChange={(v) =>
                        setFilters((fs) =>
                          fs.map((x, j) => (j === i ? { ...x, op: v === "eq" ? "" : v } : x))
                        )
                      }
                    >
                      <SelectTrigger className="w-20 font-mono text-xs">
                        <SelectValue placeholder="=" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (
                          <SelectItem
                            key={o.suffix || "eq"}
                            value={o.suffix || "eq"}
                            className="font-mono text-xs"
                          >
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-44 font-mono text-xs"
                      placeholder="value"
                      value={f.value}
                      onChange={(e) =>
                        setFilters((fs) =>
                          fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* column selection: search + rearrangement (order = API select order) */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    columns ({select.length ? `${select.length} selected` : "all"})
                  </span>
                  <Input
                    className="h-7 w-44 font-mono text-xs"
                    placeholder="search columns…"
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                  />
                  {select.length ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 font-mono text-xs"
                      onClick={() => setSelect([])}
                    >
                      clear
                    </Button>
                  ) : null}
                </div>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {arrangedColumns.map((name) => {
                    const idx = select.indexOf(name);
                    const on = idx >= 0;
                    return (
                      <span
                        key={name}
                        draggable={on}
                        onDragStart={() => setDragChip(name)}
                        onDragOver={(e) => on && e.preventDefault()}
                        onDrop={() => dropChipOn(name)}
                        onDragEnd={() => setDragChip(null)}
                        className={cn(
                          "inline-flex items-center overflow-hidden rounded-md border font-mono text-[11px]",
                          on
                            ? "cursor-grab border-primary/60 bg-primary/15 text-primary active:cursor-grabbing"
                            : "border-border/70 text-muted-foreground",
                          dragChip === name && "opacity-40"
                        )}
                      >
                        <button
                          type="button"
                          title={columnTip(name, columnTypes[name])}
                          onClick={() =>
                            setSelect((s) =>
                              on ? s.filter((c) => c !== name) : [...s, name]
                            )
                          }
                          className="px-2 py-0.5 hover:text-foreground"
                        >
                          {on ? `${idx + 1}·${name}` : name}
                        </button>
                        {on ? (
                          <span className="flex border-l border-primary/30">
                            <button
                              type="button"
                              aria-label={`move ${name} earlier`}
                              onClick={() => moveSelected(name, -1)}
                              className="px-0.5 hover:bg-primary/20"
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={`move ${name} later`}
                              onClick={() => moveSelected(name, 1)}
                              className="px-0.5 hover:bg-primary/20"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs leading-5">
                  {curl}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 font-mono text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(curl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  curl
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {running && !result ? <Skeleton className="h-48 w-full" /> : null}

      {result ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center font-display text-base">
              {result.count} rows
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {result.schema_name}.{result.table}
              </span>
              <Button
                variant={sqlOpen ? "secondary" : "outline"}
                size="sm"
                className="ml-auto gap-2 font-mono text-xs"
                onClick={() => {
                  setSqlOpen((o) => !o);
                  if (!sql)
                    setSql("SELECT *\nFROM result\nLIMIT 100");
                }}
              >
                <Terminal className="size-3.5" /> SQL on result
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sqlOpen ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs text-muted-foreground">
                  Reshape the fetched rows with DuckDB — the result set is the{" "}
                  <code>result</code> table. Runs entirely in your browser.
                </p>
                <textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runSql();
                  }}
                  rows={4}
                  spellCheck={false}
                  className="w-full rounded-md border border-input bg-card p-3 font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={runSql} disabled={sqlBusy} className="gap-2">
                    {sqlBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    Run SQL
                  </Button>
                  {sqlResult ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSqlResult(null)}
                      className="font-mono text-xs"
                    >
                      back to raw rows
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {sqlResult ? (
              <ResultsGrid columns={sqlResult.columns} rows={sqlResult.rows} />
            ) : result.data.length === 0 ? (
              <p className="py-6 text-center font-mono text-sm text-muted-foreground">
                no rows matched
              </p>
            ) : (
              <ResultsGrid
                columns={previewColumns}
                rows={previewRows}
                types={columnTypes}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
