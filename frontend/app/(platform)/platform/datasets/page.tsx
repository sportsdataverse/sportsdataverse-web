import type { Metadata } from "next";
import { PLATFORM_REPOS } from "@content/platform";
import { listRepoReleases, settlePool } from "@lib/platform/github";
import DatasetsClient from "./DatasetsClient";
import type { RepoReleases } from "./DatasetsClient";

export const metadata: Metadata = { title: "Datasets" };

/** The one repo whose releases are per-dataset (grouped by sport + producer-linked). */
const DATA_MONOREPO = "sportsdataverse/sportsdataverse-data";

export default async function PlatformDatasetsPage() {
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
  return <DatasetsClient repos={repos} />;
}
