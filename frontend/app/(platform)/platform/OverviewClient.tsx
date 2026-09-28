"use client";

import Link from "next/link";
import useSWR from "swr";
import { Bot, Database, Flame, FlaskConical, HardDrive } from "lucide-react";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import { PLATFORM_REPOS } from "@content/platform";
import { ROLLING } from "@content/rolling";
import { apiRows } from "@lib/platform/queryRun";
import { ROLLING_TABS, activeSince, cardParams, formatValue, metaParams, windowLabel, type RollingRow } from "@lib/platform/rolling";
import type { DbStatusDoc, ModelRunDoc, ModelSummary } from "@lib/platform/schemas";
import { parseRollingView, rollingHref, type RollingView } from "@lib/platform/viewState";

type OverviewProps = {
  models: ModelSummary[];
  recentRuns: ModelRunDoc[];
  dbStatuses: DbStatusDoc[];
};

/**
 * "Hottest right now": per league, the #1 of /platform/rolling's default view
 * (its Best card: first metric, smallest window, active, full windows only),
 * linking to that view. It makes the rolling page's own two reads under its own
 * SWR keys (the season and as-of date, then the hero card's top 3) and shows
 * row 0, so the #1 is the page's #1 (the API has no tie-break column) and a
 * click-through renders from the cache.
 */
const HOTTEST = Object.keys(ROLLING).map((league) => parseRollingView(new URLSearchParams({ league })));

function HottestCard({ view }: { view: RollingView }) {
  // The view came through parseRollingView, so its entry and tab exist.
  const m = ROLLING[view.league].find((e) => e.metric === view.metric && e.unit === view.unit)!;
  const order = ROLLING_TABS.find((t) => t.key === view.tab)!.order;
  const meta = useSWR(["rolling-meta", view.league], ([, league]) => apiRows(metaParams(league)));
  const latest = meta.data?.[0];
  const asOf = latest ? String(latest.as_of_date) : null;
  const heroParams =
    latest && asOf ? cardParams(view.league, m, view.win.hero, String(latest.season), activeSince(asOf), order, 3) : null;
  const hero = useSWR(heroParams ? ["rolling-hero", heroParams] : null, async ([, p]) => (await apiRows(p)) as unknown as RollingRow[]);
  const error = meta.error ?? hero.error;
  const row = hero.data?.[0];
  let body: React.ReactNode;
  if (error) body = `Couldn't load: ${error instanceof Error ? error.message : String(error)}`;
  else if (meta.data && !latest) body = "No rolling windows published yet.";
  else if (!hero.data) body = "Loading…";
  else if (!row) body = `No active ${m.entity}s with a full window.`;
  else
    body = (
      <>
        <span className="font-medium text-foreground">{row.entity_name}</span>{" "}
        <span className="font-mono text-foreground">{formatValue(row.cur, m.format)}</span> {m.label},
        last {windowLabel(view.win.hero, m.unit)} · <span className="whitespace-nowrap">as of {asOf}</span>
      </>
    );
  return (
    <Link
      href={rollingHref(view)}
      className="rounded-lg border border-border bg-card/70 p-5 transition-colors hover:border-primary"
    >
      <div className="mb-2 flex items-center gap-2">
        <Flame className="h-5 w-5 text-primary" />
        <span className="font-barlow text-lg font-semibold">{view.league.toUpperCase()}</span>
      </div>
      <p className="font-inter text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}

export default function OverviewClient({ models, recentRuns, dbStatuses }: OverviewProps) {
  const cards = [
    {
      href: "/platform/automation",
      icon: Bot,
      title: "Automation",
      body: `${PLATFORM_REPOS.length} tracked repos — scraper & builder workflow status, manual dispatch.`,
    },
    {
      href: "/platform/datasets",
      icon: Database,
      title: "Datasets",
      body: `Release artifacts across ${PLATFORM_REPOS.filter((r) => r.hasReleases).length} data repos.`,
    },
    {
      href: "/platform/models",
      icon: FlaskConical,
      title: "Models",
      body: `${models.length} tracked model${models.length === 1 ? "" : "s"} — training runs, metrics, oracle gates.`,
    },
    {
      href: "/platform/database",
      icon: HardDrive,
      title: "Database",
      body: dbStatuses.length
        ? `${dbStatuses.length} source${dbStatuses.length === 1 ? "" : "s"} reporting — latest heartbeat ${timeAgo(dbStatuses[0]?.collected_at)}.`
        : "No heartbeats yet — wire the droplet cron (see SETUP-platform.md).",
    },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-border bg-card/70 p-5 transition-colors hover:border-primary"
          >
            <div className="mb-2 flex items-center gap-2">
              <card.icon className="h-5 w-5 text-primary" />
              <span className="font-barlow text-lg font-semibold">{card.title}</span>
            </div>
            <p className="font-inter text-sm text-muted-foreground">{card.body}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 font-barlow text-xl font-semibold">Hottest right now</h2>
      <div data-testid="overview-hottest" className="grid gap-4 sm:grid-cols-2">
        {HOTTEST.map((view) => (
          <HottestCard key={view.league} view={view} />
        ))}
      </div>

      <h2 className="mb-3 mt-10 font-barlow text-xl font-semibold">Recent runs</h2>
      {recentRuns.length === 0 ? (
        <p className="font-inter text-sm text-muted-foreground">
          No runs recorded yet. POST one to <code>/api/platform/runs</code> — recipe in
          SETUP-platform.md.
        </p>
      ) : (
        <div className="space-y-2">
          {recentRuns.map((run) => (
            <Link
              key={run._id}
              href={`/platform/runs/${run._id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 hover:border-primary"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={run.status} />
                <span className="font-barlow font-semibold">{run.model_id}</span>
                <span className="font-inter text-sm text-muted-foreground">
                  {run.run_name ?? run.sport}
                </span>
              </div>
              <span className="font-inter text-xs text-muted-foreground">
                {timeAgo(run.created_at)} · by {run.created_by}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
