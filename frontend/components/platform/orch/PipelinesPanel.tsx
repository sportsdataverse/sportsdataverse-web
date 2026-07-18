"use client";

import useSWR from "swr";
import fetcher from "@lib/fetcher";
import type { Pipeline } from "@lib/platform/orch-types";
import TriggerForm from "./TriggerForm";
import BudgetBadges from "./BudgetBadges";
import EnvHealth from "./EnvHealth";
import RunsTable from "./RunsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Skeleton } from "@components/ui/skeleton";

/** The Pipelines tab: registry catalog + trigger + budgets + recent runs. */
export default function PipelinesPanel() {
  const { data: pipelines, error } = useSWR<Pipeline[]>(
    "/api/platform/orch/pipelines",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 300_000 }
  );

  if (error) {
    return (
      <p className="py-8 font-mono text-sm text-status-failed">
        pipeline catalog unreachable — is the data API up?
      </p>
    );
  }
  if (!pipelines) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-display text-base">Trigger a run</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <EnvHealth />
              <BudgetBadges />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TriggerForm pipelines={pipelines} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <RunsTable />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pipelines.map((p) => (
          <Card key={p.sport}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">{p.label}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">
                seasons {p.season_min}–{p.season_max}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.cron ? (
                  <span
                    className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    title={`Scheduled ${p.cron} (paused — activate in Prefect)`}
                  >
                    ⏱ {p.cron}
                  </span>
                ) : null}
                {p.warehouse_sport ? (
                  <span
                    className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    title="Can chain a warehouse refresh after the run"
                  >
                    ⛁ warehouse
                  </span>
                ) : null}
                {p.packages.map((pkg) => (
                  <span
                    key={pkg}
                    className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    title="Preflight checks this package clone + install before each run"
                  >
                    {pkg}
                  </span>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {p.stages.map((s) => (
                <div key={s.key} className="flex items-baseline justify-between gap-2">
                  <span
                    className="truncate font-mono text-xs"
                    title={s.note ?? s.label}
                  >
                    {s.key}
                    {p.default_stages.includes(s.key) ? "" : " *"}
                  </span>
                  <span className="truncate text-right font-mono text-[10px] text-muted-foreground">
                    {s.rate_classes.filter((rc) => !rc.startsWith("repo_writer:")).join(" ")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
