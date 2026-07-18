import type { Metadata } from "next";
import pageMeta from "@content/meta";
import PageHeader from "@components/site/PageHeader";
import { connectToDatabase } from "@lib/mongodb";
import StatsClient from "./StatsClient";

export const metadata: Metadata = {
  title: pageMeta.stats.title,
  description:
    "The SportsDataverse by the numbers: warehouse rows, leagues, datasets, and the GitHub footprint.",
  keywords: pageMeta.stats.keywords,
  openGraph: { images: [{ url: pageMeta.stats.image }] },
};

async function packageCount(): Promise<number | null> {
  try {
    const { db } = await connectToDatabase();
    return await db
      .collection("packages")
      .countDocuments({ published: { $ne: false } });
  } catch {
    return null;
  }
}

/* Warehouse figures are maintained alongside the sdv-db catalog; update when
   the warehouse materially grows. As of July 2026. */
const WAREHOUSE = [
  { title: "Rows of play-by-play & stats", value: "120M+" },
  { title: "Leagues in the warehouse", value: "8" },
  { title: "Datasets in the catalog", value: "168" },
  { title: "Typed API endpoints", value: "160+" },
];

export default async function StatsPage() {
  const pkgs = await packageCount();
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
            as of July 2026 · data.sportsdataverse.org
          </p>
        </div>
        <div className="my-6 grid gap-5 xs:grid-cols-2 xl:grid-cols-4">
          {[
            ...WAREHOUSE,
            ...(pkgs ? [{ title: "Open-source packages", value: String(pkgs) }] : []),
          ]
            .slice(0, 4)
            .map((s) => (
              <div
                key={s.title}
                className="rounded-md border border-border/60 bg-card px-7 py-4 shadow-sm"
              >
                <p className="my-2 font-display text-4xl font-bold tracking-tight text-foreground">
                  {s.value}
                </p>
                <p className="text-base font-medium text-muted-foreground">
                  {s.title}
                </p>
              </div>
            ))}
        </div>
      </section>

      <StatsClient />
    </div>
  );
}
