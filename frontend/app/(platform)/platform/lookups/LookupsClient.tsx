"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@components/ui/button";
import { LOOKUP_SPORTS } from "@content/lookups";
import type { LookupSport } from "@content/lookups";
import type { QueryResult } from "@lib/platform/duckdb";

/**
 * CFBD-style lookups: player search and team directory per sport, backed by
 * the current-season roster parquet (content/lookups.ts) through the same
 * DuckDB-WASM engine + range proxy the Explore tab uses.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

function proxyUrl(sport: LookupSport): string {
  return `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}&asset=${encodeURIComponent(sport.asset)}`;
}

export default function LookupsClient() {
  const [sportKey, setSportKey] = useState(LOOKUP_SPORTS[0].key);
  const [mode, setMode] = useState<"players" | "teams">("players");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const sport = useMemo(
    () => LOOKUP_SPORTS.find((s) => s.key === sportKey) ?? LOOKUP_SPORTS[0],
    [sportKey]
  );

  async function search() {
    const { runQuery } = await import("@lib/platform/duckdb");
    setBusy(true);
    setError(null);
    try {
      const source = `read_parquet('${proxyUrl(sport)}')`;
      let sql: string;
      if (mode === "players") {
        const cols = [
          ...(sport.headshotCol ? [`"${sport.headshotCol}"`] : []),
          ...sport.columns.map((c) => `"${c.col}"`),
        ].join(", ");
        const needle = term.replace(/'/g, "''");
        sql = [
          `SELECT ${cols} FROM ${source}`,
          term ? `WHERE CAST("${sport.nameCol}" AS VARCHAR) ILIKE '%${needle}%'` : null,
          `ORDER BY "${sport.nameCol}" LIMIT 100`,
        ]
          .filter(Boolean)
          .join("\n");
      } else {
        // No LIMIT: ESPN college roster files carry 900+ teams and a cap
        // silently truncated the directory mid-alphabet.
        sql = `SELECT "${sport.teamCol}" AS team, count(*)::INT AS players FROM ${source} GROUP BY 1 ORDER BY 1`;
      }
      setResult(await runQuery(sql, 2000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const headshotIdx = mode === "players" && sport.headshotCol && result ? 0 : -1;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Lookups</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Player search and team directory per sport — current-season rosters, queried
        in your browser. For historical seasons use the Explore tab.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {LOOKUP_SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setSportKey(s.key);
              setResult(null);
            }}
            className={`rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors ${
              s.key === sportKey
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-2 text-muted-foreground">·</span>
        {(["players", "teams"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
            className={`rounded-full px-3 py-1 font-inter text-sm font-medium capitalize transition-colors ${
              m === mode
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form
        className="mb-6 flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        {mode === "players" ? (
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Search ${sport.label} players…`}
            className="flex-1 rounded-md border border-input bg-card px-3 py-2 font-inter text-sm"
          />
        ) : null}
        <Button type="submit" disabled={busy}>
          <Search className="mr-1 h-4 w-4" />
          {busy ? "Searching…" : mode === "players" ? "Search" : "List teams"}
        </Button>
      </form>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left font-inter text-sm">
            <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                {headshotIdx === 0 ? <th className="px-3 py-2" /> : null}
                {(mode === "players"
                  ? sport.columns.map((c) => c.label)
                  : ["Team", "Players"]
                ).map((label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {headshotIdx === 0 ? (
                    <td className="px-3 py-1">
                      {row[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row[0]}
                          alt=""
                          loading="lazy"
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : null}
                    </td>
                  ) : null}
                  {row.slice(headshotIdx === 0 ? 1 : 0).map((cell, j) => (
                    <td key={j} className="whitespace-nowrap px-3 py-1">
                      {cell ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
