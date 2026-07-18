"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { OctagonX } from "lucide-react";
import fetcher from "@lib/fetcher";
import type {
  Pipeline,
  RunDetail,
  TaskRun,
} from "@lib/platform/orch-types";
import { isTerminal } from "@lib/platform/orch-types";
import type { PrefectGraph } from "@lib/platform/dag";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import DagCanvas from "./DagCanvas";
import LogViewer from "./LogViewer";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/table";

function fmtDuration(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 90) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return m < 90 ? `${m}m ${Math.round(s % 60)}s` : `${(s / 3600).toFixed(1)}h`;
}

/** Live view of one orchestrator run: header, DAG, task table, logs. */
export default function RunDetailView({
  runId,
  initialRun,
  pipelines,
}: {
  runId: string;
  initialRun: RunDetail;
  pipelines: Pipeline[];
}) {
  const { data: run, mutate } = useSWR<RunDetail>(
    `/api/platform/orch/runs/${runId}`,
    fetcher,
    {
      fallbackData: initialRun,
      refreshInterval: (r) => (r && isTerminal(r.state) ? 0 : 5_000),
      revalidateOnFocus: false,
    }
  );
  const active = !isTerminal(run?.state);

  const { data: graph } = useSWR<PrefectGraph>(
    `/api/platform/orch/runs/${runId}/graph`,
    fetcher,
    { refreshInterval: active ? 5_000 : 0, revalidateOnFocus: false }
  );
  const { data: tasks } = useSWR<TaskRun[]>(
    `/api/platform/orch/runs/${runId}/task-runs`,
    fetcher,
    { refreshInterval: active ? 5_000 : 0, revalidateOnFocus: false }
  );

  const sport =
    typeof run?.parameters?.sport === "string" ? run.parameters.sport : null;
  const pipeline = pipelines.find((p) => p.sport === sport) ?? null;
  const selectedStages = Array.isArray(run?.parameters?.stages)
    ? (run?.parameters?.stages as string[])
    : null;

  async function cancel() {
    const res = await fetch(`/api/platform/orch/runs/${runId}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Cancellation requested");
      mutate();
    } else {
      toast.error(`Cancel failed (HTTP ${res.status})`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {run?.name || runId.slice(0, 8)}
            </h1>
            <StatusBadge status={run?.state} />
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {run?.deployment ?? "run"} · started{" "}
            {run?.start_time ? timeAgo(run.start_time) : "—"} · duration{" "}
            {fmtDuration(run?.total_run_time)}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/80">
            {Object.entries(run?.parameters ?? {})
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join("  ")}
          </p>
        </div>
        {active ? (
          <Button variant="destructive" size="sm" className="gap-2" onClick={cancel}>
            <OctagonX className="size-4" /> Cancel run
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <DagCanvas
            graph={graph ?? null}
            pipeline={pipeline}
            selectedStages={selectedStages}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Task runs</CardTitle>
        </CardHeader>
        <CardContent>
          {!tasks?.length ? (
            <p className="py-4 text-center font-mono text-sm text-muted-foreground">
              {active ? "waiting for tasks to start…" : "no task runs recorded"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">State</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="w-24 text-right">Duration</TableHead>
                  <TableHead className="w-20 text-right">Retries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => (
                  <TableRow key={t.task_run_id}>
                    <TableCell>
                      <StatusBadge status={t.state} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.name}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtDuration(t.duration_s)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {t.retries || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <LogViewer runId={runId} active={active} />
        </CardContent>
      </Card>
    </div>
  );
}
