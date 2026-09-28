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
 * linking to that view. Two limit-1 reads per league: the season and as-of
 * date (active is relative to it), then the card.
 */
const HOTTEST = Object.keys(ROLLING).map((league) => parseRollingView(new URLSearchParams({ league })));

async function hottest(v: RollingView) {
  const [latest] = await apiRows(metaParams(v.league));
  if (!latest) return null;
  const m = ROLLING[v.league].find((e) => e.metric === v.metric && e.unit === v.unit) ?? ROLLING[v.league][0];
  const order = (ROLLING_TABS.find((t) => t.key === v.tab) ?? ROLLING_TABS[0]).order;
  const asOf = String(latest.as_of_date);
  const params = cardParams(v.league, m, v.win.hero, String(latest.season), activeSince(asOf), order, 1);
  const [row] = (await apiRows(params)) as unknown as RollingRow[];
  return { m, asOf, row };
}

function HottestCard({ view }: { view: RollingView }) {
  const { data, error } = useSWR(["overview-hottest", view.league], () => hottest(view));
  let body: React.ReactNode;
  if (error) body = `Couldn't load: ${error instanceof Error ? error.message : String(error)}`;
  else if (data === undefined) body = "Loading…";
  else if (data === null) body = "No rolling windows published yet.";
  else if (!data.row) body = `No active ${data.m.entity}s with a full window.`;
  else
    body = (
      <>
        <span className="font-medium text-foreground">{data.row.entity_name}</span>{" "}
        <span className="font-mono text-foreground">{formatValue(data.row.cur, data.m.format)}</span> {data.m.label},
        last {windowLabel(view.win.hero, data.m.unit)} · <span className="whitespace-nowrap">as of {data.asOf}</span>
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
