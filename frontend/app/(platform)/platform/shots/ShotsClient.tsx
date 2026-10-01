"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { SHOTS_LEAGUE_KEYS, SHOTS_LEAGUES, type ShotsLeague } from "@content/shots";
import { SHOTS_MIN_N, shotsViewParams, type ShotsView } from "@lib/platform/viewState";
import { API_MAX_ROWS } from "@lib/platform/wp";
import { apiRows, seasonRange } from "@lib/platform/queryRun";
import { normalizeShot, type Shot } from "@lib/platform/viz/surfaces";
import { HEX_RADIUS, hexbin } from "@lib/platform/viz/hexbin";
import ShotMap from "@components/platform/viz/ShotMap";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Shot chart: one player-season's shots (content/shots.ts: one
 * `/api/platform/query/run` read, well under the API's 50,000-row cap) as
 * hexagons on a true-unit court or rink. Three reads per view, each cached
 * by SWR on its key: the league's season range, the season's roster (the
 * player picker), the player's shots.
 */

type Player = { id: string; name: string };

/** The season's roster as id → name, A–Z, one entry per id (a trade or a
 *  transfer lists a player twice; the NHL table is per game). Ids are kept
 *  as strings, the URL's type, on both sides of the map. */
async function loadRoster(lg: ShotsLeague, season: string): Promise<Player[]> {
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
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The player-season's rows, normalized: a row that is not a shot (a free throw, a faceoff) is dropped. */
async function loadShots(lg: ShotsLeague, season: string, player: string): Promise<Shot[]> {
  const rows = await apiRows({ schema: lg.schema, table: lg.table, [lg.seasonCol]: season, [lg.playerCol]: player, select: lg.select.join(","), limit: API_MAX_ROWS });
  return rows.flatMap((r) => normalizeShot(lg.source, r) ?? []);
}

const selectClass = "rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm";
const n = (x: number) => x.toLocaleString("en-US");

export default function ShotsClient({ initial }: { initial: ShotsView }) {
  const [league, setLeague] = useState(initial.league);
  const [season, setSeason] = useState(initial.season);
  const [player, setPlayer] = useState(initial.player);
  const [minN, setMinN] = useState(initial.minN);
  const lg = SHOTS_LEAGUES[league];

  const { data: seasons, error: seasonsError } = useSWR(["shots-seasons", league], () => seasonRange(lg, lg.seasonCol));
  const activeSeason = seasons?.length ? (seasons.includes(season) ? season : seasons[0]) : "";
  const { data: roster, error: rosterError } = useSWR(activeSeason ? ["shots-roster", league, activeSeason] : null, () => loadRoster(lg, activeSeason));
  // The URL's player is kept even off the roster (an id the picker cannot list still reads its shots); blank picks the first listed.
  const activePlayer = player || roster?.[0]?.id || "";
  const { data: shots, error: shotsError, isLoading } = useSWR(
    activeSeason && activePlayer ? ["shots", league, activeSeason, activePlayer] : null,
    () => loadShots(lg, activeSeason, activePlayer)
  );

  const bins = useMemo(() => (shots ? hexbin(shots, HEX_RADIUS[lg.surface.kind]) : []), [shots, lg]);
  const shown = useMemo(() => bins.filter((b) => b.n >= minN), [bins, minN]);
  const made = shots?.filter((s) => s.made).length ?? 0;
  const name = roster?.find((p) => p.id === activePlayer)?.name ?? activePlayer;

  useUrlMirror(shotsViewParams({ league, season: activeSeason || season, player: activePlayer, mode: initial.mode, minN }));

  const failure = seasonsError?.message ?? rosterError?.message ?? shotsError?.message ?? null;
  const note = isLoading
    ? `Loading ${name || "shots"} ${activeSeason}…`
    : shots
      ? shots.length
        ? `${n(shots.length)} shots · ${n(made)} ${lg.made === "FG" ? "made" : "goals"} (${Math.round((100 * made) / shots.length)}%) · ${n(bins.length)} hexagons, ${n(shown.length)} shown at ${minN}+ shots`
        : `No shots for ${name} in ${activeSeason}.`
      : roster && !roster.length
        ? `No roster for ${activeSeason}.`
        : "";

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
        <label className="flex items-center gap-2 font-inter text-sm">
          Min shots per hex
          <input
            type="range"
            min={SHOTS_MIN_N.min}
            max={SHOTS_MIN_N.max}
            value={minN}
            onChange={(e) => setMinN(Number(e.target.value))}
            className="accent-primary"
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
          <ShotMap bins={shown} all={bins} surface={lg.surface} kind={lg.made} />
        </div>
      ) : null}
    </>
  );
}
