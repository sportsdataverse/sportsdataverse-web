"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge, formatBytes, timeAgo } from "@components/platform/widgets";
import { useAdmin } from "../AdminOverviewClient";

/** Droplet status from `GET /v1/admin/host`: host gauges, cron / one-off job runs
 *  (recorded by bin/jobsh, cron's SHELL), systemd services + timers, Postgres
 *  activity, top processes. Live per-second CPU lives in glances at
 *  data.sportsdataverse.org/ops/; Prefect flows on the Automation page's Pipelines panel. */

type JobRun = {
  run: string;
  name: string;
  src: string | null;
  status: string;
  started: string | null;
  ended: string | null;
  duration_s: number | null;
  rc: number | null;
  alerted: boolean;
  call: string | null;
  cmd: string | null;
  log: string | null;
};

type Proc = { pid: number; user: string; cpu_avg: number; rss: number; elapsed_s: number; args: string };

type Host = {
  ts: string;
  host: {
    load?: number[];
    cpus?: number;
    uptime_s?: number;
    mem?: { total: number; available: number; swap_total: number; swap_free: number };
    disks?: { mount: string; total: number; used: number; free: number }[];
    error?: string;
  };
  processes: { count?: number; by_cpu?: Proc[]; by_mem?: Proc[]; error?: string };
  services: {
    rows?: { unit: string; active: string; sub: string; since: string | null }[];
    failed?: string[];
    error?: string;
  };
  timers: {
    rows?: {
      unit: string;
      activates: string;
      next: string | null;
      last: string | null;
      result: string | null;
      exit_status: string | null;
    }[];
    error?: string;
  };
  db: {
    ok: boolean;
    error?: string;
    size_bytes?: number;
    connections?: Record<string, number>;
    active?: {
      pid: number;
      usename: string | null;
      application_name: string | null;
      state: string | null;
      secs: number | null;
      wait_event_type: string | null;
      query: string | null;
    }[];
  };
  jobs: { latest: JobRun[]; running?: JobRun[]; recent: JobRun[]; error?: string | null };
};

function duration(s: number | null | undefined): string {
  if (s == null) return "–";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function Card({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    // min-w-0: as a grid item a wide table would otherwise stretch the card past the viewport.
    <section className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-barlow text-lg font-semibold">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function ProbeError({ error }: { error?: string | null }) {
  return error ? <p className="font-mono text-xs text-status-failed-ink dark:text-status-failed">{error}</p> : null;
}

function Stat({ label, value, sub, alarm }: { label: string; value: string; sub?: string; alarm?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-inter text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold tracking-tight ${
          alarm ? "text-status-failed-ink dark:text-status-failed" : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 font-inter text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left font-inter text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function JobLog({ run }: { run: string }) {
  const { data, error } = useAdmin<{ path: string | null; lines: string[] }>("joblog", `?run=${encodeURIComponent(run)}&lines=60`);
  if (error) return <p className="text-xs text-muted-foreground">Couldn&apos;t load the log.</p>;
  if (!data) return <p className="text-xs text-muted-foreground">Loading log…</p>;
  return (
    <div>
      <p className="mb-1 font-mono text-xs text-muted-foreground">{data.path ?? "no log file found"}</p>
      {data.lines.length ? (
        <pre className="max-h-80 overflow-auto rounded bg-muted p-2 text-xs">{data.lines.join("\n")}</pre>
      ) : null}
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = { failed: 0, lost: 1, running: 2, ok: 3 };

function JobsTable({ rows, emptyText }: { rows: JobRun[]; emptyText: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table head={["Status", "Job", "Call", "Started", "Duration", "Exit"]}>
      {rows.map((r) => (
        <JobRow key={r.run} r={r} open={open === r.run} toggle={() => setOpen(open === r.run ? null : r.run)} />
      ))}
      {rows.length === 0 ? (
        <tr>
          <td className="px-3 py-2 text-muted-foreground" colSpan={6}>
            {emptyText}
          </td>
        </tr>
      ) : null}
    </Table>
  );
}

function JobRow({ r, open, toggle }: { r: JobRun; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-muted/50" onClick={toggle}>
        <td className="px-3 py-2">
          <StatusBadge status={r.status} />
          {r.alerted ? <span className="ml-1 font-mono text-xs text-muted-foreground">alerted</span> : null}
        </td>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
          {/* The row is clickable for the mouse; this button is the keyboard path. */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`job-${r.run}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className="text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {r.name}
          </button>
        </td>
        <td className="max-w-md truncate px-3 py-2 font-mono text-xs" title={r.call ?? ""}>
          {r.call}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs" title={r.started ?? ""}>
          {timeAgo(r.started)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs">
          {duration(r.duration_s)}
        </td>
        <td className="px-3 py-2 font-mono text-xs">{r.rc ?? "–"}</td>
      </tr>
      {open ? (
        <tr id={`job-${r.run}`} className="border-t border-border bg-muted/30">
          <td className="space-y-2 px-3 py-3" colSpan={6}>
            <p className="break-all font-mono text-xs">
              <span className="text-muted-foreground">{r.src ?? "cron"} $ </span>
              {r.cmd}
            </p>
            <JobLog run={r.run} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ProcTable({ rows, sortLabel }: { rows: Proc[]; sortLabel: string }) {
  return (
    <Table head={["PID", "User", sortLabel === "cpu" ? "CPU (avg)" : "RSS", "Running", "Command"]}>
      {rows.map((p) => (
        <tr key={p.pid} className="border-t border-border">
          <td className="px-3 py-1.5 font-mono text-xs">{p.pid}</td>
          <td className="px-3 py-1.5 text-xs">{p.user}</td>
          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
            {sortLabel === "cpu" ? `${p.cpu_avg.toFixed(1)}%` : formatBytes(p.rss)}
          </td>
          <td className="whitespace-nowrap px-3 py-1.5 text-xs">{duration(p.elapsed_s)}</td>
          <td className="max-w-lg truncate px-3 py-1.5 font-mono text-xs" title={p.args}>
            {p.args}
          </td>
        </tr>
      ))}
    </Table>
  );
}

export default function OpsClient() {
  const { data, error } = useAdmin<Host>("host");
  const [view, setView] = useState<"latest" | "recent">("latest");

  if (error) return <p className="text-sm text-muted-foreground">Couldn&apos;t load host status.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { host, processes, services, timers, db, jobs } = data;
  // The API lists every live run; older Data APIs only had them inside `recent`.
  const running = jobs.running ?? jobs.recent.filter((r) => r.status === "running");
  const latest = [...jobs.latest].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name)
  );
  const memUsedPct = host.mem ? 1 - host.mem.available / host.mem.total : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Ops</h1>
        <p className="font-inter text-xs text-muted-foreground">
          Live CPU:{" "}
          <a className="underline" href="https://data.sportsdataverse.org/ops/" target="_blank" rel="noreferrer">
            glances
          </a>{" "}
          · Prefect flows:{" "}
          <Link className="underline" href="/platform/automation">
            Pipelines
          </Link>{" "}
          · updated {timeAgo(data.ts)}
        </p>
      </div>

      <ProbeError error={host.error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Load (1/5/15m)"
          value={host.load ? host.load.map((l) => l.toFixed(1)).join(" / ") : "–"}
          sub={host.cpus ? `${host.cpus} cores` : undefined}
          alarm={!!(host.load && host.cpus && host.load[1] > host.cpus)}
        />
        <Stat
          label="Memory"
          value={host.mem ? `${Math.round(memUsedPct * 100)}%` : "–"}
          sub={host.mem ? `${formatBytes(host.mem.available)} free of ${formatBytes(host.mem.total)}` : undefined}
          alarm={memUsedPct > 0.9}
        />
        {(host.disks ?? []).map((d) => (
          <Stat
            key={d.mount}
            label={`Disk ${d.mount}`}
            value={`${Math.round((d.used / d.total) * 100)}%`}
            sub={`${formatBytes(d.free)} free of ${formatBytes(d.total)}`}
            alarm={d.used / d.total > 0.9}
          />
        ))}
      </div>

      {running.length ? (
        <Card title={`Running now (${running.length})`}>
          <JobsTable rows={running} emptyText="" />
        </Card>
      ) : null}

      <Card
        title="Jobs"
        extra={
          <div className="flex gap-1">
            {(["latest", "recent"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-0.5 font-inter text-xs font-medium ${
                  view === v ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                {v === "latest" ? "Latest per job" : "All recent runs"}
              </button>
            ))}
          </div>
        }
      >
        <ProbeError error={jobs.error} />
        <JobsTable rows={view === "latest" ? latest : jobs.recent} emptyText="No job runs recorded yet." />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Services">
          <ProbeError error={services.error} />
          {services.failed?.length ? (
            <p className="mb-2 font-inter text-xs text-status-failed-ink dark:text-status-failed">
              Failed units: <span className="font-mono">{services.failed.join(", ")}</span>
            </p>
          ) : null}
          <Table head={["Unit", "State", "Since"]}>
            {(services.rows ?? []).map((s) => (
              <tr key={s.unit} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono text-xs">{s.unit.replace(/\.service$/, "")}</td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={s.active === "active" ? "ok" : s.active === "failed" ? "failed" : s.active} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs">{s.since ?? "–"}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Postgres">
          {db.ok ? (
            <>
              <p className="mb-2 font-inter text-sm">
                {formatBytes(db.size_bytes ?? 0)} ·{" "}
                {Object.entries(db.connections ?? {})
                  .map(([state, n]) => `${n} ${state}`)
                  .join(", ")}
              </p>
              <Table head={["PID", "User / app", "State", "For", "Query"]}>
                {(db.active ?? []).map((q) => (
                  <tr key={q.pid} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{q.pid}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {q.usename}
                      {q.application_name ? ` / ${q.application_name}` : ""}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {q.state}
                      {q.wait_event_type ? ` (${q.wait_event_type})` : ""}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">{duration(q.secs)}</td>
                    <td className="max-w-xs truncate px-3 py-1.5 font-mono text-xs" title={q.query ?? ""}>
                      {q.query}
                    </td>
                  </tr>
                ))}
                {(db.active ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground" colSpan={5}>
                      No active queries.
                    </td>
                  </tr>
                ) : null}
              </Table>
            </>
          ) : (
            <ProbeError error={db.error ?? "unavailable"} />
          )}
        </Card>
      </div>

      <Card title="Timers">
        <ProbeError error={timers.error} />
        <Table head={["Timer", "Last result", "Last run", "Next run"]}>
          {(timers.rows ?? []).map((t) => (
            <tr key={t.unit} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono text-xs">{t.unit.replace(/\.timer$/, "")}</td>
              <td className="px-3 py-1.5">
                <StatusBadge status={t.result === "success" ? "ok" : t.result ? "failed" : "unknown"} />
                {t.result && t.result !== "success" ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {t.result} (exit {t.exit_status})
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs" title={t.last ?? ""}>
                {timeAgo(t.last)}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs">{t.next ? new Date(t.next).toLocaleString() : "–"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`Top processes by CPU (${processes.count ?? 0} total)`}>
          <ProbeError error={processes.error} />
          <ProcTable rows={processes.by_cpu ?? []} sortLabel="cpu" />
        </Card>
        <Card title="Top processes by memory">
          <ProcTable rows={processes.by_mem ?? []} sortLabel="mem" />
        </Card>
      </div>
    </div>
  );
}
