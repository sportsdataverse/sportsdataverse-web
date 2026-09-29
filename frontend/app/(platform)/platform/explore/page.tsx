import type { Metadata } from "next";
import { classifyReleaseTag } from "@content/platform";
import { listRepoReleases } from "@lib/platform/github";
import { parseExploreView, parseGridView, toSearchParams } from "@lib/platform/viewState";
import ExploreClient from "./ExploreClient";
import type { DatasetOption } from "./ExploreClient";

export const metadata: Metadata = { title: "Explore" };

const DATA_REPO = "sportsdataverse/sportsdataverse-data";

export default async function PlatformExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = toSearchParams(await searchParams);
  const initial = parseExploreView(sp);
  // JSX is constructed once, after the try/catch, so a render error here would
  // actually be caught by an error boundary (constructing it inside try/catch
  // does not, since React doesn't render synchronously).
  let datasets: DatasetOption[] = [];
  let errorMessage: string | null = null;
  try {
    const releases = await listRepoReleases(DATA_REPO);
    datasets = releases.map((rel) => ({
      tag: rel.tag,
      sport: classifyReleaseTag(rel.tag).sport,
      updated: rel.latest_asset_at,
    }));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "GitHub error";
  }
  return <ExploreClient datasets={datasets} error={errorMessage} initial={initial} initialGrid={parseGridView(sp)} />;
}
