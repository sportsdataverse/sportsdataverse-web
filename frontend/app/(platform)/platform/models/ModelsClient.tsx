"use client";

import Link from "next/link";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import type { ModelSummary } from "@lib/platform/schemas";

export default function ModelsClient({ models }: { models: ModelSummary[] }) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Models</h1>
      </div>
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        One row per tracked model — grouped from ingested training runs. Gate counts
        reflect the latest run.
      </p>
      {models.length === 0 ? (
        <p className="font-inter text-sm text-muted-foreground">
          Nothing tracked yet. POST a run to <code>/api/platform/runs</code> — recipe in
          SETUP-platform.md.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left font-inter text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Sport</th>
                <th className="px-4 py-2">Runs</th>
                <th className="px-4 py-2">Latest run</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Gates</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.model_id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/platform/models/${model.model_id}`}
                      className="hover:text-primary"
                    >
                      {model.model_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{model.sport}</td>
                  <td className="px-4 py-2">{model.run_count}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {timeAgo(model.latest_run_at)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={model.latest_status} />
                  </td>
                  <td className="px-4 py-2">
                    {model.gates_total === 0 ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      <StatusBadge
                        status={model.gates_passed === model.gates_total ? "passed" : "failed"}
                      />
                    )}
                    {model.gates_total > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {model.gates_passed}/{model.gates_total}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
