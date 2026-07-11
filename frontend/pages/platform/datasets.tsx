import type { GetServerSidePropsContext } from "next";
import PlatformShell, { formatBytes, timeAgo } from "@components/platform/PlatformShell";
import { PLATFORM_REPOS } from "@content/platform";
import type { PlatformSessionProps } from "@lib/platform/auth";
import { getPlatformSessionProps } from "@lib/platform/auth";
import { listRepoReleases } from "@lib/platform/github";
import type { ReleaseSummary } from "@lib/platform/github";

type RepoReleases = {
  repo: string;
  sport: string;
  releases: ReleaseSummary[];
  error: string | null;
};

type DatasetsProps = {
  session: PlatformSessionProps;
  repos: RepoReleases[];
};

export default function PlatformDatasets({ session, repos }: DatasetsProps) {
  return (
    <PlatformShell session={session} title="Datasets">
      <p className="mb-6 font-inter text-sm text-muted-foreground">
        Release artifacts across the org&apos;s data repos — the distribution surface the
        loaders (<code>load_*</code>) read from.
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
            </div>
            {entry.error ? (
              <p className="font-inter text-sm text-red-600 dark:text-red-400">
                Failed to load: {entry.error}
              </p>
            ) : entry.releases.length === 0 ? (
              <p className="font-inter text-sm text-muted-foreground">No releases.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-left font-inter text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-muted-foreground dark:bg-gray-800/60">
                    <tr>
                      <th className="px-4 py-2">Release</th>
                      <th className="px-4 py-2">Assets</th>
                      <th className="px-4 py-2">Total size</th>
                      <th className="px-4 py-2">Published</th>
                      <th className="px-4 py-2">Newest asset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.releases.map((rel) => (
                      <tr key={rel.tag} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="px-4 py-2 font-medium">
                          <a
                            href={rel.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-primary"
                          >
                            {rel.name || rel.tag}
                          </a>
                        </td>
                        <td className="px-4 py-2">{rel.asset_count}</td>
                        <td className="px-4 py-2">{formatBytes(rel.total_size)}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {timeAgo(rel.published_at)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {rel.assets[0]
                            ? `${rel.assets[0].name} · ${timeAgo(rel.assets[0].updated_at)}`
                            : "–"}
                        </td>
                      </tr>
                    ))}
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
  const session = await getPlatformSessionProps(ctx);
  if (!session.authorized) {
    return { props: { session, repos: [] } };
  }
  const tracked = PLATFORM_REPOS.filter((r) => r.hasReleases);
  const settled = await Promise.allSettled(tracked.map((r) => listRepoReleases(r.repo)));
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
  return { props: { session, repos } };
}
