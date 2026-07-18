import type { Metadata } from "next";
import { classifyReleaseTag } from "@content/platform";
import { listRepoReleases } from "@lib/platform/github";
import ExploreClient from "./ExploreClient";
import type { DatasetOption } from "./ExploreClient";

export const metadata: Metadata = { title: "Explore" };

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

export default async function PlatformExplorePage() {
  try {
    const releases = await listRepoReleases(DATA_REPO);
    const datasets: DatasetOption[] = releases.map((rel) => ({
      tag: rel.tag,
      sport: classifyReleaseTag(rel.tag).sport,
      updated: rel.latest_asset_at,
    }));
    return <ExploreClient datasets={datasets} error={null} />;
  } catch (error) {
    return (
      <ExploreClient
        datasets={[]}
        error={error instanceof Error ? error.message : "GitHub error"}
      />
    );
  }
}
