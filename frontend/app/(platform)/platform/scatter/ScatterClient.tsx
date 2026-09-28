"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Table2 } from "lucide-react";
import { SCATTER_SOURCES, sourceKey, type ScatterSource } from "@content/scatter";
import { scatterViewParams, type ScatterView } from "@lib/platform/viewState";
import { API_MAX_ROWS, loadSequencer } from "@lib/platform/wp";
import { apiRows } from "@lib/platform/queryRun";
import { formatValue, teamNameLookup } from "@lib/platform/trends";
import { filledColumns, keepListed, missingNote, numericColumns, scatterAxes, scatterPoints } from "@lib/platform/viz/scatterMath";
import ScatterCanvas from "@components/platform/viz/ScatterCanvas";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Scatter anything: any two numeric columns of a curated Data API table
 * (content/scatter.ts), one mark per player or team for one season, on a
 * canvas with a median crosshair. One `/api/platform/query/run` read per
 * (source, season), plus a team-name read where the source has only ids.
 */

type Row = Record<string, unknown>;
/** One (source, season) read, keyed so a switch never paints another's rows.
 *  `left`: rows outside `names.only` (non-D-I), left out; `unlisted`: the
 *  season has no such list, so nothing was left out. */
type Loaded = {
  key: string;
  rows: Row[];
  nameOf?: Map<number | string, string>;
  unnamed: number;
  left: number;
  unlisted: boolean;
};

const catalogFetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
  return (body as { tables: Record<string, Record<string, string>> }).tables;
};

/** Every season from the source's first to its latest (under its fixed
 *  filters), newest first: two one-row reads. */
async function seasonList(src: ScatterSource): Promise<string[]> {
  const edge = (order: string) =>
    apiRows({ ...src.filter, schema: src.schema, table: src.table, select: src.seasonCol, order, limit: "1" });
  const [first, last] = await Promise.all([edge(src.seasonCol), edge(`-${src.seasonCol}`)]);
  const [a, b] = [Number(first[0]?.[src.seasonCol]), Number(last[0]?.[src.seasonCol])];
  if (!Number.isInteger(a) || !Number.isInteger(b)) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => String(b - i));
}

/** Rail rows grouped by first letter, A–Z (no metric registry yet), then
 *  every `_rank` column under "Ranks" (numericColumns sorts them last). */
function byLetter(cols: readonly string[]): [string, string[]][] {
  const out = new Map<string, string[]>();
  for (const c of cols) {
    const k = /_rank$/.test(c) ? "Ranks" : /[a-z]/i.test(c[0]) ? c[0].toUpperCase() : "#";
    out.set(k, [...(out.get(k) ?? []), c]);
  }
  return [...out];
}

const selectClass = "rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm";

export default function ScatterClient({ initial }: { initial: ScatterView }) {
  const [key, setKey] = useState(sourceKey(initial));
  const src = SCATTER_SOURCES.find((s) => sourceKey(s) === key) ?? SCATTER_SOURCES[0];
  const [season, setSeason] = useState(initial.season);
  const [pick, setPick] = useState({ x: initial.x, y: initial.y });
  const [filter, setFilter] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A source or season switch abandons an in-flight read: only the newest may land.
  const [runs] = useState(loadSequencer);

  const { data: catalog, error: catalogError } = useSWR(`/api/platform/query/tables?schema=${src.schema}`, catalogFetcher);
  const { data: seasons, error: seasonsError } = useSWR(["scatter-seasons", key], () => seasonList(src));
  const activeSeason = seasons?.length ? (seasons.includes(season) ? season : seasons[0]) : "";
  const loadKey = `${key}|${activeSeason}`;
  const shown = loaded?.key === loadKey ? loaded : null;

  useEffect(() => {
    // The ticket first: a switch to a source whose seasons are still loading
    // abandons the in-flight read too, so it cannot set the busy or error state.
    const ticket = runs.next();
    if (!activeSeason) return;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const names = src.names;
        const [rows, nameRows] = await Promise.all([
          // the fixed filter first, so it can never override the scoped keys
          apiRows({ ...src.filter, schema: src.schema, table: src.table, [src.seasonCol]: activeSeason, limit: API_MAX_ROWS }),
          names
            ? apiRows({
                schema: names.schema,
                table: names.table,
                select: `${names.key},${names.name}`,
                ...(names.bySeason ? { season: activeSeason } : {}),
                limit: API_MAX_ROWS,
              })
            : null,
        ]);
        if (!runs.isLatest(ticket)) return;
        let nameOf: Map<number | string, string> | undefined;
        let [kept, unnamed, left, unlisted] = [rows, 0, 0, false];
        if (names && nameRows) {
          // teamNameLookup asserts both key types before anything is matched.
          nameOf = teamNameLookup([...new Set(rows.map((r) => r[names.col]).filter((v) => v != null))], nameRows, names);
          const known = new Set(nameRows.map((r) => r[names.key]));
          if (names.only) {
            const d1 = keepListed(rows, names.col, known);
            [kept, left, unlisted] = [d1.rows, d1.left, !d1.listed];
          }
          unnamed = new Set(kept.map((r) => r[names.col]).filter((v) => v != null && !known.has(v))).size;
        }
        setLoaded({ key: loadKey, rows: kept, nameOf, unnamed, left, unlisted });
      } catch (e) {
        if (runs.isLatest(ticket)) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (runs.isLatest(ticket)) setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one read per (source, season)
  }, [loadKey]);

  const numeric = useMemo(() => (catalog?.[src.table] ? numericColumns(catalog[src.table]) : []), [catalog, src]);
  // Once rows land, only the columns they fill (an nba_stats slice fills 75 of 201).
  const axes = useMemo(() => (shown ? filledColumns(numeric, shown.rows) : numeric), [numeric, shown]);
  const ax = axes.length ? scatterAxes(pick.x, pick.y, axes) : pick;
  const plotted = useMemo(
    () => (shown && ax.x && ax.y ? scatterPoints(shown.rows, src, ax.x, ax.y, shown.nameOf) : null),
    [shown, src, ax.x, ax.y]
  );
  const tableRows = useMemo(
    () => (showTable && plotted ? [...plotted.points].sort((a, b) => a.label.localeCompare(b.label)) : []),
    [showTable, plotted]
  );

  useUrlMirror(scatterViewParams({ schema: src.schema, table: src.table, season: activeSeason || season, x: ax.x, y: ax.y }));

  const q = filter.trim().toLowerCase();
  const rail = byLetter(axes.filter((c) => c.toLowerCase().includes(q)));
  const points = plotted?.points ?? [];
  const noun = src.noun;
  const notes = shown
    ? [
        shown.rows.length >= Number(API_MAX_ROWS)
          ? `The Data API stops at ${Number(API_MAX_ROWS).toLocaleString("en-US")} rows and this season reached it: some ${noun} are missing.`
          : "",
        shown.left ? `${shown.left.toLocaleString("en-US")} non-${src.names?.only} ${noun} left out.` : "",
        shown.unlisted ? `No ${src.names?.only} list for ${activeSeason}: every ${noun.replace(/s$/, "")} is shown.` : "",
        shown.rows.length ? "" : `No ${noun} in ${activeSeason}.`,
        plotted ? missingNote(noun, [[ax.x, plotted.missingX], [ax.y, plotted.missingY]]) : "",
        shown.unnamed && src.names
          ? `${shown.unnamed} team ${shown.unnamed === 1 ? "id is" : "ids are"} not in ${src.names.schema}.${src.names.table} and ${shown.unnamed === 1 ? "reads" : "read"} as the id.`
          : "",
      ].filter(Boolean)
    : [];
  const failure = error ?? catalogError?.message ?? seasonsError?.message ?? null;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Scatter</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Any two numeric columns of a curated table, one mark per player or team for one season. Pick X and Y from the rail;
        the dashed lines are the medians.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <select aria-label="Source" value={key} onChange={(e) => setKey(e.target.value)} className={`${selectClass} min-w-[16rem]`}>
          {SCATTER_SOURCES.map((s) => (
            <option key={sourceKey(s)} value={sourceKey(s)}>
              {s.label}
            </option>
          ))}
        </select>
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
      </div>

      <p data-testid="scatter-note" role="status" className="mb-3 min-h-5 font-inter text-sm text-muted-foreground">
        {busy && activeSeason ? `Loading ${src.label} ${activeSeason}…` : notes.join(" ")}
      </p>

      {failure ? (
        <div data-testid="scatter-error" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {failure}
        </div>
      ) : null}

      {/* Chart first, rail after it, in the DOM and on screen alike: stacked on
          a phone, the rail to the chart's right on a desktop. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <section className="min-w-0">
          {plotted && points.length ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 data-testid="scatter-title" className="font-barlow text-lg font-semibold">
                {ax.y} vs {ax.x} · {activeSeason}
              </h3>
              <p className="mb-2 font-inter text-xs text-muted-foreground">
                {points.length.toLocaleString("en-US")} {noun} · {src.label}
              </p>
              <p className="font-inter text-xs text-muted-foreground" aria-hidden="true">
                ↑ {ax.y}
              </p>
              <ScatterCanvas points={points} xLabel={ax.x} yLabel={ax.y} />
              <p className="text-right font-inter text-xs text-muted-foreground" aria-hidden="true">
                {ax.x} →
              </p>
              <button
                type="button"
                aria-expanded={showTable}
                onClick={() => setShowTable((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1 font-inter text-sm hover:bg-muted"
              >
                <Table2 className="h-4 w-4" /> Table
              </button>
              {showTable ? (
                <div className="mt-3 max-h-96 overflow-auto rounded-md border border-border">
                  <table data-testid="scatter-table" className="w-full font-inter text-sm">
                    <caption className="sr-only">
                      {ax.y} vs {ax.x}, {activeSeason}: every plotted {noun.replace(/s$/, "")}, A–Z
                    </caption>
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-1.5 font-medium">Name</th>
                        {src.teamCol ? <th scope="col" className="px-3 py-1.5 font-medium">Team</th> : null}
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">{ax.x}</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">{ax.y}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((p, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1">{p.label}</td>
                          {src.teamCol ? <td className="px-3 py-1 text-muted-foreground">{p.team}</td> : null}
                          <td className="px-3 py-1 text-right font-mono text-xs tabular-nums" data-value={p.x}>
                            {formatValue(p.x)}
                          </td>
                          <td className="px-3 py-1 text-right font-mono text-xs tabular-nums" data-value={p.y}>
                            {formatValue(p.y)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="min-w-0" aria-label="Axes">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${axes.length} columns`}
            aria-label="Filter columns"
            className={`${selectClass} mb-2 w-full`}
          />
          {/* X and Y radios share each row, so one fieldset labels both groups;
              each radio's own name says which axis it sets. */}
          <fieldset className="min-w-0">
            <legend className="sr-only">Axes: pick one X column and one Y column</legend>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-card lg:max-h-[36rem]">
              <div className="sticky top-0 z-10 grid grid-cols-[1fr_2rem_2rem] items-center bg-card px-3 py-1.5 font-inter text-xs font-medium text-muted-foreground">
                <span>Column</span>
                <span className="text-center">X</span>
                <span className="text-center">Y</span>
              </div>
              {rail.map(([letter, cols]) => (
                <div key={letter}>
                  <p className="px-3 pt-2 font-mono text-[11px] text-muted-foreground">{letter}</p>
                  {cols.map((c) => (
                    <div key={c} data-testid="scatter-rail-row" className="grid grid-cols-[1fr_2rem_2rem] items-center px-3 py-0.5 font-inter text-sm hover:bg-muted/60">
                      <span className="truncate" title={c}>
                        {c}
                      </span>
                      <input
                        type="radio"
                        name="scatter-x"
                        aria-label={`X: ${c}`}
                        checked={ax.x === c}
                        onChange={() => setPick({ x: c, y: ax.y })}
                        className="mx-auto accent-primary"
                      />
                      <input
                        type="radio"
                        name="scatter-y"
                        aria-label={`Y: ${c}`}
                        checked={ax.y === c}
                        onChange={() => setPick({ x: ax.x, y: c })}
                        className="mx-auto accent-primary"
                      />
                    </div>
                  ))}
                </div>
              ))}
              {rail.length ? null : <p className="px-3 py-2 font-inter text-sm text-muted-foreground">No column matches.</p>}
            </div>
          </fieldset>
        </aside>
      </div>
    </>
  );
}
