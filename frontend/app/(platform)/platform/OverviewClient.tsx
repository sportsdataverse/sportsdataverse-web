"use client";

import Link from "next/link";
import { Bot, Database, FlaskConical, HardDrive } from "lucide-react";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import { PLATFORM_REPOS } from "@content/platform";
import type { DbStatusDoc, ModelRunDoc, ModelSummary } from "@lib/platform/schemas";

type OverviewProps = {
  models: ModelSummary[];
  recentRuns: ModelRunDoc[];
  dbStatuses: DbStatusDoc[];
};

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
            className="rounded-lg border border-gray-200 bg-white/70 p-5 transition-colors hover:border-primary dark:border-gray-700 dark:bg-darkSecondary/70"
          >
            <div className="mb-2 flex items-center gap-2">
              <card.icon className="h-5 w-5 text-primary" />
              <span className="font-barlow text-lg font-semibold">{card.title}</span>
            </div>
            <p className="font-inter text-sm text-muted-foreground">{card.body}</p>
          </Link>
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/70 px-4 py-3 hover:border-primary dark:border-gray-700 dark:bg-darkSecondary/70"
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
