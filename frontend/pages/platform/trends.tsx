import { useEffect, useMemo, useState } from "react";
import type { GetServerSidePropsContext } from "next";
import useSWR from "swr";
import { TrendingUp } from "lucide-react";
import PlatformShell from "@components/platform/PlatformShell";
import { Button } from "@components/ui/button";
import { TREND_SPORTS } from "@content/trends";
import type { TrendSport } from "@content/trends";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import type { ReleaseAssetSummary } from "@lib/platform/github";

/**
 * SP+-Trends-style team trends: sport → team → stat → the metric charted
 * across every available season (2002/2003 → current). Long-format
 * team_season_stats releases queried in-browser via DuckDB + range proxy.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

type TrendPoint = { season: number; value: number; display: string };

function proxyUrl(sport: TrendSport, asset: string): string {
  return `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}&asset=${encodeURIComponent(asset)}`;
}

const assetsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

function TrendChart({ points, label }: { points: TrendPoint[]; label: string }) {
  const W = 820;
  const H = 280;
  const pad = { l: 56, r: 12, t: 16, b: 28 };
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const yLo = lo - span * 0.08;
  const ySpan = span * 1.16;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1);
  const y = (v: number) => pad.t + (1 - (v - yLo) / ySpan) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [lo, lo + span / 2, hi];
  const seasonStep = Math.max(1, Math.ceil(points.length / 12));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} by season`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeDasharray="4 4"
          />
          <text x={4} y={y(tick) + 4} className="fill-current font-inter text-[11px] text-muted-foreground">
            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % seasonStep === 0 ? (
          <text
            key={p.season}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-current font-inter text-[10px] text-muted-foreground"
          >
            {p.season}
          </text>
        ) : null
      )}
      <polyline points={line} fill="none" strokeWidth={2} className="stroke-primary" />
      {points.map((p, i) => (
        <circle key={p.season} cx={x(i)} cy={y(p.value)} r={3} className="fill-primary">
          <title>{`${p.season}: ${p.display}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={pad.t - 4} className="fill-current font-inter text-[11px] text-muted-foreground">
        {label}
      </text>
    </svg>
  );
}

export default function PlatformTrends({ platformSession: session }: { platformSession: PlatformSessionProps }) {
  const [sportKey, setSportKey] = useState(TREND_SPORTS[0].key);
  const [teams, setTeams] = useState<string[]>([]);
  const [stats, setStats] = useState<{ name: string; label: string }[]>([]);
  const [team, setTeam] = useState("");
  const [stat, setStat] = useState("");
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sport = useMemo(
    () => TREND_SPORTS.find((s) => s.key === sportKey) ?? TREND_SPORTS[0],
    [sportKey]
  );

  const { data: assets } = useSWR(
    session.authorized
      ? `/api/platform/datasets/assets?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}`
      : null,
    assetsFetcher
  );

  const seasonAssets = useMemo(
    () =>
      (assets ?? [])
        .map((a) => a.name)
        .filter((n) => n.startsWith(sport.assetPrefix) && n.endsWith(".parquet"))
        .sort(),
    [assets, sport]
  );

  // Populate team + stat dropdowns from the newest season file.
  useEffect(() => {
    if (!seasonAssets.length) return;
    let cancelled = false;
    (async () => {
      const { runQuery } = await import("@lib/platform/duckdb");
      setBusy("Loading teams & stats…");
      setError(null);
      try {
        const src = `read_parquet('${proxyUrl(sport, seasonAssets[seasonAssets.length - 1])}')`;
        const [teamRes, statRes] = [
          await runQuery(`SELECT DISTINCT team_display_name FROM ${src} WHERE team_display_name IS NOT NULL ORDER BY 1`, 1000),
          await runQuery(`SELECT DISTINCT stat_name, stat_display_name FROM ${src} ORDER BY 2`, 300),
        ];
        if (cancelled) return;
        setTeams(teamRes.rows.map((r) => r[0] ?? "").filter(Boolean));
        setStats(
          statRes.rows
            .map((r) => ({ name: r[0] ?? "", label: r[1] ?? r[0] ?? "" }))
            .filter((s) => s.name)
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonAssets, sport.tag]);

  async function run() {
    if (!team || !stat) return;
    const { runQuery } = await import("@lib/platform/duckdb");
    setBusy("Charting…");
    setError(null);
    setPoints([]);
    try {
      const urls = seasonAssets.map((a) => `'${proxyUrl(sport, a)}'`).join(", ");
      const res = await runQuery(
        `SELECT season, value, display_value FROM read_parquet([${urls}], union_by_name=true)
         WHERE team_display_name = '${team.replace(/'/g, "''")}' AND stat_name = '${stat.replace(/'/g, "''")}' AND value IS NOT NULL
         ORDER BY season`,
        200
      );
      const idx = (name: string) => res.columns.indexOf(name);
      setPoints(
        res.rows.map((r) => ({
          season: Number(r[idx("season")]),
          value: Number(r[idx("value")]),
          display: r[idx("display_value")] ?? String(r[idx("value")]),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const statLabel = stats.find((s) => s.name === stat)?.label ?? stat;

  return (
    <PlatformShell session={session} title="Trends">
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Team stat trends across every available season ({seasonAssets.length} season
        files) — the first chart touches all of them, so give it a few seconds.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {TREND_SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setSportKey(s.key);
                setTeams([]);
                setStats([]);
                setTeam("");
                setStat("");
                setPoints([]);
              }}
              className={`rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors ${
                s.key === sportKey
                  ? "bg-primary text-white dark:bg-white/20"
                  : "bg-primary/10 text-primary hover:bg-primary/20 dark:bg-white/10 dark:text-sky-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="min-w-[16rem] rounded-md border border-gray-300 bg-white px-3 py-1.5 font-inter text-sm dark:border-gray-600 dark:bg-darkSecondary"
        >
          <option value="">Team… ({teams.length})</option>
          {teams.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          value={stat}
          onChange={(e) => setStat(e.target.value)}
          className="min-w-[14rem] rounded-md border border-gray-300 bg-white px-3 py-1.5 font-inter text-sm dark:border-gray-600 dark:bg-darkSecondary"
        >
          <option value="">Stat… ({stats.length})</option>
          {stats.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
        <Button onClick={run} disabled={busy !== null || !team || !stat}>
          <TrendingUp className="mr-1 h-4 w-4" /> {busy ?? "Chart it"}
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 font-mono text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {points.length > 1 ? (
        <div className="rounded-lg border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-darkSecondary/70">
          <h3 className="mb-2 font-barlow text-lg font-semibold">
            {team} — {statLabel}
          </h3>
          <TrendChart points={points} label={statLabel} />
        </div>
      ) : points.length === 1 ? (
        <p className="font-inter text-sm text-muted-foreground">
          Only one season of data for that combination ({points[0].season}:{" "}
          {points[0].display}).
        </p>
      ) : null}
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  return { props: { platformSession: await getPlatformSessionProps(ctx) } };
}
