"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Plus, TrendingUp, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { TREND_SPORTS } from "@content/trends";
import type { ReleaseAssetSummary } from "@lib/platform/github";
import { trendsViewParams, type TrendsView } from "@lib/platform/viewState";
import { loadSequencer } from "@lib/platform/wp";
import { apiRows } from "@lib/platform/queryRun";
import { chartVar, type CategoricalSlot } from "@lib/platform/chartTokens";
import { niceTicks } from "@lib/platform/scales";
import {
  MAX_TRENDS_TEAMS,
  addTeam,
  assertGroupsJoin,
  bandRuns,
  bandWithin,
  displayDecimals,
  endLabels,
  formatValue,
  lastPlayedWeek,
  loadLeague,
  pickSlots,
  rankColumn,
  rankLabel,
  releaseKey,
  removeTeam,
  statColumns,
  statGroups,
  teamNameLookup,
  wideToSeries,
  type BandPoint,
  type LeagueRows,
  type TrendPicks,
} from "@lib/platform/trends";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * SP+-Trends-style team trends: sport → up to six teams → stat, one line per
 * team in a fixed categorical slot. Hoops (long team_season_stats) chart
 * every season file; the CFB/NFL weekly frames (wide, one column per stat)
 * chart one season by week. Release parquet queried in-browser via DuckDB +
 * range proxy; CFB/NFL rating ids are named from a Data API team table. Under
 * the lines, the league mean ± 1 sd per x from the same files; beside a value,
 * the producer's rank where the row carries one.
 */

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

/** x is a season (long sources) or a week within one season (weekly ones).
 *  `rank` is the producer rank's label ("#12 of 136"), where the row has one. */
type TrendPoint = { x: number; value: number; display: string; rank?: string | null };
type TrendSeries = { team: string; slot: CategoricalSlot; points: TrendPoint[] };
/** A refused pick, the charted teams with no rows for the stat, a stat the
 *  season's file does not carry, or charted seasons with no D-I list. */
type Note =
  | { refused: string }
  | { label: string; missing: string[] }
  | { absentStat: string }
  | { noGroups: number[] };

function noteText(note: Note): string {
  if ("refused" in note) return `${MAX_TRENDS_TEAMS} teams at most, one per colour. Remove one to add ${note.refused}.`;
  if ("absentStat" in note) return `${note.absentStat} is not in this season's file. Pick another stat.`;
  if ("noGroups" in note) return `No D-I team list for ${note.noGroups.join(", ")}: no band there.`;
  return `No ${note.label} for ${note.missing.join(", ")}.`;
}

/** A release asset (a source's season file, or its groups file) through the
 *  member-gated range proxy. */
function proxyUrl(release: { tag: string }, asset: string): string {
  return `${window.location.origin}/api/platform/datasets/file?repo=${encodeURIComponent(DATA_REPO)}&tag=${encodeURIComponent(release.tag)}&asset=${encodeURIComponent(asset)}`;
}

const assetsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as ReleaseAssetSummary[];
};

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** An x value as read: a season as is, a week with what the source's week
 *  number means ("Through week 5", "Entering week 5"). */
const xText = (weekLabel: string | undefined, x: number) => (weekLabel ? `${weekLabel} ${x}` : String(x));

/** A line swatch in the series' slot colour. */
function Swatch({ slot }: { slot: CategoricalSlot }) {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4 shrink-0" aria-hidden="true">
      <line x1={1} x2={15} y1={6} y2={6} stroke={chartVar(slot)} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** The league band's swatch: its neutral fill with the dashed mean line. */
function BandSwatch() {
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4 shrink-0" aria-hidden="true">
      <rect x={0} y={1} width={16} height={10} fill={chartVar("div-mid")} />
      <line x1={0} x2={16} y1={6} y2={6} className="stroke-muted-foreground" strokeWidth={1.5} strokeDasharray="3 2" />
    </svg>
  );
}

/** Legend and hover readout in one: every team's name beside its colour, and
 *  its value (and producer rank, where the row has one) at the hovered x (the
 *  latest one otherwise); then the league mean there and how many teams it
 *  averages. HTML, not SVG text, so it stays readable at phone width; long
 *  names wrap. */
function TrendsLegend({
  series,
  band,
  population,
  meanDigits,
  x,
  weekLabel,
}: {
  series: TrendSeries[];
  band: BandPoint[];
  /** Whose mean: "League", or "D-I" where the band is one division. */
  population: string;
  /** The mean's decimals, to match the teams' own display (hoops). */
  meanDigits?: number;
  x: number;
  weekLabel?: string;
}) {
  const league = band.find((b) => b.x === x);
  return (
    <div data-testid="trends-legend" className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-inter text-sm">
      <span className="font-mono text-xs font-semibold">{xText(weekLabel, x)}</span>
      {series.map((s) => {
        const p = s.points.find((q) => q.x === x);
        return (
          <span key={s.team} className="flex items-center gap-2">
            <Swatch slot={s.slot} />
            <span>
              {s.team} <span className="tabular-nums text-muted-foreground">{p ? p.display : "–"}</span>
              {p?.rank ? (
                <span data-testid="trends-rank" className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {p.rank}
                </span>
              ) : null}
            </span>
          </span>
        );
      })}
      {band.length ? (
        <span data-testid="trends-league" className="flex items-center gap-2">
          <BandSwatch />
          <span>
            {population} mean ± 1 SD{" "}
            <span className="tabular-nums text-muted-foreground">
              {league ? `${formatValue(league.mean, meanDigits)} (n = ${league.n})` : "–"}
            </span>
          </span>
        </span>
      ) : null}
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
  band,
  label,
  weekLabel,
  hover,
  onHover,
}: {
  series: TrendSeries[];
  band: BandPoint[];
  label: string;
  weekLabel?: string;
  hover: number | null;
  onHover: (x: number | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const W = useBoxWidth(box);
  const H = 300;
  // The right gutter holds the end labels: wide enough for most full names on
  // desktop, truncated (full name in the legend and the <title>) on a phone.
  const gutter = Math.round(Math.min(180, Math.max(92, W * 0.24)));
  const pad = { l: 48, r: gutter, t: 12, b: 26 };
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  // The band is in the y domain, so it is never clipped.
  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...band.flatMap((b) => [b.mean, b.lo ?? b.mean, b.hi ?? b.mean]),
  ];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) || 1;
  const yLo = lo - span * 0.08;
  const yHi = hi + span * 0.08;
  const [x0, x1] = [xs[0], xs[xs.length - 1]];
  const plotW = W - pad.l - pad.r;
  const x = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * plotW;
  const y = (v: number) => pad.t + (1 - (v - yLo) / (yHi - yLo)) * (H - pad.t - pad.b);
  const ticks = niceTicks(yLo, yHi, 4);
  const xStep = Math.max(1, Math.ceil(xs.length / Math.max(1, Math.floor(plotW / 44))));
  const ends = series.map((s) => s.points[s.points.length - 1]);
  // Labels in one column at the plot's right edge: a line that ends early
  // (its season finished in an earlier week) keeps its label out of the plot.
  const labels = endLabels(
    ends.map((p) => y(p.value)),
    W - pad.r,
    LABEL_PX + 2,
    pad.t + LABEL_PX / 2,
    H - pad.b - LABEL_PX / 2
  );
  const maxChars = Math.floor((gutter - 16) / CHAR_PX);
  const clip = (t: string) => (t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t);

  /** Pointer x → nearest x with data on any line. */
  function xAt(e: React.MouseEvent<SVGSVGElement>): number {
    const vx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return xs.reduce((best, v) => (Math.abs(x(v) - vx) < Math.abs(x(best) - vx) ? v : best), x0);
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
          aria-label={`${label} by ${weekLabel ? "week" : "season"}`}
          onMouseMove={(e) => onHover(xAt(e))}
          onMouseLeave={() => onHover(null)}
        >
          {/* The league band under everything, in the neutral diverging midpoint
              (never amber, never a team slot); it takes no pointer events. */}
          <g data-testid="trends-band" pointerEvents="none">
            {bandRuns(band, xs).map((run) => (
              <polygon
                key={run[0].x}
                points={[...run.map((b) => [b.x, b.hi]), ...[...run].reverse().map((b) => [b.x, b.lo])]
                  .map(([bx, by]) => `${x(bx!).toFixed(1)},${y(by!).toFixed(1)}`)
                  .join(" ")}
                fill={chartVar("div-mid")}
              />
            ))}
          </g>
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
          {xs.map((s, i) =>
            i % xStep === 0 ? (
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
          <g data-testid="trends-mean" data-mean={band.map((b) => `${b.x}:${b.mean}`).join(" ")} pointerEvents="none">
            {bandRuns(band, xs, false).map((run) => (
              <polyline
                key={run[0].x}
                points={run.map((b) => `${x(b.x).toFixed(1)},${y(b.mean).toFixed(1)}`).join(" ")}
                fill="none"
                className="stroke-muted-foreground"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            ))}
          </g>
          {series.map((s) =>
            s.points.length > 1 ? (
              <polyline
                key={s.team}
                data-team={s.team}
                points={s.points.map((p) => `${x(p.x).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={chartVar(s.slot)}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ) : (
              <circle
                key={s.team}
                data-team={s.team}
                cx={x(s.points[0].x)}
                cy={y(s.points[0].value)}
                r={3}
                fill={chartVar(s.slot)}
              />
            )
          )}
          {/* Direct end labels: text in the foreground colour (cat-3/cat-5 are
              under 3:1 on light card), tied to the line by a slot-coloured leader.
              A line that ends early gets a dot at its real last point and a faint
              dotted leader, so the leader never reads as a value held to the edge. */}
          {series.map((s, k) => {
            const p = ends[k];
            const [ex, ey, l] = [x(p.x), y(p.value), labels[k]];
            const early = ex < l.x - 1;
            return (
              <g key={s.team} data-testid="trends-end-label">
                <title>{`${s.team}: ${xText(weekLabel, p.x)} ${p.display}`}</title>
                {early ? <circle cx={ex} cy={ey} r={2.5} fill={chartVar(s.slot)} /> : null}
                <polyline
                  points={`${ex + 3},${ey} ${l.x + 3},${ey} ${l.x + 9},${l.y}`}
                  fill="none"
                  stroke={chartVar(s.slot)}
                  strokeWidth={1.5}
                  strokeDasharray={early ? "2 3" : undefined}
                  strokeOpacity={early ? 0.5 : undefined}
                />
                <text
                  x={l.x + 12}
                  y={l.y}
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
                const p = s.points.find((q) => q.x === hover);
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
      {weekLabel ? (
        <p className="text-center font-inter text-xs text-muted-foreground" style={{ paddingRight: gutter - 48 }}>
          {weekLabel}
        </p>
      ) : null}
    </div>
  );
}

export default function TrendsClient({ initial }: { initial: TrendsView }) {
  const [sportKey, setSportKey] = useState(initial.sport);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [stats, setStats] = useState<{ name: string; label: string }[]>([]);
  // Release team-key cell → name, for a source whose team column is an id.
  const [nameOf, setNameOf] = useState<Map<string, string> | null>(null);
  // A weekly file's last played week: later weeks are a forward-filled tail.
  const [lastWeek, setLastWeek] = useState(Infinity);
  const [season, setSeason] = useState(initial.season);
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
  const [chart, setChart] = useState<{
    label: string;
    season: string;
    series: TrendSeries[];
    band: BandPoint[];
    meanDigits?: number;
  } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A sport switch abandons an in-flight chart: only the newest run may touch the status.
  const [runs] = useState(loadSequencer);

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

  // A by-week source charts one season's file: the linked season when the
  // release has it, else the newest.
  const weekly = sport.xAxis === "week";
  const xName = weekly ? "week" : "season";
  const weekLabel = weekly ? sport.weekLabel : undefined;
  const seasons = seasonAssets.map((a) => a.slice(sport.assetPrefix.length, -".parquet".length)).filter((y) => /^\d{4}$/.test(y));
  const activeSeason = weekly && seasons.length ? (seasons.includes(season) ? season : seasons[seasons.length - 1]) : "";
  const listAsset = weekly
    ? activeSeason && `${sport.assetPrefix}${activeSeason}.parquet`
    : seasonAssets[seasonAssets.length - 1] ?? "";

  // Populate team + stat dropdowns from the newest (or the chosen) season file.
  useEffect(() => {
    if (!listAsset) return;
    let cancelled = false;
    (async () => {
      const { runQuery } = await import("@lib/platform/duckdb");
      setBusy("Loading teams & stats…");
      setError(null);
      try {
        const src = `read_parquet('${proxyUrl(sport, listAsset)}')`;
        const c = sport.cols;
        let teams: string[];
        let statList: { name: string; label: string }[];
        let lookup: Map<string, string> | null = null;
        let last = Infinity;
        if (sport.format === "long") {
          const [teamRes, statRes] = [
            await runQuery(`SELECT DISTINCT ${qi(c.team)} FROM ${src} WHERE ${qi(c.team)} IS NOT NULL ORDER BY 1`, 1000),
            await runQuery(`SELECT DISTINCT ${qi(c.stat ?? "stat_name")}, stat_display_name FROM ${src} ORDER BY 2`, 300),
          ];
          teams = teamRes.rows.map((r) => r[0] ?? "").filter(Boolean);
          statList = statRes.rows.map((r) => ({ name: r[0] ?? "", label: r[1] ?? r[0] ?? "" })).filter((s) => s.name);
        } else {
          const [keyRes, described] = [
            await runQuery(`SELECT DISTINCT ${qi(c.team)} FROM ${src} WHERE ${qi(c.team)} IS NOT NULL ORDER BY 1`, 1000),
            await runQuery(`DESCRIBE SELECT * FROM ${src}`, 2000),
          ];
          const [n, t] = [described.columns.indexOf("column_name"), described.columns.indexOf("column_type")];
          statList = statColumns(described.rows.map((r) => ({ name: r[n] ?? "", type: r[t] ?? "" })), c).map((name) => ({ name, label: name }));
          if (c.week && c.games) {
            // sum() is a HUGEINT, which DuckDB-WASM hands back as an object: cast it.
            const played = await runQuery(
              `SELECT ${qi(c.week)} w, CAST(sum(${qi(c.games)}) AS BIGINT) g FROM ${src} GROUP BY 1`,
              100
            );
            last = lastPlayedWeek(played.rows.map((r) => ({ week: Number(r[0]), gamesTotal: Number(r[1]) })));
          }
          // Keys stay the release's own strings in SQL; a number key must be
          // all digits before it joins the Data API's numeric ids.
          const keys = keyRes.rows.map((r) => r[0] ?? "").filter(Boolean);
          if (sport.names) {
            const { schema, table, key, name, keyType } = sport.names;
            const rows = await apiRows({ schema, table, select: `${key},${name}`, limit: "5000" });
            const ids = keys.map((k) => releaseKey(k, keyType));
            const byId = teamNameLookup(ids, rows, sport.names);
            lookup = new Map(keys.map((k, i) => [k, byId.get(ids[i]) ?? k]));
            teams = [...lookup.values()];
          } else teams = keys;
          teams.sort((a, b) => a.localeCompare(b));
        }
        if (cancelled) return;
        setTeamOptions(teams);
        setStats(statList);
        setNameOf(lookup);
        setLastWeek(last);
        // A link or a season switch whose picks are all missing from this file
        // (a season they did not play): name them rather than leave the chart
        // empty. Otherwise the effect below charts once these lists land.
        const picks = pickedRef.current.filter((t): t is string => t !== null);
        const shown = statList.find((x) => x.name === stat);
        if (autoRun.current && stat && !shown) {
          // the chosen stat is not in this season's file: say so, don't chart blank
          autoRun.current = false;
          setNote({ absentStat: stat });
        } else if (autoRun.current && shown && picks.length && !picks.some((t) => teams.includes(t))) {
          autoRun.current = false;
          setNote({ label: shown.label, missing: picks });
        }
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
  }, [listAsset, sport.tag]);

  useUrlMirror(trendsViewParams({ sport: sportKey, teams: picked, stat, season: weekly ? activeSeason || season : "" }));

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
      if ("absentStat" in n || "noGroups" in n) return n; // dropping a team doesn't bring these back
      const missing = n.missing.filter((t) => t !== team);
      return missing.length ? { ...n, missing } : null;
    });
  }

  type RunQuery = (typeof import("@lib/platform/duckdb"))["runQuery"];

  /** Every season file (long sources), read as one. */
  const longSrc = () =>
    `read_parquet([${seasonAssets.map((a) => `'${proxyUrl(sport, a)}'`).join(", ")}], union_by_name=true)`;
  /** A weekly source's played weeks only: the forward-filled tail is not charted. */
  const playedWeeks = (xCol: string) => (Number.isFinite(lastWeek) ? `${qi(xCol)} <= ${lastWeek}` : "TRUE");

  /**
   * The league per x, over the same file(s) as the lines and every team in
   * them (D-I teams only for a `groups` source): mean, sd and n of the stat's
   * finite values (GROUP BY week, or season for the long files after
   * filtering to the stat's rows), and the teams with any value there, the
   * "of" of a rank. The producer ranks an inf too, and ranks null-stat teams
   * last, so "of" is count(stat): not the finite n, not count(rank). Every
   * aggregate is CAST: DuckDB-WASM hands a HUGEINT/BIGINT back as an object or
   * a BigInt, not a number.
   */
  async function leagueRows(runQuery: RunQuery): Promise<LeagueRows> {
    const c = sport.cols;
    // stddev_samp raises "out of range" on an inf (Miami (OH)'s
    // available_yards_pct_off, 2025 weeks 1-3); a NaN would poison the mean.
    const finite = (v: string) => `FILTER (WHERE isfinite(CAST(${v} AS DOUBLE)))`;
    const aggs = (v: string) =>
      `CAST(avg(${v}) ${finite(v)} AS DOUBLE), CAST(stddev_samp(${v}) ${finite(v)} AS DOUBLE),
       CAST(count(${v}) ${finite(v)} AS INTEGER), CAST(count(${v}) AS INTEGER)`;
    let sql: string;
    let seasons: number[] | undefined;
    if (sport.format === "wide") {
      const [xCol, v] = [c.week ?? c.season, qi(stat)];
      sql = `SELECT ${qi(xCol)}, ${aggs(v)} FROM read_parquet('${proxyUrl(sport, listAsset)}')
       WHERE ${playedWeeks(xCol)} GROUP BY 1 HAVING count(${v}) ${finite(v)} > 0`;
    } else {
      let inGroups = "";
      if (sport.groups) {
        const groups = `read_parquet('${proxyUrl(sport.groups, sport.groups.asset)}')`;
        const meta = await runQuery(
          `SELECT * FROM (SELECT typeof(team_id), typeof(${qi(c.season)}) FROM ${longSrc()} LIMIT 1),
           (SELECT any_value(typeof(team_id)), any_value(typeof(season)), string_agg(DISTINCT CAST(season AS VARCHAR), ',') FROM ${groups})`,
          1
        );
        const [fileTeam, fileSeason, groupsTeam, groupsSeason, listed] = meta.rows[0] ?? [];
        assertGroupsJoin({
          fileTeam: fileTeam ?? "",
          fileSeason: fileSeason ?? "",
          groupsTeam: groupsTeam ?? "",
          groupsSeason: groupsSeason ?? "",
        });
        seasons = (listed ?? "").split(",").filter(Boolean).map(Number);
        inGroups = ` AND EXISTS (SELECT 1 FROM ${groups} g WHERE g.team_id = CAST(t.team_id AS VARCHAR) AND g.season = t.${qi(c.season)})`;
      }
      sql = `SELECT t.${qi(c.season)}, ${aggs("t.value")} FROM ${longSrc()} t
       WHERE t.${qi(c.stat ?? "stat_name")} = ${sq(stat)} AND isfinite(t.value)${inGroups} GROUP BY 1`;
    }
    const res = await runQuery(sql, 1000);
    return {
      rows: res.rows.map((r) => ({
        x: Number(r[0]),
        mean: Number(r[1] ?? NaN), // Number(null) would be a silent 0
        sd: r[2] == null ? null : Number(r[2]),
        n: Number(r[3]),
      })),
      of: new Map(res.rows.map((r) => [Number(r[0]), Number(r[4])])),
      seasons,
    };
  }

  /** Long files: every season file, one stat's rows, x = season. */
  async function longPoints(runQuery: RunQuery, teams: string[]): Promise<Map<string, TrendPoint[]>> {
    const c = sport.cols;
    const res = await runQuery(
      `SELECT ${qi(c.team)}, ${qi(c.season)}, value, display_value FROM ${longSrc()}
       WHERE ${qi(c.team)} IN (${teams.map(sq).join(", ")}) AND ${qi(c.stat ?? "stat_name")} = ${sq(stat)} AND value IS NOT NULL
       ORDER BY ${qi(c.season)}`,
      200 * MAX_TRENDS_TEAMS
    );
    const idx = (name: string) => res.columns.indexOf(name);
    const byTeam = new Map<string, TrendPoint[]>();
    for (const r of res.rows) {
      const team = r[idx(c.team)] ?? "";
      const points = byTeam.get(team) ?? [];
      points.push({
        x: Number(r[idx(c.season)]),
        value: Number(r[idx("value")]),
        display: r[idx("display_value")] ?? String(r[idx("value")]),
      });
      byTeam.set(team, points);
    }
    return byTeam;
  }

  /** Wide files: one season's file, the stat's own column, x = week. Picks
   *  are names; a names source queries by its release key. A rank in the same
   *  row is labelled against the teams with a value at that week (`of`). */
  async function widePoints(
    runQuery: RunQuery,
    teams: string[],
    rankCol: string | null,
    of: Map<number, number>
  ): Promise<Map<string, TrendPoint[]>> {
    const c = sport.cols;
    const xCol = c.week ?? c.season;
    const keyOf = new Map([...(nameOf ?? [])].map(([k, name]) => [name, k]));
    const keys = teams.flatMap((t) => {
      const k = sport.names ? keyOf.get(t) : t;
      return k === undefined ? [] : [sq(k)];
    });
    if (!keys.length || !listAsset) return new Map();
    const res = await runQuery(
      `SELECT ${qi(c.team)}, ${qi(xCol)}, ${qi(stat)}${rankCol ? `, ${qi(rankCol)}` : ""} FROM read_parquet('${proxyUrl(sport, listAsset)}')
       WHERE ${qi(c.team)} IN (${keys.join(", ")}) AND ${playedWeeks(xCol)}`,
      60 * MAX_TRENDS_TEAMS
    );
    const rows = res.rows.map((r) => Object.fromEntries(res.columns.map((col, i) => [col, r[i]])));
    return new Map(
      wideToSeries(rows, xCol, c.team, stat, rankCol).map((s) => [
        nameOf?.get(s.team) ?? s.team,
        s.points.map((p) => ({ ...p, display: formatValue(p.value), rank: rankLabel(p.rank, of.get(p.x)) })),
      ])
    );
  }

  async function run(picks: TrendPicks = pickedRef.current) {
    const teams = picks.filter((t): t is string => t !== null);
    if (!teams.length || !stat) return;
    const ticket = runs.next();
    setBusy("Charting…");
    setError(null);
    setNote(null);
    setChart(null);
    setHover(null);
    const label = stats.find((s) => s.name === stat)?.label ?? stat;
    try {
      const { runQuery } = await import("@lib/platform/duckdb");
      // Ranks only from a column in the same row (wide files): `<stat>_rank`
      // or the source's map. The stat list holds every numeric column.
      const names = stats.map((s) => s.name);
      const rankCol = sport.format === "wide" ? rankColumn(stat, names, sport.ranks) : null;
      // The band is auxiliary: if its query fails the lines still chart.
      const league = await loadLeague(() => leagueRows(runQuery));
      if (!runs.isLatest(ticket)) return;
      if (league.failed) console.warn(`Trends: no league band (${league.failed})`);
      const byTeam =
        sport.format === "wide"
          ? await widePoints(runQuery, teams, rankCol, league.of)
          : await longPoints(runQuery, teams);
      if (!runs.isLatest(ticket)) return;
      // A team removed while this loaded stays removed; positions never
      // shift, so every other team's slot is still its own.
      const live = (t: string) => pickedRef.current.includes(t);
      const series = pickSlots(picks).flatMap(({ team, slot }) => {
        const points = byTeam.get(team);
        return live(team) && points?.length ? [{ team, slot, points }] : [];
      });
      const missing = teams.filter((t) => live(t) && !byTeam.has(t));
      const points = series.flatMap((s) => s.points);
      // Hoops teams read ESPN's display_value ("46.9"): the mean matches its precision.
      const meanDigits = sport.format === "long" ? displayDecimals(points.map((p) => p.display)) : undefined;
      setChart({ label, season: activeSeason, series, band: league.band, meanDigits });
      const listed = league.seasons;
      const noGroups = listed ? [...new Set(points.map((p) => p.x))].filter((x) => !listed.includes(x)).sort((a, b) => a - b) : [];
      if (missing.length) setNote({ label, missing });
      else if (noGroups.length) setNote({ noGroups });
    } catch (e) {
      if (runs.isLatest(ticket)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (runs.isLatest(ticket)) setBusy(null);
    }
  }

  useEffect(() => {
    if (!autoRun.current || !teamOptions.length || !stats.length) return;
    autoRun.current = false;
    if (picked.some((t) => t !== null && teamOptions.includes(t)) && stats.some((s) => s.name === stat)) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires when the lists arrive
  }, [teamOptions, stats]);

  /** A new season keeps the picks and re-charts them once its lists land. */
  function changeSeason(next: string) {
    runs.next();
    setBusy(null);
    setSeason(next);
    setTeamOptions([]);
    setStats([]);
    setNameOf(null);
    setLastWeek(Infinity);
    setChart(null);
    setNote(null);
    autoRun.current = picked.some((t) => t !== null) && Boolean(stat);
  }

  // Hover re-renders the page: group the (391-long) CFB summaries list once.
  const statSections = useMemo(
    () => (sport.groupStats ? statGroups(stats.map((s) => s.name)) : null),
    [sport, stats]
  );

  const series = chart?.series ?? [];
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const xCount = new Set(xs).size;
  const latest = Math.max(...xs);
  // Kept to the lines now drawn: a removal can shorten them.
  const band = bandWithin(chart?.band ?? [], xs);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Trends</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        {weekly ? (
          <>
            {sport.label} week by week within one season ({seasons.length} seasons), up to {MAX_TRENDS_TEAMS}{" "}
            teams on one chart. Every numeric column is a stat.
          </>
        ) : (
          <>
            Team stat trends across every available season ({seasonAssets.length} season files), up to{" "}
            {MAX_TRENDS_TEAMS} teams on one chart. The first chart touches every file, so give it a few seconds.
          </>
        )}
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {TREND_SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                autoRun.current = false;
                runs.next();
                setBusy(null);
                setSportKey(s.key);
                setSeason("");
                setTeamOptions([]);
                setStats([]);
                setNameOf(null);
                setLastWeek(Infinity);
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
        {weekly ? (
          <select
            aria-label="Season"
            value={activeSeason}
            onChange={(e) => changeSeason(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
          >
            {[...seasons].reverse().map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        ) : null}
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
          {statSections
            ? statSections.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.stats.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))
            : stats.map((s) => (
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

      {chart && xCount > 1 ? (
        <div className="rounded-lg border border-border bg-card/70 p-4">
          <h3 data-testid="trends-chart-title" className="mb-2 font-barlow text-lg font-semibold">
            {chart.label}
            {chart.season ? ` · ${chart.season}` : null}
          </h3>
          <TrendsLegend
            series={series}
            band={band}
            population={sport.groups ? "D-I" : "League"}
            meanDigits={chart.meanDigits}
            x={hover ?? latest}
            weekLabel={weekLabel}
          />
          <TrendChart
            series={series}
            band={band}
            label={chart.label}
            weekLabel={weekLabel}
            hover={hover}
            onHover={setHover}
          />
        </div>
      ) : chart && xCount === 1 ? (
        <p className="font-inter text-sm text-muted-foreground">
          Only one {xName} of data for that combination ({xText(weekLabel, latest)}):{" "}
          {series.map((s) => `${s.team} ${s.points[0].display}`).join(", ")}.
        </p>
      ) : null}
    </>
  );
}
