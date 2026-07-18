"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, Copy, Download, Loader2, Play, Plus, X } from "lucide-react";
import fetcher from "@lib/fetcher";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/table";
import { Skeleton } from "@components/ui/skeleton";
import { cn } from "@lib/utils";

const OPERATORS = [
  { suffix: "", label: "=" },
  { suffix: "__ne", label: "≠" },
  { suffix: "__gt", label: ">" },
  { suffix: "__gte", label: "≥" },
  { suffix: "__lt", label: "<" },
  { suffix: "__lte", label: "≤" },
  { suffix: "__like", label: "like" },
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

export default function QueryBuilder({ schemas }: { schemas: string[] }) {
  const [schema, setSchema] = useState(schemas[0] ?? "");
  const [table, setTable] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [select, setSelect] = useState<string[]>([]);
  const [order, setOrder] = useState("");
  const [limit, setLimit] = useState(100);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const columns = useMemo(
    () => Object.entries(tablesPayload?.tables?.[table] ?? {}),
    [tablesPayload, table]
  );

  useEffect(() => {
    // reset table-dependent state when the schema/table changes
    setFilters([]);
    setSelect([]);
    setOrder("");
    setResult(null);
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
    } catch (err) {
      toast.error("Query failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
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

  const previewColumns = result?.data?.length
    ? Object.keys(result.data[0])
    : [];

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
                <SelectTrigger className="w-32 font-mono">
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
              <label className="font-mono text-xs text-muted-foreground">table</label>
              <Select value={table} onValueChange={setTable}>
                <SelectTrigger className="w-56 font-mono">
                  <SelectValue placeholder={tables.length ? "pick a table" : "loading…"} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t} value={t} className="font-mono">
                      {t}
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

          {table ? (
            <>
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
                        {columns.map(([name, dtype]) => (
                          <SelectItem key={name} value={name} className="font-mono text-xs">
                            {name} <span className="text-muted-foreground">({dtype})</span>
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

              <div className="flex flex-col gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  columns ({select.length ? `${select.length} selected` : "all"})
                </span>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {columns.map(([name]) => {
                    const on = select.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setSelect((s) =>
                            on ? s.filter((c) => c !== name) : [...s, name]
                          )
                        }
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
                          on
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/70 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {name}
                      </button>
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
            <CardTitle className="font-display text-base">
              {result.count} rows
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {result.schema_name}.{result.table}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.data.length === 0 ? (
              <p className="py-6 text-center font-mono text-sm text-muted-foreground">
                no rows matched
              </p>
            ) : (
              <div className="max-h-[32rem] overflow-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {previewColumns.map((c) => (
                        <TableHead key={c} className="whitespace-nowrap font-mono text-xs">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.map((row, i) => (
                      <TableRow key={i}>
                        {previewColumns.map((c) => (
                          <TableCell
                            key={c}
                            className="max-w-64 truncate whitespace-nowrap font-mono text-xs"
                            title={String(row[c] ?? "")}
                          >
                            {row[c] === null || row[c] === undefined
                              ? "∅"
                              : String(row[c])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
