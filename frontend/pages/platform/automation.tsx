import { useState } from "react";
import type { GetServerSidePropsContext } from "next";
import useSWR from "swr";
import { ExternalLink, Play, RefreshCw } from "lucide-react";
import PlatformShell, { StatusBadge, timeAgo } from "@components/platform/PlatformShell";
import { Button } from "@components/ui/button";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import type { AutomationRepo } from "../../app/api/platform/automation/route";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
  return data.message as AutomationRepo[];
};

export default function PlatformAutomation({ platformSession: session }: { platformSession: PlatformSessionProps }) {
  const { data, error, isLoading, mutate, isValidating } = useSWR(
    session.authorized ? "/api/platform/automation" : null,
    fetcher,
    // Each refresh fans out over 40+ repos x 2 GitHub calls. At 60s an open tab
    // alone burned ~85+ calls/min against the 5,000/h budget. The server now
    // uses ETag/304 + a freshness window (lib/platform/github.ts), and 15 min is
    // plenty fresh for workflow status. Use the manual refresh for immediacy.
    { refreshInterval: 900_000, revalidateOnFocus: false }
  );
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function dispatch(repo: string, workflow: string) {
    if (!window.confirm(`Trigger ${workflow} on ${repo}?`)) return;
    const key = `${repo}/${workflow}`;
    setDispatching(key);
    setNotice(null);
    try {
      const res = await fetch("/api/platform/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, workflow }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Dispatch failed");
      setNotice({ kind: "ok", text: data.message });
      // Give GitHub a beat to register the queued run, then refresh.
      setTimeout(() => mutate(), 3000);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Dispatch failed" });
    } finally {
      setDispatching(null);
    }
  }

  return (
    <PlatformShell session={session} title="Automation">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-inter text-sm text-muted-foreground">
          Workflow status across the tracked org repos — refreshes every minute.
        </p>
        <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {notice ? (
        <div
          className={`mb-4 rounded-md border px-4 py-3 font-inter text-sm ${
            notice.kind === "ok"
              ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
              : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 font-inter text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error.message}
        </div>
      ) : null}
      {isLoading ? (
        <p className="font-inter text-sm text-muted-foreground">Loading workflows…</p>
      ) : null}

      <div className="space-y-6">
        {(data ?? []).map((repo) => (
          <section key={repo.repo}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <a
                href={`https://github.com/${repo.repo}/actions`}
                target="_blank"
                rel="noreferrer"
                className="font-barlow text-lg font-semibold hover:text-primary"
              >
                {repo.repo}
              </a>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary dark:bg-white/10 dark:text-sky-300">
                {repo.sport} · {repo.kind}
              </span>
            </div>
            {repo.error ? (
              <p className="font-inter text-sm text-red-600 dark:text-red-400">
                Failed to load: {repo.error}
              </p>
            ) : repo.workflows.length === 0 ? (
              <p className="font-inter text-sm text-muted-foreground">No workflows.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-left font-inter text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-muted-foreground dark:bg-gray-800/60">
                    <tr>
                      <th className="px-4 py-2">Workflow</th>
                      <th className="px-4 py-2">Last run</th>
                      <th className="px-4 py-2">Trigger</th>
                      <th className="px-4 py-2">When</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repo.workflows.map((wf) => {
                      const run = wf.latest_run;
                      const key = `${repo.repo}/${wf.file}`;
                      const canDispatch = repo.dispatchable.includes(wf.file);
                      return (
                        <tr key={wf.id} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="px-4 py-2 font-medium">
                            {wf.name}
                            {wf.state !== "active" ? (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {wf.state.replace(/_/g, " ")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2">
                            {run ? (
                              <a
                                href={run.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-primary"
                              >
                                <StatusBadge
                                  status={run.status === "completed" ? run.conclusion : run.status}
                                />
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <StatusBadge status="none" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{run?.event ?? "–"}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {timeAgo(run?.updated_at)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {canDispatch ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={dispatching === key}
                                onClick={() => dispatch(repo.repo, wf.file)}
                              >
                                <Play className="mr-1 h-3 w-3" />
                                {dispatching === key ? "Dispatching…" : "Run"}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  return { props: { platformSession: await getPlatformSessionProps(ctx) } };
}
