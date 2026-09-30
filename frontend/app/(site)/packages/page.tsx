import type { Metadata } from "next";
import { connectToDatabase } from "@lib/mongodb";
import { PUBLIC_PACKAGE_FILTER, PUBLIC_PACKAGE_PROJECTION } from "@lib/packageVisibility";
import pageMeta from "@content/meta";
import { packageOrder } from "@lib/packageOrder";
import { loadEcosystemSummary, pipelinesByPackage } from "@lib/ecosystemStatus";
import PackagesClient from "./PackagesClient";

export const metadata: Metadata = {
  title: pageMeta.packages.title,
  description: pageMeta.packages.description,
  keywords: pageMeta.packages.keywords,
  openGraph: { images: [{ url: pageMeta.packages.image }] },
};

// Mongo-backed, per-request (was getServerSideProps).
export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  // The public status snapshot (fetch-cached for an hour; null → no badges),
  // read once here and handed down as a plain map — never per card, never from the client.
  const summary = loadEcosystemSummary();
  // Same hardening as the old gSSP: a failed query renders empty sections
  // rather than a 500.
  let pkgs: any[] = [];
  try {
    const { db } = await connectToDatabase();
    // `published` alone is not a visibility flag here — every legacy doc carries
    // published: false and has always been shown. What must stay hidden is a
    // visitor submission until a member approves it; see lib/packageVisibility.
    pkgs = JSON.parse(
      JSON.stringify(
        await db
          .collection("packages")
          .find(PUBLIC_PACKAGE_FILTER, { projection: PUBLIC_PACKAGE_PROJECTION })
          .sort({ title: 1 })
          .toArray()
      )
    );
  } catch {
    pkgs = [];
  }

  const pyPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "Python")
    .sort(packageOrder);
  const rPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "R" && pkg.title != "sportsdataverse")
    .sort(packageOrder);
  const rversePackages = pkgs.filter(
    (pkg: any) => pkg.repoType == "R" && pkg.title == "sportsdataverse"
  );
  const jsPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "Node.js")
    .sort(packageOrder);

  return (
    <PackagesClient
      rPackages={rPackages}
      rversePackages={rversePackages}
      pyPackages={pyPackages}
      jsPackages={jsPackages}
      pipelines={pipelinesByPackage(await summary)}
    />
  );
}
