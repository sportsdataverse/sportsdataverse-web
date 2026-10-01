"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { SHOTS_LEAGUE_KEYS, SHOTS_LEAGUES, type ShotsLeague } from "@content/shots";
import { SHOTS_MIN_N, SHOTS_MODES, shotsViewParams, type ShotsView } from "@lib/platform/viewState";
import { API_MAX_ROWS } from "@lib/platform/wp";
import { apiRows, seasonRange } from "@lib/platform/queryRun";
import { normalizeShot, type Shot } from "@lib/platform/viz/surfaces";
import { HEX_RADIUS, hexbin, onSurface, type CurveRow } from "@lib/platform/viz/hexbin";
import { butterfly, byDistance, DIST_STEP, SMOOTH_SIGMA, smoothBins, zoneStats } from "@lib/platform/viz/shotStats";
import ShotMap from "@components/platform/viz/ShotMap";
import DistanceCurves from "@components/platform/viz/DistanceCurves";
import SideButterfly from "@components/platform/viz/SideButterfly";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Shot chart: one player-season's shots (content/shots.ts: one
 * `/api/platform/query/run` read, well under the API's 50,000-row cap) as
 * hexagons on a true-unit court or rink. Four reads per view, each cached
 * by SWR on its key: the league's season range, the season's roster (the
 * player picker), the player's shots, and — for a hoops league with a
 * `curves` schema (content/shots.ts) — the season's F4 league FG% by
 * distance, one read per league-season, which colours each hexagon
 * against the league at its distance. A shot off the drawn surface (a
 * backcourt heave, a sentinel coordinate) is dropped before binning and
 * counted in the note; a read that hits the API's row cap says so; a
 * season without a league curve (no producer, no rows, a failed read)
 * keeps the plain FG% ramp and says so.
 *
 * Modes (`mode=` in the URL): raw draws the hexagons as binned; smoothed
 * recolours the SAME hexagons by `smoothBins` (an attempt-weighted
 * Gaussian over the lattice, σ SMOOTH_SIGMA feet — smoothed before the
 * min-n filter, so a hidden bin still informs its neighbours); zones draws
 * the surface's zone partition (`zoneStats`) instead, the min-n slider
 * idle. Under the map, the by-distance curves and the left/right butterfly
 * (`byDistance`, `butterfly` on the same drawn shots) share one hovered
 * distance with it: a hex hands its distance bin to both companions, a
 * companion's bin draws a band on the map at that distance.
 */

type Player = { id: string; name: string };

/** The season's roster as id → name, A–Z, one entry per id (a trade or a
 *  transfer lists a player twice; the NHL table is per game), and how many
 *  rows the read returned (at API_MAX_ROWS it was cut). Ids are kept as
 *  strings, the URL's type, on both sides of the map. */
async function loadRoster(lg: ShotsLeague, season: string): Promise<{ players: Player[]; rows: number }> {
  const { roster } = lg;
  const rows = await apiRows({
    ...roster.params,
    schema: roster.schema,
    table: roster.table,
    season,
    select: [roster.idCol, ...roster.nameCols].join(","),
    limit: API_MAX_ROWS,
  });
  const byId = new Map<string, string>();
  for (const r of rows) {
    const id = r[roster.idCol];
    if (id == null || byId.has(String(id))) continue;
    byId.set(String(id), roster.nameCols.map((c) => String(r[c] ?? "")).join(" ").trim() || String(id));
  }
  return { players: [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), rows: rows.length };
}

/** The player-season's rows, normalized: a row that is not a shot (a free throw, a faceoff) is dropped. */
async function loadShots(lg: ShotsLeague, season: string, player: string): Promise<Shot[]> {
  const rows = await apiRows({ schema: lg.schema, table: lg.table, [lg.seasonCol]: season, [lg.playerCol]: player, select: lg.select.join(","), limit: API_MAX_ROWS });
  return rows.flatMap((r) => normalizeShot(lg.source, r) ?? []);
}

/** The league's FG% by distance for the season: the F4 `fg_pct_by_shot_distance`
 *  league rows (37 buckets), or null when the season has none. */
async function loadCurve([, schema, season]: readonly [string, string, string]): Promise<CurveRow[] | null> {
  const rows = await apiRows({ schema, table: "metric_curves", season, entity_type: "league", metric: "fg_pct_by_shot_distance", select: "x_lo,x_hi,rate", order: "x_lo", limit: "100" });
  return rows.length ? rows.map((r) => ({ x_lo: Number(r.x_lo), x_hi: r.x_hi == null ? Number.POSITIVE_INFINITY : Number(r.x_hi), rate: Number(r.rate) })) : null;
}

const selectClass = "rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm";
const modeClass = "rounded-md border border-border px-3 py-1.5 font-inter text-sm hover:bg-muted aria-pressed:bg-muted aria-pressed:font-semibold";
const MODE_LABEL: Record<ShotsView["mode"], string> = { raw: "Raw", smoothed: "Smoothed", zones: "Zones" };
const n = (x: number) => x.toLocaleString("en-US");

export default function ShotsClient({ initial }: { initial: ShotsView }) {
  const [league, setLeague] = useState(initial.league);
  const [season, setSeason] = useState(initial.season);
  const [player, setPlayer] = useState(initial.player);
  const [minN, setMinN] = useState(initial.minN);
  const [mode, setMode] = useState(initial.mode);
  // the one hovered distance bin (its lower edge, feet) the map, the curves and the butterfly share
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const lg = SHOTS_LEAGUES[league];

  const { data: seasons, error: seasonsError } = useSWR(["shots-seasons", league], () => seasonRange(lg, lg.seasonCol));
  const activeSeason = seasons?.length ? (seasons.includes(season) ? season : seasons[0]) : "";
  const { data: rosterRead, error: rosterError } = useSWR(activeSeason ? ["shots-roster", league, activeSeason] : null, () => loadRoster(lg, activeSeason));
  const roster = rosterRead?.players;
  // The URL's player is kept even off the roster (an id the picker cannot list still reads its shots); blank picks the first listed.
  const activePlayer = player || roster?.[0]?.id || "";
  const { data: shots, error: shotsError, isLoading } = useSWR(
    activeSeason && activePlayer ? ["shots", league, activeSeason, activePlayer] : null,
    () => loadShots(lg, activeSeason, activePlayer)
  );
  // the league baseline, keyed by the CURVES schema: the ESPN and Stats feeds of one league share the read
  const { data: curveRead, isLoading: curveLoading } = useSWR(lg.curves && activeSeason ? (["shots-curve", lg.curves, activeSeason] as const) : null, loadCurve, {
    // a failed baseline read is the designed fallback (sequential + note), not something to retry
    shouldRetryOnError: false,
  });
  // undefined (no read, a failed read) and null (no rows) alike: no baseline
  const curve = curveRead ?? null;
  const noBaseline = lg.made === "FG" && !curveLoading && !curve;

  // only shots on the drawn surface are binned: one off it would bin off the viewBox (unseen, counted, shrinking every hex)
  const drawn = useMemo(() => (shots ? shots.filter((s) => onSurface(s, lg.surface.kind)) : []), [shots, lg]);
  const omitted = shots ? shots.length - drawn.length : 0;
  const bins = useMemo(() => hexbin(drawn, HEX_RADIUS[lg.surface.kind]), [drawn, lg]);
  // smoothed over EVERY bin, then the min-n filter: a hidden bin still informs its neighbours
  const coloured = useMemo(() => (mode === "smoothed" ? smoothBins(bins, SMOOTH_SIGMA[lg.surface.kind]) : bins), [bins, mode, lg]);
  const shown = useMemo(() => coloured.filter((b) => b.n >= minN), [coloured, minN]);
  const zones = useMemo(() => (mode === "zones" ? zoneStats(drawn, lg.surface) : []), [drawn, mode, lg]);
  const step = DIST_STEP[lg.surface.kind];
  const dist = useMemo(() => byDistance(drawn, step), [drawn, step]);
  const sides = useMemo(() => butterfly(drawn, step), [drawn, step]);
  const made = drawn.filter((s) => s.made).length;
  const name = roster?.find((p) => p.id === activePlayer)?.name ?? activePlayer;

  useUrlMirror(shotsViewParams({ league, season: activeSeason || season, player: activePlayer, mode, minN }));

  const failure = seasonsError?.message ?? rosterError?.message ?? shotsError?.message ?? null;
  const cap = Number(API_MAX_ROWS);
  const note = isLoading || curveLoading
    ? `Loading ${name || "shots"} ${activeSeason}…`
    : [
        shots
          ? drawn.length
            ? `${n(drawn.length)} shots · ${n(made)} ${lg.made === "FG" ? "made" : "goals"} (${Math.round((100 * made) / drawn.length)}%) · ${
                mode === "zones" ? `${zones.length} zones` : `${n(bins.length)} hexagons, ${n(shown.length)} shown at ${minN}+ shots${mode === "smoothed" ? ` · smoothed, σ ${SMOOTH_SIGMA[lg.surface.kind]} ft` : ""}`
              }`
            : `No shots for ${name} in ${activeSeason}.`
          : roster && !roster.length
            ? `No roster for ${activeSeason}.`
            : "",
        omitted ? `${n(omitted)} ${omitted === 1 ? "shot" : "shots"} off the ${lg.surface.kind} omitted` : "",
        noBaseline && activeSeason ? `no league baseline for ${lg.label} ${activeSeason}` : "",
        shots && shots.length >= cap ? `shots truncated at ${n(cap)} rows` : "",
        rosterRead && rosterRead.rows >= cap ? `roster read truncated at ${n(cap)} rows (a per-game table): some players may be missing from the picker` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Shots</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        One player&apos;s shots for a season, binned into hexagons on a true-unit court or rink: size is volume, colour is
        efficiency. Hover a hexagon for its numbers.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <select
          aria-label="League"
          value={league}
          onChange={(e) => {
            setLeague(e.target.value);
            setPlayer("");
          }}
          className={selectClass}
        >
          {SHOTS_LEAGUE_KEYS.map((k) => (
            <option key={k} value={k}>
              {SHOTS_LEAGUES[k].label}
            </option>
          ))}
        </select>
        <select aria-label="Season" value={activeSeason} onChange={(e) => setSeason(e.target.value)} disabled={!seasons?.length} className={selectClass}>
          {seasons?.length ? null : <option value="">Season…</option>}
          {(seasons ?? []).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select aria-label="Player" value={activePlayer} onChange={(e) => setPlayer(e.target.value)} disabled={!roster?.length} className={`${selectClass} min-w-[14rem]`}>
          {roster?.length ? null : <option value="">Player…</option>}
          {activePlayer && roster && !roster.some((p) => p.id === activePlayer) ? <option value={activePlayer}>{activePlayer}</option> : null}
          {(roster ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Mode" data-testid="shots-mode" className="flex gap-1">
          {SHOTS_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={modeClass}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 font-inter text-sm">
          Min shots per hex
          <input
            type="range"
            min={SHOTS_MIN_N.min}
            max={SHOTS_MIN_N.max}
            value={minN}
            onChange={(e) => setMinN(Number(e.target.value))}
            disabled={mode === "zones"}
            className="accent-primary disabled:opacity-50"
          />
          <output data-testid="shots-min" className="w-6 font-mono text-xs tabular-nums">
            {minN === SHOTS_MIN_N.max ? `${minN}+` : minN}
          </output>
        </label>
      </div>

      <p data-testid="shots-note" role="status" className="mb-3 min-h-5 font-inter text-sm text-muted-foreground">
        {note}
      </p>

      {failure ? (
        <div data-testid="shots-error" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {failure}
        </div>
      ) : null}

      {activeSeason ? (
        <div className="max-w-2xl rounded-lg border border-border bg-card p-4">
          <h3 data-testid="shots-title" className="font-barlow text-lg font-semibold">
            {name || "Shots"} · {activeSeason}
          </h3>
          <p className="mb-2 font-inter text-xs text-muted-foreground">{lg.label}</p>
          <ShotMap bins={shown} all={bins} surface={lg.surface} kind={lg.made} curve={curve} mode={mode} zones={zones} hoverDistance={hoverDistance} onHoverDistance={setHoverDistance} />
          {drawn.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <DistanceCurves rows={dist} step={step} kind={lg.made} curve={curve} hover={hoverDistance} onHover={setHoverDistance} />
              <SideButterfly rows={sides} step={step} kind={lg.made} curve={curve} hover={hoverDistance} onHover={setHoverDistance} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
