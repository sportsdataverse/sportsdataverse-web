import type { Metadata } from "next";
import { connectToDatabase } from "@lib/mongodb";
import pageMeta from "@content/meta";
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
  // Same hardening as the old gSSP: a failed query renders empty sections
  // rather than a 500.
  let pkgs: any[] = [];
  try {
    const { db } = await connectToDatabase();
    pkgs = JSON.parse(
      JSON.stringify(
        await db.collection("packages").find({}).sort({ title: 1 }).toArray()
      )
      // Hidden entries (published: false) are manage-only — never public.
    ).filter((p: any) => p.published !== false);
  } catch {
    pkgs = [];
  }

  // Flagship sportsdataverse-* packages lead each language section (the R
  // section already renders its flagship separately via rversePackages).
  const flagshipFirst = (a: any, b: any) => {
    const flag = (p: any) => (String(p.title ?? "").toLowerCase().startsWith("sportsdataverse") ? 0 : 1);
    return flag(a) - flag(b) || String(a.title ?? "").localeCompare(String(b.title ?? ""));
  };
  const pyPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "Python")
    .sort(flagshipFirst);
  const rPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "R" && pkg.title != "sportsdataverse")
    .sort(flagshipFirst);
  const rversePackages = pkgs.filter(
    (pkg: any) => pkg.repoType == "R" && pkg.title == "sportsdataverse"
  );
  const jsPackages = pkgs
    .filter((pkg: any) => pkg.repoType == "Node.js")
    .sort(flagshipFirst);

  return (
    <PackagesClient
      rPackages={rPackages}
      rversePackages={rversePackages}
      pyPackages={pyPackages}
      jsPackages={jsPackages}
    />
  );
}
