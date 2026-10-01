"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { useTheme } from "next-themes";
import { Download, Shuffle, Table2, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { SCATTER_SOURCES, sourceKey, type ScatterSource } from "@content/scatter";
import { scatterViewParams, type ScatterView } from "@lib/platform/viewState";
import { API_MAX_ROWS, loadSequencer } from "@lib/platform/wp";
import { apiRows, seasonRange, teamNameRows } from "@lib/platform/queryRun";
import { addTeam, formatValue, pickSlots, removeTeam, type TrendPicks } from "@lib/platform/trends";
import { ALL_PAIRS_CAP, chartVar } from "@lib/platform/chartTokens";
import {
  exportFilename,
  filledColumns,
  highlightOptions,
  highlightSlots,
  joinNames,
  missingNote,
  numericColumns,
  pickRandomAxes,
  scatterAxes,
  scatterExportText,
  scatterPoints,
  suggest,
  type ScatterPoint,
} from "@lib/platform/viz/scatterMath";
import { buildAtlas } from "@lib/platform/spriteAtlas";
import { CELL, FACE, FACE_CAP, espnIds, roundAtlas, spriteEntries, type Sprites, type Xwalk } from "@lib/platform/viz/sprites";
import ScatterCanvas, { type ScatterExport } from "@components/platform/viz/ScatterCanvas";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Scatter anything: any two numeric columns of a curated Data API table
 * (content/scatter.ts), one mark per player or team for one season, on a
 * canvas with a median crosshair. One `/api/platform/query/run` read per
 * (source, season), plus a team-name read where the source has only ids, and
 * one read of the Data API's freshness per session for the PNG export.
 * In face mode (`marks=face`), one round atlas of ESPN headshots (or logos)
 * per (source, season, and theme for logos), built in the browser from
 * `a.espncdn.com` (CORS `*`: the canvas stays untainted) and kept for the
 * session; a source whose ids are not ESPN's reads its crosswalk first.
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

/** The faces (or logos) for one view: the crosswalk where the source needs
 *  one, then each plotted mark's image through the combiner (48 px), 16 at a
 *  time, into one round atlas at the device's pixel ratio. A mark with no
 *  ESPN id fires no request; an image that fails is counted and its mark
 *  stays a dot. */
type Atlas = Sprites & { xwalk: Xwalk[] | null; failed: number; total: number };
async function loadAtlas(src: ScatterSource, points: readonly ScatterPoint[], dark: boolean): Promise<Atlas> {
  let xwalk: Xwalk[] | null = null;
  if (src.xwalk) {
    const { schema, key } = src.xwalk;
    // The crosswalk holds the newest season(s) only (nba: 2026 alone on
    // 2026-10-01) and a player's ids never change, so it is read whole,
    // newest first, rather than for the viewed season (which would match
    // nothing for an earlier one).
    const pairs = await apiRows({ schema, table: "player_crosswalk", select: `${key},espn_athlete_id`, order: "-season", limit: "5000" });
    xwalk = pairs.flatMap((r) => (r[key] != null && r.espn_athlete_id != null ? [{ key: String(r[key]), value: String(r.espn_athlete_id) }] : []));
  }
  const entries = spriteEntries(src, espnIds(src, points, "id", xwalk), dark);
  const round = roundAtlas(await buildAtlas(entries, CELL), FACE * (window.devicePixelRatio || 1));
  return { ...round, xwalk, failed: entries.length - Object.keys(round.frames).length, total: entries.length };
}

/** `/v1/meta`'s `datasets`: when each "schema.table" last changed. */
const metaFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { datasets?: Record<string, string> }).datasets ?? {};
};

const catalogFetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
  return (body as { tables: Record<string, Record<string, string>> }).tables;
};

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
  // Highlight chips by colour slot (a removed chip leaves a gap), the combobox
  // text, its open state and pending option, and the chip a full set refused.
  const [hl, setHl] = useState<TrendPicks>(initial.hl);
  const [marks, setMarks] = useState<ScatterView["marks"]>(initial.marks);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A source or season switch abandons an in-flight read: only the newest may land.
  const [runs] = useState(loadSequencer);

  const { data: catalog, error: catalogError } = useSWR(`/api/platform/query/tables?schema=${src.schema}`, catalogFetcher);
  const { data: seasons, error: seasonsError } = useSWR(["scatter-seasons", key], () => seasonRange(src, src.seasonCol));
  // The export's "data as of": held from the first render, so an export never waits on it.
  // ponytail: read once per session, so a tab left open across a nightly ingest
  // can stamp a "data as of" older than the rows it plotted; revalidate on a
  // season (or source) switch if that matters.
  const { data: changed } = useSWRImmutable("/api/platform/query/meta", metaFetcher);
  const chart = useRef<ScatterExport>(null);
  const activeSeason = seasons?.length ? (seasons.includes(season) ? season : seasons[0]) : "";
  const loadKey = `${key}|${activeSeason}`;
  const shown = loaded?.key === loadKey ? loaded : null;
  const faceNoun = src.noun === "teams" ? "logos" : "faces";

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
          names ? teamNameRows(names, activeSeason) : null,
        ]);
        if (!runs.isLatest(ticket)) return;
        // joinNames asserts both key types before anything is matched.
        const joined = names && nameRows ? joinNames(rows, nameRows, names) : { rows, unnamed: 0, left: 0, unlisted: false };
        setLoaded({ key: loadKey, ...joined });
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

  const view = { schema: src.schema, table: src.table, season: activeSeason || season, x: ax.x, y: ax.y, hl, marks };
  const viewParams = scatterViewParams(view);
  useUrlMirror(viewParams);

  const q = filter.trim().toLowerCase();
  const rail = byLetter(axes.filter((c) => c.toLowerCase().includes(q)));
  const points = useMemo(() => plotted?.points ?? [], [plotted]);
  // Faces: one atlas per (source, season) read, per theme for logos (which
  // have a dark variant), built from the PLOTTED marks (at most FACE_CAP: past
  // it the Faces option is off and the marks stay dots) and kept for the
  // session, so a highlight, zoom or theme switch never reloads.
  const { resolvedTheme } = useTheme();
  const atlases = useRef(new Map<string, Promise<Atlas>>());
  const [atlas, setAtlas] = useState<{ key: string; a: Atlas } | null>(null);
  // A failed build, for its key alone: a switch to Dots or another view drops it.
  const [atlasError, setAtlasError] = useState<{ key: string; text: string } | null>(null);
  const overCap = points.length > FACE_CAP;
  const atlasKey = marks === "face" && !overCap && points.length && resolvedTheme ? `${loadKey}|${src.noun === "teams" ? resolvedTheme : ""}` : null;

  useEffect(() => {
    if (!atlasKey) return;
    let live = true;
    let p = atlases.current.get(atlasKey);
    if (!p) {
      p = loadAtlas(src, points, resolvedTheme === "dark");
      atlases.current.set(atlasKey, p);
    }
    p.then(
      (a) => {
        if (live) setAtlas({ key: atlasKey, a });
      },
      (e) => {
        atlases.current.delete(atlasKey); // the next switch to it tries again
        if (live) setAtlasError({ key: atlasKey, text: `${faceNoun} unavailable: ${e instanceof Error ? e.message : String(e)}` });
      }
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one build per key
  }, [atlasKey]);

  // The atlas for the view, with each plotted mark's id into it (recomputed
  // per axis switch from the loaded crosswalk: no request).
  const ready = atlas?.key === atlasKey ? atlas.a : null;
  const sprites = useMemo(() => (ready ? { canvas: ready.canvas, frames: ready.frames, ids: espnIds(src, points, "id", ready.xwalk) } : null), [ready, src, points]);
  const noId = sprites ? sprites.ids.filter((id) => id == null).length : 0;
  const noun = src.noun;
  const options = useMemo(() => highlightOptions(points), [points]);
  const slots = useMemo(() => highlightSlots(points, hl), [points, hl]);
  const suggestions = open ? suggest(options, query, hl) : [];
  const pending = Math.min(active, suggestions.length - 1);
  const chips = pickSlots(hl);
  const others = slots ? slots.filter((s) => s < 0).length : points.length;
  const addChip = (text: string) => {
    const r = addTeam(hl, text, ALL_PAIRS_CAP);
    if (r.refused) setRefused(text);
    else {
      setHl(r.teams);
      setRefused(null);
    }
    setQuery("");
    setOpen(false);
    setActive(0);
  };
  const removeChip = (chip: string) => {
    setHl(removeTeam(hl, chip));
    setRefused(null);
  };
  const onComboKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.max(0, Math.min(suggestions.length - 1, pending + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && suggestions[pending]) {
      e.preventDefault();
      addChip(suggestions[pending].text);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) setOpen(false);
      else setQuery("");
    }
  };
  const notes = shown
    ? [
        refused ? `${ALL_PAIRS_CAP} highlights at most, one per colour. Remove one to add ${refused}.` : "",
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
        overCap
          ? `${faceNoun[0].toUpperCase()}${faceNoun.slice(1)} are available up to ${FACE_CAP.toLocaleString("en-US")} marks (this view has ${points.length.toLocaleString("en-US")}).`
          : "",
        atlasError?.key === atlasKey ? atlasError.text : atlasKey && !ready ? `Loading ${faceNoun}…` : "",
        noId ? `${noId.toLocaleString("en-US")} ${noun} have no ESPN id and stay dots.` : "",
        ready?.failed ? `${faceNoun} unavailable: ${ready.failed} of ${ready.total} images failed.` : "",
      ].filter(Boolean)
    : [];
  const failure = error ?? catalogError?.message ?? seasonsError?.message ?? null;

  /** The chart as it stands, titled like the page, with the view's link and
   *  its data's freshness, from what the page already holds: no request. */
  async function exportPng() {
    const c = chart.current;
    if (!c || !points.length) return;
    try {
      const text = scatterExportText(view, { label: src.label, query: viewParams.toString(), asOf: changed?.[key], zoomed: c.zoomed() });
      const url = URL.createObjectURL(await c.png(text));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(view);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
        {/* ARIA 1.2 combobox: the listbox is suggestions only; a chip is added
            by Enter on the pending option or a click, never by arrowing. */}
        <div className="relative w-full sm:w-64">
          <input
            role="combobox"
            aria-label={`Highlight a ${noun === "players" ? "player or team" : "team"} (up to ${ALL_PAIRS_CAP})`}
            aria-expanded={suggestions.length > 0}
            aria-controls="scatter-hl-list"
            aria-autocomplete="list"
            aria-activedescendant={suggestions[pending] ? `scatter-hl-opt-${pending}` : undefined}
            value={query}
            placeholder="Highlight a name or team…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onKeyDown={onComboKey}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className={`${selectClass} w-full`}
          />
          <ul
            id="scatter-hl-list"
            role="listbox"
            aria-label="Highlight suggestions"
            hidden={!suggestions.length}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card py-1 font-inter text-sm shadow-md"
          >
            {suggestions.map((o, i) => (
              <li
                key={o.text}
                id={`scatter-hl-opt-${i}`}
                role="option"
                aria-selected={i === pending}
                // keep focus in the input, so the click lands before blur closes the list
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(o.text)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1 ${i === pending ? "bg-muted" : ""}`}
              >
                <span className="truncate text-foreground">{o.text}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{o.n.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = pickRandomAxes(axes, ax);
            if (next) setPick(next);
          }}
          disabled={axes.length < 3}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-inter text-sm hover:bg-muted disabled:opacity-50"
        >
          <Shuffle className="h-4 w-4" aria-hidden="true" /> Random axes
        </button>
        {/* no marks while a read is in flight (`shown` is keyed to it) or with no plot */}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportPng} disabled={!points.length}>
          <Download />
          Export PNG
        </Button>
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
              {/* The legend: each chip in its slot colour (text stays ink) with
                  the marks drawn in that colour (a mark matching two chips counts
                  once, for the earlier), then the faded rest. A chip matching no
                  mark stays, at 0, so it can be removed. */}
              {chips.length ? (
                <ul data-testid="scatter-legend" aria-label="Highlights" className="mb-2 flex flex-wrap items-center gap-2 font-inter text-xs">
                  {chips.map(({ team: chip, slot }) => {
                    const n = slots ? slots.filter((s) => s === hl.indexOf(chip)).length : 0;
                    return (
                      <li key={chip} data-chip={chip} data-slot={slot} data-count={n} className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-2 pr-0.5">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: chartVar(slot) }} />
                        <span className="text-foreground">{chip}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {n.toLocaleString("en-US")}
                          <span className="sr-only"> {noun}</span>
                        </span>
                        <button type="button" aria-label={`Remove ${chip}`} onClick={() => removeChip(chip)} className="rounded-full p-1 hover:bg-muted">
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                  <li data-others data-count={others} className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-muted-foreground/15" />
                    Others {others.toLocaleString("en-US")}
                  </li>
                </ul>
              ) : null}
              <ScatterCanvas
                ref={chart}
                points={points}
                xLabel={ax.x}
                yLabel={ax.y}
                slots={slots}
                marks={marks}
                sprites={sprites}
                onMarks={setMarks}
                faceLabel={src.noun === "teams" ? "Logos" : "Faces"}
                facesOff={overCap}
              />
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
