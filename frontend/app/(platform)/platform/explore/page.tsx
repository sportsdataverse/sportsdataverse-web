import type { Metadata } from "next";
import { classifyReleaseTag } from "@content/platform";
import { listRepoReleases } from "@lib/platform/github";
import { parseExploreView, toSearchParams } from "@lib/platform/viewState";
import ExploreClient from "./ExploreClient";
import type { DatasetOption } from "./ExploreClient";

export const metadata: Metadata = { title: "Explore" };

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

export default async function PlatformExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = parseExploreView(toSearchParams(await searchParams));
  try {
    const releases = await listRepoReleases(DATA_REPO);
    const datasets: DatasetOption[] = releases.map((rel) => ({
      tag: rel.tag,
      sport: classifyReleaseTag(rel.tag).sport,
      updated: rel.latest_asset_at,
    }));
    return <ExploreClient datasets={datasets} error={null} initial={initial} />;
  } catch (error) {
    return (
      <ExploreClient
        datasets={[]}
        error={error instanceof Error ? error.message : "GitHub error"}
        initial={initial}
      />
    );
  }
}
