"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { useTheme } from "next-themes";
import { LineChart } from "lucide-react";
import { WP_SPORTS } from "@content/wp";
import type { WpSport } from "@content/wp";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import { wpViewParams, type WpView } from "@lib/platform/viewState";
import type { TeamColors } from "@lib/platform/teamColor";
import { resolvePendingGame } from "@lib/platform/pendingGame";
import { revealInScroller } from "@lib/platform/scroll";
import {
  emptyWpMessage,
  fillSegments,
  gameOptionsFromSchedule,
  loadSequencer,
  pbpParams,
  scheduleParams,
  teamColorLookup,
  teamsParams,
  wpPointsFromRows,
  wpTeamColors,
  type GameOption,
  type WpPoint,
} from "@lib/platform/wp";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * CFBD-style win-probability charts: sport → season → game → home-WP line
 * over the play sequence, with the play log underneath. The season list is
 * the release's assets; the game list and one game's plays are two Data API
 * reads through the member-gated Query proxy, plus (CFB/NFL) one read of the
 * sport's team colour table per session.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

/** One `GET /v1/{schema}/{table}` through /api/platform/query/run, the
 *  Query page's call shape. */
async function apiRows(params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/platform/query/run?${new URLSearchParams(params)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { data: Record<string, unknown>[] }).data;
}

const assetsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

/** A team colour always has its name in text: one swatch + name per side.
 *  HTML, not SVG text, so it reads at phone width (the chart scales with its
 *  viewBox, which shrank an in-chart legend to ~5px); long names wrap. */
function WpLegend({ home, away, colors }: { home: string; away: string; colors: { home: string; away: string } }) {
  const sides = [
    { side: "home", name: home, color: colors.home, where: "above 50%" },
    { side: "away", name: away, color: colors.away, where: "below 50%" },
  ];
  return (
    <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 font-inter text-sm">
      {sides.map((l) => (
        <span key={l.side} className="flex items-center gap-2">
          {/* the fill's own paint: the colour at 25% over the card, 1px border */}
          <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true">
            <rect x={0.5} y={0.5} width={11} height={11} rx={2} fill={l.color} fillOpacity={0.25} stroke={l.color} />
          </svg>
          <span>
            {l.name} <span className="text-muted-foreground">· {l.side}, {l.where}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function WpChart({
  points,
  home,
  away,
  colors,
  hoverI,
  onHover,
}: {
  points: WpPoint[];
  home: string;
  away: string;
  /** Resolved team colours (`pickTeamColors`): fills only, never the line. */
  colors: { home: string; away: string };
  /** Linked hover: the play index highlighted in BOTH the chart and the log. */
  hoverI: number | null;
  onHover: (i: number | null) => void;
}) {
  const W = 820;
  const H = 280;
  const pad = { l: 44, r: 12, t: 16, b: 24 };
  const n = points.length;
  const svgRef = useRef<SVGSVGElement>(null);
  if (n < 2) return null;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);
  const y = (wp: number) => pad.t + (1 - wp) * (H - pad.t - pad.b);
  /** Pointer x (client px) → nearest play index, via the live CTM so the
   *  responsive viewBox scaling is accounted for. */
  function indexFromEvent(e: React.MouseEvent<SVGSVGElement>): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const t = (vx - pad.l) / (W - pad.l - pad.r);
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  }
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.wp).toFixed(1)}`).join(" ");
  // Period boundaries: first index of each period after the first.
  const boundaries: { i: number; period: number }[] = [];
  for (let i = 1; i < n; i++) {
    if (points[i].period !== points[i - 1].period) boundaries.push({ i, period: points[i].period });
  }
  return (
    <svg
      data-testid="wp-chart"
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${home} win probability by play, ${away} at ${home}`}
      onMouseMove={(e) => onHover(indexFromEvent(e))}
      onMouseLeave={() => onHover(null)}
    >
      {fillSegments(points).map((s, k) => (
        <polygon
          key={k}
          points={s.pts.map(([i, wp]) => `${x(i).toFixed(1)},${y(wp).toFixed(1)}`).join(" ")}
          fill={colors[s.side]}
          fillOpacity={0.25}
        />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeDasharray={tick === 0.5 ? "0" : "4 4"}
            strokeWidth={tick === 0.5 ? 1.5 : 1}
          />
          <text x={4} y={y(tick) + 4} className="fill-current font-inter text-[11px] text-muted-foreground">
            {Math.round(tick * 100)}%
          </text>
        </g>
      ))}
      {boundaries.map((b) => (
        <g key={b.i}>
          <line
            x1={x(b.i)}
            x2={x(b.i)}
            y1={pad.t}
            y2={H - pad.b}
            className="stroke-border"
            strokeDasharray="2 4"
          />
          <text x={x(b.i) + 3} y={H - pad.b + 14} className="fill-current font-inter text-[10px] text-muted-foreground">
            {b.period > 4 ? "OT" : `Q${b.period}`}
          </text>
        </g>
      ))}
      <polyline points={line} fill="none" strokeWidth={2} className="stroke-primary" />
      {hoverI != null && points[hoverI] ? (
        (() => {
          const p = points[hoverI];
          const hx = x(hoverI);
          const hy = y(p.wp);
          const boxW = 300;
          const bx = Math.min(Math.max(hx + 10, pad.l), W - pad.r - boxW);
          const above = hy > H / 2;
          const by = above ? hy - 74 : hy + 12;
          const play = p.text.length > 76 ? `${p.text.slice(0, 75)}…` : p.text;
          return (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={pad.t} y2={H - pad.b} className="stroke-score" strokeWidth={1} />
              <circle cx={hx} cy={hy} r={4} className="fill-score stroke-background" strokeWidth={1.5} />
              <rect x={bx} y={by} width={boxW} height={62} rx={6} className="fill-popover stroke-border" strokeWidth={1} />
              <text x={bx + 10} y={by + 17} className="fill-current font-inter text-[11px] font-semibold">
                {p.period > 4 ? "OT" : `Q${p.period}`} {p.clock} · {p.score} · {(p.wp * 100).toFixed(1)}% {home}
              </text>
              <text x={bx + 10} y={by + 34} className="fill-current font-inter text-[10px] text-muted-foreground">
                {play.slice(0, 48)}
              </text>
              <text x={bx + 10} y={by + 48} className="fill-current font-inter text-[10px] text-muted-foreground">
                {play.slice(48)}
              </text>
            </g>
          );
        })()
      ) : null}
    </svg>
  );
}

/** `play_by_play_2024.parquet` ↔ `2024` for the sport's asset prefix. */
function seasonAsset(sport: WpSport, year: string): string {
  return year ? `${sport.assetPrefix}${year}.parquet` : "";
}
function seasonYear(sport: WpSport, asset: string): string {
  return asset.slice(sport.assetPrefix.length).replace(".parquet", "");
}

export default function WpClient({ initial }: { initial: WpView }) {
  const initialSport = WP_SPORTS.find((s) => s.key === initial.sport) ?? WP_SPORTS[0];
  const [sportKey, setSportKey] = useState(initialSport.key);
  const [season, setSeason] = useState(seasonAsset(initialSport, initial.season));
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameId, setGameId] = useState("");
  // A shared link's game, held until its season's game list has loaded.
  const pendingGame = useRef(initial.game);
  // Games and plays loads share one sequence: a newer load of either kind (or
  // a sport change) supersedes whatever is in flight, so a late response
  // never lands under a newer pick.
  const [loads] = useState(loadSequencer);
  const [points, setPoints] = useState<WpPoint[]>([]);
  const [plays, setPlays] = useState(0);
  const [game, setGame] = useState<GameOption | null>(null);
  const { resolvedTheme } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const hoverFromChart = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Chart-driven hovers scroll the play log (never the page) to keep the
  // highlighted row visible; table-driven hovers must NOT scroll-jack the
  // user's own pointer.
  useEffect(() => {
    if (hoverI == null || !hoverFromChart.current) return;
    const log = logRef.current;
    const row = log?.querySelector<HTMLElement>(`[data-play="${hoverI}"]`);
    if (log && row) revealInScroller(log, row);
  }, [hoverI]);
  const [error, setError] = useState<string | null>(null);

  const sport = useMemo(
    () => WP_SPORTS.find((s) => s.key === sportKey) ?? WP_SPORTS[0],
    [sportKey]
  );

  // The team colour table isn't season-keyed: one read per sport, never revalidated.
  // A failed read caches an empty lookup (every team falls back to the default
  // colours), so switching away and back never tries that sport again.
  const { data: teamColors } = useSWRImmutable(
    season && sport.teams ? ["wp-teams", sport.key] : null,
    async () => {
      try {
        return teamColorLookup(await apiRows(teamsParams(sport)!), sport.teams!);
      } catch {
        return new Map<string, TeamColors>();
      }
    }
  );
  const colors = game ? wpTeamColors(game, teamColors, resolvedTheme) : null;

  const { data: assets } = useSWR(
    `/api/platform/datasets/assets?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}`,
    assetsFetcher
  );

  const seasons = useMemo(
    () =>
      (assets ?? [])
        .map((a) => a.name)
        .filter((name) => name.startsWith(sport.assetPrefix) && name.endsWith(".parquet"))
        .map((name) => ({
          asset: name,
          year: name.slice(sport.assetPrefix.length).replace(".parquet", ""),
        }))
        .sort((a, b) => b.year.localeCompare(a.year)),
    [assets, sport]
  );

  useUrlMirror(
    wpViewParams({ sport: sport.key, season: seasonYear(sport, season), game: gameId || pendingGame.current })
  );

  // Shared link: load its season once, then its game when the list arrives
  // (resolved synchronously inside loadGames, see resolvePendingGame). No
  // season in the link means no game will ever arrive to consume it either.
  useEffect(() => {
    if (season) void loadGames(season);
    else pendingGame.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, from the URL
  }, []);

  // Abandoning an in-flight load also clears its spinner: the stale load's own
  // `finally` no longer may.
  function abandonLoads() {
    loads.next();
    setBusy(null);
  }

  function resetForSport(key: string) {
    abandonLoads();
    setPlays(0);
    pendingGame.current = "";
    setSportKey(key);
    setSeason("");
    setGames([]);
    setGameId("");
    setPoints([]);
    setError(null);
  }

  async function loadGames(asset: string) {
    const ticket = loads.next();
    setSeason(asset);
    setGames([]);
    setGameId("");
    setPoints([]);
    setBusy("Loading games…");
    setError(null);
    const year = seasonYear(sport, asset);
    try {
      const rows = await apiRows(scheduleParams(sport, year));
      if (!loads.isLatest(ticket)) return;
      const gamesList = gameOptionsFromSchedule(rows, sport.schedule);
      setGames(gamesList);
      const { toLoad, nextPending } = resolvePendingGame(pendingGame.current, { games: gamesList });
      pendingGame.current = nextPending;
      if (toLoad) void loadGame(toLoad, gamesList, year);
    } catch (e) {
      if (!loads.isLatest(ticket)) return;
      setError(e instanceof Error ? e.message : String(e));
      pendingGame.current = resolvePendingGame(pendingGame.current, { failed: true }).nextPending;
    } finally {
      if (loads.isLatest(ticket)) setBusy(null);
    }
  }

  async function loadGame(id: string, list: GameOption[] = games, year = seasonYear(sport, season)) {
    const ticket = loads.next();
    setGameId(id);
    setPoints([]);
    setPlays(0);
    setBusy("Loading game…");
    setError(null);
    try {
      const rows = await apiRows(pbpParams(sport, year, id));
      if (!loads.isLatest(ticket)) return;
      setPlays(rows.length);
      setPoints(wpPointsFromRows(rows, sport.cols));
      setGame(list.find((g) => g.id === id) ?? null);
    } catch (e) {
      if (!loads.isLatest(ticket)) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (loads.isLatest(ticket)) setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Win probability</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Game win-probability charts from the model pbp releases — pick a sport, season,
        and game. Rendered from the home team&apos;s WP on every play.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {WP_SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => resetForSport(s.key)}
            className={`rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors ${
              s.key === sportKey
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {s.label}
          </button>
        ))}
        <select
          value={season}
          onChange={(e) => {
            // A manually picked season abandons any in-flight linked game —
            // game ids aren't unique across seasons, so a stale pending id
            // must never be re-applied against a different season's list.
            pendingGame.current = "";
            if (e.target.value) void loadGames(e.target.value);
            else {
              abandonLoads();
              setSeason("");
            }
          }}
          className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
        >
          <option value="">Season…</option>
          {seasons.map((s) => (
            <option key={s.asset} value={s.asset}>
              {s.year}
            </option>
          ))}
        </select>
        {games.length > 0 ? (
          <select
            value={gameId}
            onChange={(e) => {
              if (e.target.value) void loadGame(e.target.value);
              else {
                abandonLoads();
                setGameId("");
              }
            }}
            className="min-w-[20rem] rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
          >
            <option value="">Game… ({games.length})</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        ) : null}
        {busy ? <span className="font-inter text-sm text-muted-foreground">{busy}</span> : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {points.length > 1 && colors && game ? (
        <>
          {/* opaque card: pickTeamColors checks contrast against CARD, so the chart must sit on it */}
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <WpLegend home={game.home.name} away={game.away.name} colors={colors} />
            <WpChart
              points={points}
              home={game.home.name}
              away={game.away.name}
              colors={colors}
              hoverI={hoverI}
              onHover={(i) => {
                hoverFromChart.current = true;
                setHoverI(i);
              }}
            />
          </div>
          <h3 className="mb-2 font-barlow text-lg font-semibold">Play log</h3>
          <div ref={logRef} className="scrollbar-visible max-h-[28rem] max-w-full rounded-lg border border-border" onMouseLeave={() => setHoverI(null)}>
            <table className="w-full text-left font-inter text-sm">
              <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Clock</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Play</th>
                  <th className="px-3 py-2 text-right">Home WP</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr
                    key={i}
                    data-play={i}
                    onMouseEnter={() => {
                      hoverFromChart.current = false;
                      setHoverI(i);
                    }}
                    className={`border-t border-border transition-colors ${
                      hoverI === i ? "bg-score/20" : "hover:bg-muted/60"
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-1">{p.period > 4 ? "OT" : p.period}</td>
                    <td className="whitespace-nowrap px-3 py-1">{p.clock}</td>
                    <td className="whitespace-nowrap px-3 py-1">{p.score}</td>
                    <td className="max-w-[36rem] truncate px-3 py-1" title={p.text}>
                      {p.text}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1 text-right font-mono text-xs">
                      {(p.wp * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : gameId && !busy ? (
        <p className="font-inter text-sm text-muted-foreground">
          <LineChart className="mr-1 inline h-4 w-4" />{" "}
          {emptyWpMessage(plays, points.length, sport.label, seasonYear(sport, season))}
        </p>
      ) : null}
    </>
  );
}
