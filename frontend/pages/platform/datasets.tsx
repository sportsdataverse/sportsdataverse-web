import type { GetServerSidePropsContext } from "next";
import { ScrollText } from "lucide-react";
import PlatformShell, { formatBytes, timeAgo } from "@components/platform/PlatformShell";
import { PLATFORM_REPOS, classifyReleaseTag } from "@content/platform";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import { listRepoReleases, settlePool } from "@lib/platform/github";
import type { ReleaseSummary } from "@lib/platform/github";

type RepoReleases = {
  repo: string;
  sport: string;
  releases: ReleaseSummary[];
  error: string | null;
};

type DatasetsProps = {
  platformSession: PlatformSessionProps;
  repos: RepoReleases[];
};

/** The one repo whose releases are per-dataset (grouped by sport + producer-linked). */
const DATA_MONOREPO = "sportsdataverse/sportsdataverse-data";

function ProducerLink({ producer }: { producer: string }) {
  if (!producer) return <span className="text-muted-foreground">–</span>;
  const short = producer.split("/")[1] ?? producer;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <a
        href={`https://github.com/${producer}`}
        target="_blank"
        rel="noreferrer"
        className="hover:text-primary"
      >
        {short}
      </a>
      <a
        href={`https://github.com/${producer}/actions`}
        target="_blank"
        rel="noreferrer"
        title={`${short} workflow runs (logs)`}
        aria-label={`${short} workflow logs`}
        className="text-muted-foreground hover:text-primary"
      >
        <ScrollText className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

function ReleaseTable({ releases, grouped }: { releases: ReleaseSummary[]; grouped: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-left font-inter text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-muted-foreground dark:bg-gray-800/60">
          <tr>
            <th className="px-4 py-2">Release</th>
            {grouped ? <th className="px-4 py-2">Provider</th> : null}
            <th className="px-4 py-2">Assets</th>
            <th className="px-4 py-2">Size</th>
            <th className="px-4 py-2">Updated</th>
            <th className="px-4 py-2">Published</th>
            {grouped ? <th className="px-4 py-2">Producer / logs</th> : null}
          </tr>
        </thead>
        <tbody>
          {releases.map((rel) => {
            const group = grouped ? classifyReleaseTag(rel.tag) : null;
            return (
              <tr key={rel.tag} className="border-t border-gray-200 dark:border-gray-700">
                <td className="px-4 py-2 font-medium">
                  <a
                    href={rel.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary"
                    title={rel.assets[0] ? `newest asset: ${rel.assets[0].name}` : undefined}
                  >
                    {rel.name || rel.tag}
                  </a>
                </td>
                {group ? (
                  <td className="px-4 py-2 text-muted-foreground">{group.provider}</td>
                ) : null}
                <td className="px-4 py-2">{rel.asset_count}</td>
                <td className="px-4 py-2">{formatBytes(rel.total_size)}</td>
                <td className="px-4 py-2 text-muted-foreground">{timeAgo(rel.latest_asset_at)}</td>
                <td className="px-4 py-2 text-muted-foreground">{timeAgo(rel.published_at)}</td>
                {group ? (
                  <td className="px-4 py-2">
                    <ProducerLink producer={group.producer} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Group the data-monorepo's releases by sport, newest-activity group first. */
function groupBySport(releases: ReleaseSummary[]): [string, ReleaseSummary[]][] {
  const groups = new Map<string, ReleaseSummary[]>();
  for (const rel of releases) {
    const { sport } = classifyReleaseTag(rel.tag);
    const bucket = groups.get(sport);
    if (bucket) bucket.push(rel);
    else groups.set(sport, [rel]);
  }
  // Releases arrive sorted by latest_asset_at desc, so each group's first
  // entry is its freshest — order groups by that.
  return Array.from(groups.entries()).sort((a, b) =>
    (a[1][0]?.latest_asset_at ?? "") < (b[1][0]?.latest_asset_at ?? "") ? 1 : -1
  );
}

export default function PlatformDatasets({ platformSession: session, repos }: DatasetsProps) {
  return (
    <PlatformShell session={session} title="Datasets">
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Release artifacts across the org&apos;s data repos — the distribution surface the
        loaders (<code>load_*</code>) read from. sportsdataverse-data is grouped by
        sport; each release links the repo whose jobs produce it.
      </p>
      <div className="space-y-8">
        {repos.map((entry) => (
          <section key={entry.repo}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <a
                href={`https://github.com/${entry.repo}/releases`}
                target="_blank"
                rel="noreferrer"
                className="font-barlow text-lg font-semibold hover:text-primary"
              >
                {entry.repo}
              </a>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary dark:bg-white/10 dark:text-sky-300">
                {entry.sport}
              </span>
              <span className="font-inter text-xs text-muted-foreground">
                {entry.releases.length} release{entry.releases.length === 1 ? "" : "s"}
              </span>
            </div>
            {entry.error ? (
              <p className="font-inter text-sm text-red-600 dark:text-red-400">
                Failed to load: {entry.error}
              </p>
            ) : entry.releases.length === 0 ? (
              <p className="font-inter text-sm text-muted-foreground">No releases.</p>
            ) : entry.repo === DATA_MONOREPO ? (
              <div className="space-y-5">
                {groupBySport(entry.releases).map(([sport, releases]) => (
                  <div key={sport}>
                    <h3 className="mb-2 font-barlow text-base font-semibold uppercase tracking-wide text-muted-foreground">
                      {sport}{" "}
                      <span className="font-inter text-xs font-normal normal-case">
                        ({releases.length})
                      </span>
                    </h3>
                    <ReleaseTable releases={releases} grouped />
                  </div>
                ))}
              </div>
            ) : (
              <ReleaseTable releases={entry.releases} grouped={false} />
            )}
          </section>
        ))}
      </div>
    </PlatformShell>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const session = await getPlatformSessionProps(ctx);
  if (!session.authorized) {
    return { props: { platformSession: session, repos: [] } };
  }
  const tracked = PLATFORM_REPOS.filter((r) => r.hasReleases);
  const settled = await settlePool(tracked, (r) => listRepoReleases(r.repo));
  const repos: RepoReleases[] = tracked.map((entry, i) => {
    const outcome = settled[i];
    return {
      repo: entry.repo,
      sport: entry.sport,
      releases: outcome.status === "fulfilled" ? outcome.value : [],
      error:
        outcome.status === "rejected"
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason)
          : null,
    };
  });
  // The data monorepo carries the canonical per-dataset releases — list it first.
  repos.sort((a, b) => Number(b.repo === DATA_MONOREPO) - Number(a.repo === DATA_MONOREPO));
  return { props: { platformSession: session, repos } };
}
