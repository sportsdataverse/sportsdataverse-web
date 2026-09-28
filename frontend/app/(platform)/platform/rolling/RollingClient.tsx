"use client";

import { useState } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { ROLLING, type RollingMetric } from "@content/rolling";
import { formatDelta } from "@lib/platform/scales";
import { apiRows } from "@lib/platform/queryRun";
import {
  ROLLING_TABS,
  activeSince,
  cardParams,
  deltaTone,
  formatUnits,
  formatValue,
  metaParams,
  movers,
  windowLabel,
  type RollingRow,
} from "@lib/platform/rolling";
import { parseRollingView, rollingViewParams, type RollingView } from "@lib/platform/viewState";
import useUrlMirror from "@hooks/useUrlMirror";

/**
 * Who is hot right now: F3's precomputed rolling windows (last N dropbacks,
 * targets, carries, team plays) for the newest season, read through the Query
 * proxy. One read for the season and its as-of date, then one per card; every
 * read is keyed by the view, so a late response never lands under a newer one.
 */

type Params = Record<string, string>;
const rollingRows = async (p: Params) => (await apiRows(p)) as unknown as RollingRow[];

function Delta({ value, m, n }: { value: number | null; m: RollingMetric; n: number }) {
  if (value == null) return <span className="font-mono text-muted-foreground">–</span>;
  return (
    <span className={`whitespace-nowrap font-mono ${deltaTone(value, m.noise[n])}`}>
      {formatDelta(value).glyph} {formatUnits(value, m.format)}
    </span>
  );
}

function HeroCard({ row, m, n }: { row: RollingRow; m: RollingMetric; n: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-inter text-xs font-medium text-primary">
        {m.label}
      </span>
      <div className="mt-3 font-barlow text-4xl font-semibold tabular-nums">{formatValue(row.cur, m.format)}</div>
      <div className="mt-1 text-sm">
        <Delta value={row.delta_season} m={m} n={n} />{" "}
        <span className="font-inter text-xs text-muted-foreground">
          {row.delta_season == null ? "no full window before the season" : "vs season start"}
        </span>
      </div>
      <div className="mt-3 font-inter font-medium">{row.entity_name}</div>
      <div className="font-inter text-xs text-muted-foreground">Last {windowLabel(n, m.unit)}</div>
    </div>
  );
}

function MoverRow({ r, m, n }: { r: RollingRow; m: RollingMetric; n: number }) {
  const prev = r.prev == null ? "–" : formatValue(r.prev, m.format);
  return (
    <tr className="border-t border-border">
      <td className="px-1.5 py-1.5 text-right font-mono text-xs text-muted-foreground sm:px-3">{r.delta_prev_rank}</td>
      <td className="px-1.5 py-1.5 sm:px-3">{r.entity_name}</td>
      <td className="px-1.5 py-1.5 text-right font-mono text-xs sm:px-3">
        {formatValue(r.cur, m.format)}
        {/* phone: Previous stacks under Current, so Δ stays on screen */}
        <span className="block text-muted-foreground sm:hidden">{prev}</span>
      </td>
      <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-muted-foreground sm:table-cell">{prev}</td>
      <td className="px-1.5 py-1.5 text-right text-xs sm:px-3">
        <Delta value={r.delta_prev} m={m} n={n} />
      </td>
    </tr>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <p className="font-inter text-sm text-muted-foreground">{children}</p>
);

export default function RollingClient({ initial }: { initial: RollingView }) {
  const [view, setView] = useState(initial);
  useUrlMirror(rollingViewParams(view));
  // Every change goes back through the URL codec, so the view is always a
  // configured league × metric × unit × window.
  const go = (patch: Params) =>
    setView((v) =>
      parseRollingView(
        new URLSearchParams({
          league: v.league,
          metric: v.metric,
          unit: v.unit,
          window: String(v.window_n),
          tab: v.tab,
          active: v.active ? "1" : "0",
          ...patch,
        })
      )
    );

  const entries = ROLLING[view.league];
  const m = entries.find((e) => e.metric === view.metric && e.unit === view.unit) ?? entries[0];
  const tab = ROLLING_TABS.find((t) => t.key === view.tab) ?? ROLLING_TABS[0];
  const n = view.window_n;

  const meta = useSWR(["rolling-meta", view.league], ([, league]) => apiRows(metaParams(league)));
  const latest = meta.data?.[0];
  const season = latest ? String(latest.season) : null;
  const asOf = latest ? String(latest.as_of_date) : null;
  const since = asOf ? activeSince(asOf) : null;
  const card = (order: string, limit: number) =>
    season ? cardParams(view.league, m, n, season, view.active ? since : null, order, limit) : null;

  const heroParams = card(tab.order, 3);
  const hero = useSWR(heroParams ? ["rolling-hero", heroParams] : null, ([, p]) => rollingRows(p));
  const riseParams = card("-delta_prev", 5);
  const fallParams = card("delta_prev", 5);
  const moves = useSWR(
    riseParams && fallParams ? ["rolling-movers", riseParams, fallParams] : null,
    async ([, r, f]) => movers(...(await Promise.all([rollingRows(r), rollingRows(f)])))
  );
  const error = meta.error ?? hero.error ?? moves.error;
  const who = m.entity === "team" ? "teams" : "players";

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Rolling form</h1>
      </div>
      <p className="mb-6 max-w-[70ch] font-inter text-sm text-muted-foreground">
        Who is hot right now: each player&apos;s or team&apos;s last N events, against the N before them and
        against their form entering the season. Windows count events, not games, so a backup&apos;s last 100
        dropbacks compare fairly with a starter&apos;s.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.keys(ROLLING).map((key) => (
          <button
            key={key}
            onClick={() => go({ league: key })}
            aria-pressed={key === view.league}
            className={`rounded-full px-3 py-1 font-inter text-sm font-medium transition-colors ${
              key === view.league
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {key.toUpperCase()}
          </button>
        ))}
        <select
          aria-label="Metric"
          value={`${m.metric}|${m.unit}`}
          onChange={(e) => {
            const [metric, unit] = e.target.value.split("|");
            go({ metric, unit });
          }}
          className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
        >
          {entries.map((e) => (
            <option key={`${e.metric}|${e.unit}`} value={`${e.metric}|${e.unit}`}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Window"
          value={n}
          onChange={(e) => go({ window: e.target.value })}
          className="rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm"
        >
          {m.windows.map((w) => (
            <option key={w} value={w}>
              Last {windowLabel(w, m.unit)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 font-inter text-sm">
          <input
            type="checkbox"
            checked={view.active}
            onChange={(e) => go({ active: e.target.checked ? "1" : "0" })}
            className="size-4 accent-primary"
          />
          Active only
        </label>
      </div>

      {asOf ? (
        <p data-testid="rolling-span" className="mb-6 font-mono text-xs text-muted-foreground">
          Window: last {windowLabel(n, m.unit)} (full windows only) · as of {asOf} ·{" "}
          {view.active ? `active = an event since ${since}` : "active filter off"} · windows span seasons
        </p>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}
      {meta.data && !latest ? <Muted>No rolling windows are published for {view.league.toUpperCase()} yet.</Muted> : null}

      <Tabs value={view.tab} onValueChange={(t) => go({ tab: t })} className="mb-8">
        <TabsList>
          {ROLLING_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={view.tab} data-testid="rolling-hero">
          {hero.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {hero.data.map((row) => (
                <HeroCard key={row.entity_id} row={row} m={m} n={n} />
              ))}
            </div>
          ) : hero.data ? (
            <Muted>No {who} with a full window{view.active ? ` and an event since ${since}` : ""}.</Muted>
          ) : meta.isLoading || hero.isLoading ? (
            <Muted>Loading…</Muted>
          ) : null}
        </TabsContent>
      </Tabs>

      <section data-testid="rolling-movers" className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <h2 className="font-barlow text-lg font-semibold">Risers and fallers</h2>
        <p className="mb-3 font-inter text-xs text-muted-foreground">
          {m.label} · last {windowLabel(n, m.unit)} vs the {n} before · rank = the move&apos;s rank among every{" "}
          {m.entity} with two full windows
        </p>
        {moves.data && (moves.data.top.length || moves.data.bottom.length) ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left font-inter text-sm">
              <thead className="text-xs text-muted-foreground sm:uppercase">
                <tr>
                  <th className="px-1.5 py-2 text-right sm:px-3">Rank</th>
                  <th className="px-1.5 py-2 sm:px-3">{m.entity === "team" ? "Team" : "Player"}</th>
                  <th className="px-1.5 py-2 text-right sm:px-3">
                    Current<span className="block sm:hidden">Previous</span>
                  </th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Previous</th>
                  <th className="px-1.5 py-2 text-right sm:px-3">Δ</th>
                </tr>
              </thead>
              <tbody>
                {moves.data.top.map((r) => (
                  <MoverRow key={r.entity_id} r={r} m={m} n={n} />
                ))}
                <tr aria-hidden="true">
                  <td colSpan={5} className="h-4" />
                </tr>
                {moves.data.bottom.map((r) => (
                  <MoverRow key={r.entity_id} r={r} m={m} n={n} />
                ))}
              </tbody>
            </table>
          </div>
        ) : moves.data ? (
          <Muted>No {who} with two full windows yet.</Muted>
        ) : meta.isLoading || moves.isLoading ? (
          <Muted>Loading…</Muted>
        ) : null}
      </section>
    </>
  );
}
