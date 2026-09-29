"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChartScatter } from "lucide-react";
import ResultsGrid from "@components/platform/ResultsGrid";
import { RATINGS, TEAM_COL, type RatingSource } from "@content/ratings";
import { apiRows, fetchReleaseAssets, seasonRange, teamNameRows } from "@lib/platform/queryRun";
import { joinNames } from "@lib/platform/viz/scatterMath";
import {
  EMPTY_GRID,
  gridViewParams,
  ratingsChartHref,
  ratingsViewParams,
  type GridPin,
  type GridView,
  type RatingsView,
} from "@lib/platform/viewState";
import { API_MAX_ROWS, loadSequencer } from "@lib/platform/wp";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Ratings and impact leaderboards: one league × season of a published model
 * (content/ratings.ts), every row as the producer wrote it, in the shared
 * ResultsGrid, ordered by the model's headline rating. A Data API league is
 * one `/api/platform/query/run` read per season plus its team names; NFL reads
 * a release season file's newest week in the browser through DuckDB.
 */

type Row = Record<string, unknown>;
/** One (league, season) read, keyed so a switch never paints another's rows.
 *  `total`: rows read, before the D-I cut; `week`: a release file's newest. */
type Loaded = {
  key: string;
  rows: Row[];
  nameOf?: Map<number | string, string>;
  total: number;
  unnamed: number;
  left: number;
  unlisted: boolean;
  week?: string;
};

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;
const cell = (v: unknown): string | null => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v));

/** A release league's seasons, newest first, from its asset names. */
async function releaseSeasons(tag: string, prefix: string): Promise<string[]> {
  return (await fetchReleaseAssets(DATA_REPO, tag))
    .map((a) => (a.name.startsWith(prefix) && a.name.endsWith(".parquet") ? a.name.slice(prefix.length, -".parquet".length) : ""))
    .filter((y) => /^\d{4}$/.test(y))
    .sort()
    .reverse();
}

/** A season's rows in the config's order, nulls last: the Data API's own
 *  `order` (sdv-db sorts NULLS LAST), or DuckDB over the release file's
 *  newest week. The grid's team column is read as its id column. */
async function readRows(src: RatingSource, season: string): Promise<{ rows: Row[]; week?: string }> {
  const cols = [...new Set(src.select.map((c) => (c === TEAM_COL && src.names ? src.names.col : c)))];
  if (src.source === "api") {
    // the fixed filter first, so it can never override the scoped keys
    const params = { ...src.filter, schema: src.schema, table: src.table, season, select: cols.join(","), order: src.order, limit: API_MAX_ROWS };
    return { rows: await apiRows(params) };
  }
  const { runQuery } = await import("@lib/platform/duckdb");
  const asset = `${src.assetPrefix}${season}.parquet`;
  const file = `read_parquet('${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(src.tag)}&asset=${encodeURIComponent(asset)}')`;
  const [week, by] = [qi(src.week), qi(src.order.replace(/^-/, ""))];
  const res = await runQuery(
    `SELECT ${[...cols, src.week].map(qi).join(", ")} FROM ${file}
     WHERE ${week} = (SELECT max(${week}) FROM ${file})
     ORDER BY ${by} ${src.order.startsWith("-") ? "DESC" : "ASC"} NULLS LAST`,
    Number(API_MAX_ROWS)
  );
  const rows = res.rows.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]])));
  return { rows, week: rows.length ? String(rows[0][src.week]) : undefined };
}

const selectClass = "rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm";

export default function RatingsClient({ initial, initialPin }: { initial: RatingsView; initialPin: GridPin | null }) {
  const [league, setLeague] = useState(initial.league);
  // The grid's pins are the only grid.* key the page keeps: the board always opens on its own order.
  const [pin, setPin] = useState(initialPin);
  const onGridView = useCallback((v: GridView) => setPin(v.pin), []);
  const [season, setSeason] = useState(initial.season);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A league or season switch abandons an in-flight read: only the newest may land.
  const [runs] = useState(loadSequencer);
  const src = RATINGS[league] ?? Object.values(RATINGS)[0];

  const { data: seasons, error: seasonsError } = useSWR(["ratings-seasons", league], () =>
    src.source === "api" ? seasonRange(src) : releaseSeasons(src.tag, src.assetPrefix)
  );
  const activeSeason = seasons?.length ? (seasons.includes(season) ? season : seasons[0]) : "";
  const loadKey = `${league}|${activeSeason}`;
  const shown = loaded?.key === loadKey ? loaded : null;
  const pageParams = ratingsViewParams({ league, season: activeSeason || season });
  gridViewParams({ ...EMPTY_GRID, pin }, pageParams);
  useUrlMirror(pageParams);

  useEffect(() => {
    const ticket = runs.next();
    if (!activeSeason) return;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const [{ rows, week }, nameRows] = await Promise.all([
          readRows(src, activeSeason),
          src.names ? teamNameRows(src.names, activeSeason) : null,
        ]);
        if (!runs.isLatest(ticket)) return;
        // joinNames asserts both key types before anything is matched.
        const joined = src.names && nameRows ? joinNames(rows, nameRows, src.names) : { rows, unnamed: 0, left: 0, unlisted: false };
        setLoaded({ key: loadKey, total: rows.length, week, ...joined });
      } catch (e) {
        if (runs.isLatest(ticket)) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (runs.isLatest(ticket)) setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one read per (league, season)
  }, [loadKey]);

  const orderCol = src.order.replace(/^-/, "");
  const desc = src.order.startsWith("-");
  const gridRows = useMemo(() => {
    if (!shown) return [];
    const names = src.names;
    return shown.rows.map((r) =>
      src.select.map((c) => {
        if (c !== TEAM_COL || !names) return cell(r[c]);
        const id = r[names.col];
        return id == null ? null : (shown.nameOf?.get(id as number | string) ?? cell(id));
      })
    );
  }, [shown, src]);
  const types = useMemo(() => ({ ...src.columns, ...(src.names ? { [TEAM_COL]: "text" } : {}) }), [src]);
  // The grid opens on the board's order (the rows already arrive in it), so its header says so.
  // A season switch keeps the pins (the grid drops any id the new season lacks).
  const initialGrid: GridView = { sort: { col: orderCol, dir: desc ? "desc" : "asc" }, filters: {}, tint: "delta", pin };

  const one = src.noun.replace(/s$/, "");
  const d1 = src.names?.only && shown && !shown.unlisted ? `${src.names.only} ` : "";
  const span = shown
    ? `Every ${d1}${src.label} ${one} in ${activeSeason}${src.scope ? `, ${src.scope}` : ""}` +
      `${src.source === "release" && shown.week ? `, ${src.weekLabel} ${shown.week}` : ""}: ` +
      `${shown.rows.length.toLocaleString("en-US")} ${src.noun}, sorted by ${orderCol}, ${desc ? "highest" : "lowest"} first` +
      `${src.rank ? ` (${src.rank} is the producer's)` : ""}; ${src.sample}, no minimum.`
    : "";
  const notes = shown
    ? [
        shown.total >= Number(API_MAX_ROWS)
          ? `The Data API stops at ${Number(API_MAX_ROWS).toLocaleString("en-US")} rows and this season reached it: some ${src.noun} are missing.`
          : "",
        shown.left ? `${shown.left.toLocaleString("en-US")} non-${src.names?.only} ${src.noun} left out.` : "",
        shown.left && src.rank ? `The producer's ${src.rank} counts all ${shown.total.toLocaleString("en-US")} rated ${src.noun}, non-${src.names?.only} included.` : "",
        shown.unlisted ? `No ${src.names?.only} list for ${activeSeason}: every ${one} is shown.` : "",
        shown.rows.length ? "" : `No ${src.noun} in ${activeSeason}.`,
        shown.unnamed && src.names
          ? `${shown.unnamed} team ${shown.unnamed === 1 ? "id is" : "ids are"} not in ${src.names.schema}.${src.names.table} and ${shown.unnamed === 1 ? "reads" : "read"} as the id.`
          : "",
      ].filter(Boolean)
    : [];
  const failure = error ?? seasonsError?.message ?? null;
  const chartHref = activeSeason ? ratingsChartHref(src, activeSeason) : null;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Ratings</h1>
      </div>
      <p className="mb-6 max-w-[70ch] font-inter text-sm text-muted-foreground">
        The published ratings and impact models, one league and season at a time: every row as the model wrote it,
        ordered by its headline rating. Ranks are the producer&apos;s own.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {Object.entries(RATINGS).map(([key, s]) => (
          <button
            key={key}
            onClick={() => {
              setLeague(key);
              if (key !== league) setPin(null); // another league's ids
            }}
            aria-pressed={key === league}
            className={`rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors ${
              key === league ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {s.label}
          </button>
        ))}
        <select
          aria-label="Season"
          value={activeSeason}
          onChange={(e) => setSeason(e.target.value)}
          disabled={!seasons?.length}
          className={selectClass}
        >
          {seasons?.length ? null : <option value="">Season…</option>}
          {(seasons ?? []).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        {chartHref && src.chart ? (
          <Link
            href={chartHref}
            data-testid="ratings-chart"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-inter text-sm hover:bg-muted"
          >
            <ChartScatter className="h-4 w-4" aria-hidden="true" /> Chart this
            <span className="sr-only">
              : {src.chart.y} vs {src.chart.x} in Scatter
            </span>
          </Link>
        ) : null}
      </div>

      <p data-testid="ratings-span" className="mb-1 min-h-4 font-mono text-xs text-muted-foreground">
        {busy ? "" : span}
      </p>
      <p data-testid="ratings-note" role="status" className="mb-3 min-h-5 font-inter text-sm text-muted-foreground">
        {busy && activeSeason ? `Loading ${src.label} ${activeSeason}…` : notes.join(" ")}
      </p>

      {failure ? (
        <div data-testid="ratings-error" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {failure}
        </div>
      ) : null}

      {shown && shown.rows.length ? (
        // Mounted per read (`shown` is keyed to it), so each opens on the board's order.
        <ResultsGrid columns={[...src.select]} rows={gridRows} types={types} initialView={initialGrid} onViewChange={onGridView} />
      ) : null}
    </>
  );
}
