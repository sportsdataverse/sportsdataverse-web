"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Plus, TrendingUp, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { TREND_SPORTS } from "@content/trends";
import type { TrendSport } from "@content/trends";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import { trendsViewParams, type TrendsView } from "@lib/platform/viewState";
import { chartVar, type CategoricalSlot } from "@lib/platform/chartTokens";
import { niceTicks } from "@lib/platform/scales";
import {
  MAX_TRENDS_TEAMS,
  addTeam,
  pickSlots,
  removeTeam,
  spreadLabels,
  type TrendPicks,
} from "@lib/platform/trends";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * SP+-Trends-style team trends: sport → up to six teams → stat → the metric
 * charted across every available season (2002/2003 → current), one line per
 * team in a fixed categorical slot. Long-format team_season_stats releases
 * queried in-browser via DuckDB + range proxy.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

type TrendPoint = { season: number; value: number; display: string };
type TrendSeries = { team: string; slot: CategoricalSlot; points: TrendPoint[] };
/** A refused pick, or the charted teams with no rows for the stat. */
type Note = { refused: string } | { label: string; missing: string[] };

function noteText(note: Note): string {
  return "refused" in note
    ? `${MAX_TRENDS_TEAMS} teams at most, one per colour. Remove one to add ${note.refused}.`
    : `No ${note.label} for ${note.missing.join(", ")}.`;
}

function proxyUrl(sport: TrendSport, asset: string): string {
  return `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}&asset=${encodeURIComponent(asset)}`;
}

const assetsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A line swatch in the series' slot colour. */
function Swatch({ slot }: { slot: CategoricalSlot }) {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4 shrink-0" aria-hidden="true">
      <line x1={1} x2={15} y1={6} y2={6} stroke={chartVar(slot)} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** Legend and hover readout in one: every team's name beside its colour, and
 *  its value at the hovered season (the latest one otherwise). HTML, not SVG
 *  text, so it stays readable at phone width; long names wrap. */
function TrendsLegend({ series, season }: { series: TrendSeries[]; season: number }) {
  return (
    <div data-testid="trends-legend" className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-inter text-sm">
      <span className="font-mono text-xs font-semibold">{season}</span>
      {series.map((s) => {
        const p = s.points.find((q) => q.season === season);
        return (
          <span key={s.team} className="flex items-center gap-2">
            <Swatch slot={s.slot} />
            <span>
              {s.team} <span className="tabular-nums text-muted-foreground">{p ? p.display : "–"}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** The chart is drawn at its box's real pixel width (not a scaled viewBox),
 *  so axis text and end labels keep their size on a phone. */
function useBoxWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const LABEL_PX = 12; // end-label font size; also its collision gap (+2)
const CHAR_PX = 6.6; // ~Inter 12px average advance, for truncating end labels

function TrendChart({
  series,
  label,
  hover,
  onHover,
}: {
  series: TrendSeries[];
  label: string;
  hover: number | null;
  onHover: (season: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const W = useBoxWidth(box);
  const H = 300;
  // The right gutter holds the end labels: wide enough for most full names on
  // desktop, truncated (full name in the legend and the <title>) on a phone.
  const gutter = Math.round(Math.min(180, Math.max(92, W * 0.24)));
  const pad = { l: 48, r: gutter, t: 12, b: 26 };
  const seasons = [...new Set(series.flatMap((s) => s.points.map((p) => p.season)))].sort((a, b) => a - b);
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  const yLo = lo - span * 0.08;
  const yHi = hi + span * 0.08;
  const [s0, s1] = [seasons[0], seasons[seasons.length - 1]];
  const plotW = W - pad.l - pad.r;
  const x = (season: number) => pad.l + ((season - s0) / (s1 - s0 || 1)) * plotW;
  const y = (v: number) => pad.t + (1 - (v - yLo) / (yHi - yLo)) * (H - pad.t - pad.b);
  const ticks = niceTicks(yLo, yHi, 4);
  const seasonStep = Math.max(1, Math.ceil(seasons.length / Math.max(1, Math.floor(plotW / 44))));
  const ends = series.map((s) => s.points[s.points.length - 1]);
  const labelYs = spreadLabels(ends.map((p) => y(p.value)), LABEL_PX + 2, pad.t + LABEL_PX / 2, H - pad.b - LABEL_PX / 2);
  const maxChars = Math.floor((gutter - 16) / CHAR_PX);
  const clip = (t: string) => (t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t);

  /** Pointer x → nearest season with data on any line. */
  function seasonAt(e: React.MouseEvent<SVGSVGElement>): number {
    const vx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return seasons.reduce((best, s) => (Math.abs(x(s) - vx) < Math.abs(x(best) - vx) ? s : best), s0);
  }

  return (
    <div ref={box} className="w-full">
      {W > 0 ? (
        <svg
          data-testid="trends-chart"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label={`${label} by season`}
          onMouseMove={(e) => onHover(seasonAt(e))}
          onMouseLeave={() => onHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeDasharray="4 4" />
              <text
                x={pad.l - 6}
                y={y(tick) + 4}
                textAnchor="end"
                className="fill-current font-inter text-[11px] text-muted-foreground"
              >
                {tick}
              </text>
            </g>
          ))}
          {seasons.map((s, i) =>
            i % seasonStep === 0 ? (
              <text
                key={s}
                x={x(s)}
                y={H - 8}
                textAnchor="middle"
                className="fill-current font-inter text-[10px] text-muted-foreground"
              >
                {s}
              </text>
            ) : null
          )}
          {series.map((s) =>
            s.points.length > 1 ? (
              <polyline
                key={s.team}
                data-team={s.team}
                points={s.points.map((p) => `${x(p.season).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={chartVar(s.slot)}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ) : (
              <circle
                key={s.team}
                data-team={s.team}
                cx={x(s.points[0].season)}
                cy={y(s.points[0].value)}
                r={3}
                fill={chartVar(s.slot)}
              />
            )
          )}
          {/* Direct end labels: text in the foreground colour (cat-3/cat-5 are
              under 3:1 on light card), tied to the line by a slot-coloured leader. */}
          {series.map((s, k) => {
            const p = ends[k];
            const ex = x(p.season);
            return (
              <g key={s.team} data-testid="trends-end-label">
                <title>{`${s.team}: ${p.season} ${p.display}`}</title>
                <line x1={ex + 3} x2={ex + 9} y1={y(p.value)} y2={labelYs[k]} stroke={chartVar(s.slot)} strokeWidth={1.5} />
                <text
                  x={ex + 12}
                  y={labelYs[k]}
                  dominantBaseline="middle"
                  className="fill-foreground font-inter text-[12px]"
                >
                  {clip(s.team)}
                </text>
              </g>
            );
          })}
          {hover != null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-score" strokeWidth={1} />
              {series.map((s) => {
                const p = s.points.find((q) => q.season === hover);
                return p ? (
                  <circle
                    key={s.team}
                    cx={x(hover)}
                    cy={y(p.value)}
                    r={4}
                    fill={chartVar(s.slot)}
                    className="stroke-background"
                    strokeWidth={1.5}
                  />
                ) : null;
              })}
            </g>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}

export default function TrendsClient({ initial }: { initial: TrendsView }) {
  const [sportKey, setSportKey] = useState(initial.sport);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [stats, setStats] = useState<{ name: string; label: string }[]>([]);
  // Picks by position = colour slot (see lib/platform/trends.ts). The ref is
  // the live value for a chart that lands after a removal made while loading.
  const [picked, setPicked] = useState<TrendPicks>(initial.teams);
  const pickedRef = useRef(initial.teams);
  const [pending, setPending] = useState("");
  const [stat, setStat] = useState(initial.stat);
  // A shared link charts itself once its team + stat lists have loaded.
  // Disarms on a match, a no-match, a load failure and a manual sport switch
  // (see the onClick below) — never left armed to misfire against a later,
  // unrelated sport's lists.
  const autoRun = useRef(Boolean(initial.teams.length && initial.stat));
  const [chart, setChart] = useState<{ label: string; series: TrendSeries[] } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sport = useMemo(
    () => TREND_SPORTS.find((s) => s.key === sportKey) ?? TREND_SPORTS[0],
    [sportKey]
  );

  const { data: assets } = useSWR(
    `/api/platform/datasets/assets?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(sport.tag)}`,
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
        setTeamOptions(teamRes.rows.map((r) => r[0] ?? "").filter(Boolean));
        setStats(
          statRes.rows
            .map((r) => ({ name: r[0] ?? "", label: r[1] ?? r[0] ?? "" }))
            .filter((s) => s.name)
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          autoRun.current = false; // the list load failed: nothing to chart
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonAssets, sport.tag]);

  useUrlMirror(trendsViewParams({ sport: sportKey, teams: picked, stat }));

  function setPicks(next: TrendPicks) {
    pickedRef.current = next;
    setPicked(next);
  }

  /** Add the pending pick and re-chart, so chips, URL and chart agree. */
  function addPending() {
    if (!pending) return;
    const next = addTeam(picked, pending);
    setPending("");
    if (next.refused) {
      setNote({ refused: pending });
      return;
    }
    setPicks(next.teams);
    setNote(null);
    if (stat) void run(next.teams);
  }

  function dropTeam(team: string) {
    setPicks(removeTeam(picked, team));
    // A gap, not a shift: the rest keep their positions, so their colours.
    setChart((c) => (c ? { ...c, series: c.series.filter((s) => s.team !== team) } : c));
    setNote((n) => {
      if (!n || "refused" in n) return null; // a refused pick now has room
      const missing = n.missing.filter((t) => t !== team);
      return missing.length ? { ...n, missing } : null;
    });
  }

  async function run(picks: TrendPicks = pickedRef.current) {
    const teams = picks.filter((t): t is string => t !== null);
    if (!teams.length || !stat) return;
    setBusy("Charting…");
    setError(null);
    setNote(null);
    setChart(null);
    setHover(null);
    const label = stats.find((s) => s.name === stat)?.label ?? stat;
    try {
      const { runQuery } = await import("@lib/platform/duckdb");
      const urls = seasonAssets.map((a) => `'${proxyUrl(sport, a)}'`).join(", ");
      const res = await runQuery(
        `SELECT team_display_name, season, value, display_value FROM read_parquet([${urls}], union_by_name=true)
         WHERE team_display_name IN (${teams.map(sq).join(", ")}) AND stat_name = ${sq(stat)} AND value IS NOT NULL
         ORDER BY season`,
        200 * MAX_TRENDS_TEAMS
      );
      const idx = (name: string) => res.columns.indexOf(name);
      const byTeam = new Map<string, TrendPoint[]>();
      for (const r of res.rows) {
        const team = r[idx("team_display_name")] ?? "";
        const points = byTeam.get(team) ?? [];
        points.push({
          season: Number(r[idx("season")]),
          value: Number(r[idx("value")]),
          display: r[idx("display_value")] ?? String(r[idx("value")]),
        });
        byTeam.set(team, points);
      }
      // A team removed while this loaded stays removed; positions never
      // shift, so every other team's slot is still its own.
      const live = (t: string) => pickedRef.current.includes(t);
      const series = pickSlots(picks).flatMap(({ team, slot }) => {
        const points = byTeam.get(team);
        return live(team) && points?.length ? [{ team, slot, points }] : [];
      });
      const missing = teams.filter((t) => live(t) && !byTeam.has(t));
      setChart({ label, series });
      if (missing.length) setNote({ label, missing });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!autoRun.current || !teamOptions.length || !stats.length) return;
    autoRun.current = false;
    if (picked.some((t) => t !== null && teamOptions.includes(t)) && stats.some((s) => s.name === stat)) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires when the lists arrive
  }, [teamOptions, stats]);

  const series = chart?.series ?? [];
  const seasonCount = new Set(series.flatMap((s) => s.points.map((p) => p.season))).size;
  const latest = Math.max(...series.flatMap((s) => s.points.map((p) => p.season)));

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Trends</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Team stat trends across every available season ({seasonAssets.length} season
        files), up to {MAX_TRENDS_TEAMS} teams on one chart. The first chart touches every file, so give
        it a few seconds.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {TREND_SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                autoRun.current = false;
                setSportKey(s.key);
                setTeamOptions([]);
                setStats([]);
                setPicks([]);
                setPending("");
                setStat("");
                setChart(null);
                setNote(null);
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
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Add a team"
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            className="min-w-[16rem] rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
          >
            <option value="">
              Team… ({picked.filter(Boolean).length}/{MAX_TRENDS_TEAMS})
            </option>
            {teamOptions
              .filter((t) => !picked.includes(t))
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
          <Button variant="outline" onClick={addPending} disabled={busy !== null || !pending}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        <select
          aria-label="Stat"
          value={stat}
          onChange={(e) => setStat(e.target.value)}
          className="min-w-[14rem] rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
        >
          <option value="">Stat… ({stats.length})</option>
          {stats.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label}
            </option>
          ))}
        </select>
        <Button onClick={() => void run()} disabled={busy !== null || !picked.length || !stat}>
          <TrendingUp className="mr-1 h-4 w-4" /> {busy ?? "Chart it"}
        </Button>
      </div>

      {picked.length ? (
        <div data-testid="trends-picked" className="mb-3 flex flex-wrap gap-2">
          {pickSlots(picked).map(({ team: t }) => (
            <button
              key={t}
              onClick={() => dropTeam(t)}
              aria-label={`Remove ${t}`}
              className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-inter text-sm hover:bg-muted"
            >
              {t} <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}

      <p data-testid="trends-note" role="status" className="mb-3 min-h-5 font-inter text-sm text-muted-foreground">
        {note ? noteText(note) : null}
      </p>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {chart && seasonCount > 1 ? (
        <div className="rounded-lg border border-border bg-card/70 p-4">
          <h3 className="mb-2 font-barlow text-lg font-semibold">{chart.label}</h3>
          <TrendsLegend series={series} season={hover ?? latest} />
          <TrendChart series={series} label={chart.label} hover={hover} onHover={setHover} />
        </div>
      ) : chart && seasonCount === 1 ? (
        <p className="font-inter text-sm text-muted-foreground">
          Only one season of data for that combination ({latest}):{" "}
          {series.map((s) => `${s.team} ${s.points[0].display}`).join(", ")}.
        </p>
      ) : null}
    </>
  );
}
