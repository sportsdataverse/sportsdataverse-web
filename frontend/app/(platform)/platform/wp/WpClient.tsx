"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { LineChart } from "lucide-react";
import { Button } from "@components/ui/button";
import { WP_SPORTS } from "@content/wp";
import type { WpSport } from "@content/wp";
import type { ReleaseAssetSummary } from "@lib/platform/github";

/**
 * CFBD-style win-probability charts: sport → season → game → home-WP line
 * over the play sequence, with the play log underneath. Same in-browser
 * DuckDB engine + range proxy as Explore/Lookups.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

type GameOption = { id: string; label: string };
type WpPoint = { x: number; wp: number; period: number; clock: string; text: string; score: string };

function proxyUrl(sport: WpSport, asset: string): string {
  return `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}&asset=${encodeURIComponent(asset)}`;
}

function q(col: string): string {
  return `"${col.replace(/"/g, '""')}"`;
}

const assetsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

function WpChart({ points, home, away }: { points: WpPoint[]; home: string; away: string }) {
  const W = 820;
  const H = 280;
  const pad = { l: 44, r: 12, t: 16, b: 24 };
  const n = points.length;
  if (n < 2) return null;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);
  const y = (wp: number) => pad.t + (1 - wp) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.wp).toFixed(1)}`).join(" ");
  // Period boundaries: first index of each period after the first.
  const boundaries: { i: number; period: number }[] = [];
  for (let i = 1; i < n; i++) {
    if (points[i].period !== points[i - 1].period) boundaries.push({ i, period: points[i].period });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Win probability chart, ${away} at ${home}`}>
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
      <text x={pad.l} y={pad.t - 4} className="fill-current font-inter text-[11px] text-muted-foreground">
        {home} win probability
      </text>
    </svg>
  );
}

export default function WpClient() {
  const [sportKey, setSportKey] = useState(WP_SPORTS[0].key);
  const [season, setSeason] = useState("");
  const [games, setGames] = useState<GameOption[]>([]);
  const [gameId, setGameId] = useState("");
  const [points, setPoints] = useState<WpPoint[]>([]);
  const [teams, setTeams] = useState<{ home: string; away: string }>({ home: "", away: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sport = useMemo(
    () => WP_SPORTS.find((s) => s.key === sportKey) ?? WP_SPORTS[0],
    [sportKey]
  );

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

  function resetForSport(key: string) {
    setSportKey(key);
    setSeason("");
    setGames([]);
    setGameId("");
    setPoints([]);
    setError(null);
  }

  async function loadGames(asset: string) {
    setSeason(asset);
    setGames([]);
    setGameId("");
    setPoints([]);
    const { runQuery } = await import("@lib/platform/duckdb");
    setBusy("Loading games…");
    setError(null);
    try {
      const c = sport.cols;
      const src = `read_parquet('${proxyUrl(sport, asset)}')`;
      const weekSel = c.week ? `any_value(${q(c.week)})` : "NULL";
      const res = await runQuery(
        `SELECT CAST(${q(c.gameId)} AS VARCHAR) AS id, any_value(${q(c.homeName)}) AS home, any_value(${q(c.awayName)}) AS away, ${weekSel} AS week FROM ${src} GROUP BY 1 ORDER BY week NULLS LAST, home`,
        3000
      );
      const idx = (name: string) => res.columns.indexOf(name);
      setGames(
        res.rows.map((r) => ({
          id: r[idx("id")] ?? "",
          label: `${r[idx("week")] != null ? `W${r[idx("week")]} · ` : ""}${r[idx("away")]} @ ${r[idx("home")]}`,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadGame(id: string) {
    setGameId(id);
    setPoints([]);
    const { runQuery } = await import("@lib/platform/duckdb");
    setBusy("Loading game…");
    setError(null);
    try {
      const c = sport.cols;
      const src = `read_parquet('${proxyUrl(sport, season)}')`;
      const clockSel = c.clock ? q(c.clock) : "''";
      const scoreSel =
        c.homeScore && c.awayScore ? `${q(c.awayScore)} || '-' || ${q(c.homeScore)}` : "''";
      const res = await runQuery(
        `SELECT ${q(c.order)} AS x, ${q(c.wp)} AS wp, ${q(c.period)} AS period, ${clockSel} AS clock, CAST(${q(c.text)} AS VARCHAR) AS text, ${scoreSel} AS score
         FROM ${src}
         WHERE CAST(${q(c.gameId)} AS VARCHAR) = '${id.replace(/'/g, "''")}' AND ${q(c.wp)} IS NOT NULL
         ORDER BY x`,
        5000
      );
      const idx = (name: string) => res.columns.indexOf(name);
      setPoints(
        res.rows.map((r) => ({
          x: Number(r[idx("x")]),
          wp: Math.max(0, Math.min(1, Number(r[idx("wp")]))),
          period: Number(r[idx("period")]) || 1,
          clock: r[idx("clock")] ?? "",
          text: r[idx("text")] ?? "",
          score: r[idx("score")] ?? "",
        }))
      );
      const game = games.find((g) => g.id === id);
      const [away, home] = game ? game.label.replace(/^W\S+ · /, "").split(" @ ") : ["", ""];
      setTeams({ home: home ?? "", away: away ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
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
          onChange={(e) => (e.target.value ? void loadGames(e.target.value) : setSeason(""))}
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
            onChange={(e) => (e.target.value ? void loadGame(e.target.value) : setGameId(""))}
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

      {points.length > 1 ? (
        <>
          <div className="mb-6 rounded-lg border border-border bg-card/70 p-4">
            <WpChart points={points} home={teams.home} away={teams.away} />
          </div>
          <h3 className="mb-2 font-barlow text-lg font-semibold">Play log</h3>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
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
                  <tr key={i} className="border-t border-border">
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
          <LineChart className="mr-1 inline h-4 w-4" /> No win-probability data for this game.
        </p>
      ) : null}
    </>
  );
}
