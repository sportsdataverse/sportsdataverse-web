import type { Metadata } from "next";
import pageMeta from "@content/meta";
import PageHeader from "@components/site/PageHeader";
import { connectToDatabase } from "@lib/mongodb";
import { PUBLIC_PACKAGE_FILTER } from "@lib/packageVisibility";
import { listDbStatuses } from "@lib/platform/dbStatus";
import { warehouseFigures } from "@lib/warehouseFigures";
import { listRepoReleases } from "@lib/platform/github";
import StatsCard from "@components/Stats/StatsCard";
import StatsClient from "./StatsClient";

export const metadata: Metadata = {
  title: pageMeta.stats.title,
  description:
    "The SportsDataverse by the numbers: warehouse rows, leagues, datasets, and the GitHub footprint.",
  keywords: pageMeta.stats.keywords,
  openGraph: { images: [{ url: pageMeta.stats.image }] },
};

/** Re-read the live sources at most once an hour. */
export const revalidate = 3600;

const RELEASES_REPO = "sportsdataverse/sportsdataverse-data";

async function packageCount(): Promise<number | null> {
  try {
    const { db } = await connectToDatabase();
    return await db
      .collection("packages")
      .countDocuments(PUBLIC_PACKAGE_FILTER);
  } catch {
    return null;
  }
}

async function warehouseStatus() {
  try {
    const statuses = await listDbStatuses();
    return statuses.find((s) => s.source === "sdv-db") ?? null;
  } catch {
    return null;
  }
}

async function releaseTags(): Promise<string[] | null> {
  try {
    const releases = await listRepoReleases(RELEASES_REPO);
    return releases.map((r) => r.tag);
  } catch {
    return null;
  }
}

export default async function StatsPage() {
  const [status, tags, pkgs] = await Promise.all([
    warehouseStatus(),
    releaseTags(),
    packageCount(),
  ]);
  const { tiles, asOf } = warehouseFigures({ status, releaseTags: tags, packages: pkgs });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <PageHeader title="By the numbers">
        The scoreboard for the whole operation — the open data warehouse first,
        the GitHub footprint second.
      </PageHeader>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">
            The warehouse
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {asOf
              ? `as of ${asOf} · data.sportsdataverse.org`
              : tags != null || pkgs != null
                ? "warehouse heartbeat unavailable"
                : "live figures unavailable"}
          </p>
        </div>
        <div className="my-6 grid gap-5 xs:grid-cols-2 sm:!grid-cols-3 xl:!grid-cols-5">
          {tiles.map((tile) => (
            <StatsCard
              key={tile.title}
              title={tile.title}
              value={tile.value}
              error={tile.value === "—"}
            />
          ))}
        </div>
      </section>

      <StatsClient />
    </div>
  );
}
