"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, Trash2, X } from "lucide-react";
import { StatusBadge, timeAgo } from "@components/platform/widgets";
import { Button } from "@components/ui/button";
import type { ModelRunDoc } from "@lib/platform/schemas";

function KeyValueTable({ data }: { data: Record<string, string | number | boolean> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className="font-inter text-sm text-muted-foreground">None recorded.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left font-inter text-sm">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-t border-border first:border-t-0">
              <td className="px-4 py-2 font-medium">{key}</td>
              <td className="px-4 py-2 font-mono text-xs">
                {typeof value === "number" ? value.toPrecision(6) : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RunDetailClient({ run }: { run: ModelRunDoc | null }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!run) return;
    if (!window.confirm(`Delete this ${run.model_id} run? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/runs/${run._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Delete failed");
      router.push(`/platform/models/${run.model_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (!run) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight">Run not found</h1>
        </div>
        <p className="font-inter text-sm text-muted-foreground">
          Run not found.{" "}
          <Link href="/platform/models" className="text-primary hover:underline">
            Back to models
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/platform/models/${run.model_id}`}
            className="inline-flex items-center gap-1 font-inter text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> {run.model_id}
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {run.run_name ?? run._id.slice(-8)}
          </h1>
          <StatusBadge status={run.status} />
        </div>
        <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="mr-1 h-4 w-4 text-destructive" />
          {deleting ? "Deleting…" : "Delete run"}
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-inter text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <p className="mb-6 font-inter text-sm text-muted-foreground">
        {run.sport} · recorded {timeAgo(run.created_at)} by {run.created_by}
        {run.started_at ? ` · started ${timeAgo(run.started_at)}` : ""}
        {run.finished_at ? ` · finished ${timeAgo(run.finished_at)}` : ""}
        {run.git?.repo ? (
          <>
            {" · "}
            <a
              href={`https://github.com/${run.git.repo}${run.git.sha ? `/commit/${run.git.sha}` : ""}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {run.git.repo}
              {run.git.sha ? `@${run.git.sha.slice(0, 8)}` : ""}
            </a>
          </>
        ) : null}
      </p>

      {run.tags.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {run.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {run.gates.length > 0 ? (
        <>
          <h3 className="mb-3 font-barlow text-lg font-semibold">Oracle gates</h3>
          <div className="mb-8 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left font-inter text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Gate</th>
                  <th className="px-4 py-2">Observed</th>
                  <th className="px-4 py-2">Threshold</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {run.gates.map((gate) => (
                  <tr key={gate.name} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{gate.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{gate.observed}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {gate.comparison === "lte" ? "≤" : "≥"} {gate.threshold}
                    </td>
                    <td className="px-4 py-2">
                      {gate.passed ? (
                        <Check className="h-4 w-4 text-status-success" />
                      ) : (
                        <X className="h-4 w-4 text-destructive" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-barlow text-lg font-semibold">Metrics</h3>
          <KeyValueTable data={run.metrics} />
        </div>
        <div>
          <h3 className="mb-3 font-barlow text-lg font-semibold">Params</h3>
          <KeyValueTable data={run.params} />
        </div>
      </div>

      {run.artifacts.length > 0 ? (
        <>
          <h3 className="mb-3 font-barlow text-lg font-semibold">Artifacts</h3>
          <ul className="mb-8 space-y-1">
            {run.artifacts.map((artifact) => (
              <li key={artifact.url}>
                <a
                  href={artifact.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-inter text-sm text-primary hover:underline"
                >
                  {artifact.name} <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {run.notes ? (
        <>
          <h3 className="mb-3 font-barlow text-lg font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap font-inter text-sm text-muted-foreground">
            {run.notes}
          </p>
        </>
      ) : null}
    </>
  );
}
