import type { GetServerSidePropsContext } from "next";
import PlatformShell, { StatusBadge, formatBytes, timeAgo } from "@components/platform/PlatformShell";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import { listDbStatuses } from "@lib/platform/dbStatus";
import type { DbStatusDoc } from "@lib/platform/schemas";

type DatabaseProps = {
  session: PlatformSessionProps;
  statuses: DbStatusDoc[];
};

/** A heartbeat older than this is flagged stale (droplet cron is daily). */
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

function statusOf(status: DbStatusDoc): string {
  if (!status.ok) return "failed";
  const age = Date.now() - Date.parse(status.collected_at);
  return Number.isNaN(age) || age > STALE_AFTER_MS ? "stale" : "ok";
}

export default function PlatformDatabase({ session, statuses }: DatabaseProps) {
  return (
    <PlatformShell session={session} title="Database">
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Postgres warehouse heartbeats, pushed by the sdv-data droplet cron. The site
        never dials the database — its ports stay closed to the public internet.
      </p>
      {statuses.length === 0 ? (
        <p className="font-inter text-sm text-muted-foreground">
          No heartbeats received yet. Wire the droplet cron to POST{" "}
          <code>/api/platform/db-status</code> — recipe in SETUP-platform.md.
        </p>
      ) : (
        <div className="space-y-8">
          {statuses.map((status) => (
            <section
              key={status.source}
              className="rounded-lg border border-gray-200 bg-white/70 p-5 dark:border-gray-700 dark:bg-darkSecondary/70"
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="font-barlow text-xl font-semibold">
                  {status.host_label ?? status.source}
                </h2>
                <StatusBadge status={statusOf(status)} />
                <span className="font-inter text-xs text-muted-foreground">
                  heartbeat {timeAgo(status.collected_at)} · received {timeAgo(status.received_at)}
                </span>
              </div>

              {status.error ? (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 font-inter text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {status.error}
                </div>
              ) : null}

              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Postgres", value: status.postgres_version ?? "–" },
                  {
                    label: "Size",
                    value: status.db_size_bytes != null ? formatBytes(status.db_size_bytes) : "–",
                  },
                  {
                    label: "Tables",
                    value: status.table_count != null ? String(status.table_count) : "–",
                  },
                  {
                    label: "Rows (est.)",
                    value:
                      status.row_estimate != null
                        ? status.row_estimate.toLocaleString("en-US")
                        : "–",
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="font-inter text-xs uppercase text-muted-foreground">
                      {stat.label}
                    </div>
                    <div className="truncate font-barlow text-lg font-semibold" title={stat.value}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {status.datasets.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-left font-inter text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-muted-foreground dark:bg-gray-800/60">
                      <tr>
                        <th className="px-4 py-2">Dataset</th>
                        <th className="px-4 py-2">Rows</th>
                        <th className="px-4 py-2">Last updated</th>
                        <th className="px-4 py-2">Latest row</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.datasets.map((dataset) => (
                        <tr
                          key={dataset.name}
                          className="border-t border-gray-200 dark:border-gray-700"
                        >
                          <td className="px-4 py-2 font-medium">{dataset.name}</td>
                          <td className="px-4 py-2">
                            {dataset.rows != null ? dataset.rows.toLocaleString("en-US") : "–"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {timeAgo(dataset.last_updated)}
                          </td>
                          <td
                            className="max-w-[16rem] truncate px-4 py-2 font-mono text-xs text-muted-foreground"
                            title={dataset.latest_row ?? undefined}
                          >
                            {dataset.latest_row ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getPlatformSessionProps(ctx);
  if (!session.authorized) {
    return { props: { session, statuses: [] } };
  }
  const statuses = await listDbStatuses().catch(() => []);
  return { props: { session, statuses } };
}
