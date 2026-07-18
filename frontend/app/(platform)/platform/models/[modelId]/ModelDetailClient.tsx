"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Sparkline, StatusBadge, timeAgo } from "@components/platform/widgets";
import type { ModelRunDoc } from "@lib/platform/schemas";

type ModelDetailProps = {
  modelId: string;
  /** Newest-first, capped at 50. */
  runs: ModelRunDoc[];
};

const MAX_GATE_COLUMNS = 10;

export default function ModelDetailClient({ modelId, runs }: ModelDetailProps) {
  // Chronological order for trends; newest-first everywhere else.
  const chrono = runs.slice().reverse();
  const metricKeys = Array.from(new Set(chrono.flatMap((r) => Object.keys(r.metrics ?? {}))));
  const gateNames = Array.from(
    new Set(chrono.flatMap((r) => (r.gates ?? []).map((g) => g.name)))
  );
  const gateRuns = runs.slice(0, MAX_GATE_COLUMNS);

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">{modelId}</h1>
          {runs[0] ? <StatusBadge status={runs[0].status} /> : null}
          <span className="font-inter text-sm text-muted-foreground">
            {runs.length} run{runs.length === 1 ? "" : "s"}
            {runs[0] ? ` · latest ${timeAgo(runs[0].created_at)}` : ""}
          </span>
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="font-inter text-sm text-muted-foreground">
          No runs recorded for this model.
        </p>
      ) : (
        <>
          {metricKeys.length > 0 ? (
            <>
              <h3 className="mb-3 font-barlow text-lg font-semibold">Metric trends</h3>
              <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metricKeys.map((key) => {
                  const series = chrono
                    .map((r) => r.metrics?.[key])
                    .filter((v): v is number => typeof v === "number");
                  const latest = series[series.length - 1];
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-border bg-card/70 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-inter text-sm text-muted-foreground">
                          {key}
                        </span>
                        <span className="font-barlow text-lg font-semibold">
                          {latest !== undefined ? latest.toPrecision(4) : "–"}
                        </span>
                      </div>
                      <Sparkline values={series} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {gateNames.length > 0 ? (
            <>
              <h3 className="mb-3 font-barlow text-lg font-semibold">
                Oracle gates <span className="font-inter text-sm font-normal text-muted-foreground">(newest {gateRuns.length} runs, newest first)</span>
              </h3>
              <div className="mb-8 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left font-inter text-sm">
                  <thead className="bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Gate</th>
                      {gateRuns.map((run) => (
                        <th key={run._id} className="px-2 py-2 text-center">
                          <Link href={`/platform/runs/${run._id}`} className="hover:text-primary">
                            {timeAgo(run.created_at)}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gateNames.map((name) => (
                      <tr key={name} className="border-t border-border">
                        <td className="px-4 py-2 font-medium">{name}</td>
                        {gateRuns.map((run) => {
                          const gate = (run.gates ?? []).find((g) => g.name === name);
                          return (
                            <td key={run._id} className="px-2 py-2 text-center" title={
                              gate
                                ? `observed ${gate.observed} ${gate.comparison} ${gate.threshold}`
                                : "not evaluated"
                            }>
                              {gate ? (
                                gate.passed ? (
                                  <Check className="inline h-4 w-4 text-status-success" />
                                ) : (
                                  <X className="inline h-4 w-4 text-destructive" />
                                )
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <h3 className="mb-3 font-barlow text-lg font-semibold">Runs</h3>
          <div className="space-y-2">
            {runs.map((run) => (
              <Link
                key={run._id}
                href={`/platform/runs/${run._id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-4 py-3 hover:border-primary"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="font-inter text-sm font-medium">
                    {run.run_name ?? run._id.slice(-8)}
                  </span>
                  {run.git?.sha ? (
                    <code className="font-mono text-xs text-muted-foreground">
                      {run.git.sha.slice(0, 8)}
                    </code>
                  ) : null}
                </div>
                <span className="font-inter text-xs text-muted-foreground">
                  {timeAgo(run.created_at)} · by {run.created_by}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
