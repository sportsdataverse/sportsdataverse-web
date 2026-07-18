"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import sdvBlue from "@public/images/sdv-blue-banner.png";
import PackageCard from "@components/PackageCard";
import PageHeader from "@components/site/PageHeader";
import { Input } from "@components/ui/input";
import type { PackageDoc } from "@lib/packageSchema";

/**
 * The package directory. One labeled section per ecosystem; the flagship
 * sportsdataverse metapackage leads each section as a full-width row. A single
 * search box filters every section on title / sport / description.
 */

type Props = {
  rPackages: PackageDoc[];
  rversePackages: PackageDoc[];
  pyPackages: PackageDoc[];
  jsPackages: PackageDoc[];
};

const isFlagship = (pkg: PackageDoc) =>
  String(pkg.title ?? "").toLowerCase().startsWith("sportsdataverse");

function matches(pkg: PackageDoc, q: string): boolean {
  if (!q) return true;
  const hay = `${pkg.title} ${pkg.sports} ${pkg.content}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

function Section({
  title,
  note,
  flagship,
  rest,
  query,
}: {
  title: string;
  note: string;
  flagship: PackageDoc[];
  rest: PackageDoc[];
  query: string;
}) {
  const shownFlagship = flagship.filter((p) => matches(p, query));
  const shownRest = rest.filter((p) => matches(p, query));
  const total = shownFlagship.length + shownRest.length;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">
          {title}
        </h2>
        <p className="font-mono text-xs text-muted-foreground">
          {total} package{total === 1 ? "" : "s"} · {note}
        </p>
      </div>
      {total === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {query
            ? `No ${title} packages match “${query}”.`
            : `No ${title} packages listed yet.`}
        </p>
      ) : (
        <>
          {shownFlagship.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-2">
              {shownFlagship.map((pkg) => (
                <PackageCard pkg={pkg} key={pkg._id} />
              ))}
            </div>
          ) : null}
          {shownRest.length > 0 ? (
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownRest.map((pkg) => (
                <PackageCard pkg={pkg} key={pkg._id} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function PackagesClient({
  rPackages,
  rversePackages,
  pyPackages,
  jsPackages,
}: Props) {
  const [query, setQuery] = useState("");

  const sections = useMemo(
    () => [
      {
        title: "Python",
        note: "pip / conda",
        flagship: pyPackages.filter(isFlagship),
        rest: pyPackages.filter((p) => !isFlagship(p)),
      },
      {
        title: "R",
        note: "CRAN / r-universe",
        flagship: [...rversePackages, ...rPackages.filter(isFlagship)],
        rest: rPackages.filter((p) => !isFlagship(p)),
      },
      {
        title: "Node.js",
        note: "npm",
        flagship: jsPackages.filter(isFlagship),
        rest: jsPackages.filter((p) => !isFlagship(p)),
      },
    ],
    [pyPackages, rPackages, rversePackages, jsPackages]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <PageHeader title="Packages">
        Every SportsDataverse library, by ecosystem — the flagship
        sportsdataverse package leads each section. All open source, all free.
      </PageHeader>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, sport, or description…"
            className="pl-8"
            aria-label="Search packages"
          />
        </div>
        <Image
          src={sdvBlue}
          alt="SportsDataverse banner"
          className="hidden h-10 w-auto rounded md:block"
          quality={75}
        />
      </div>

      {sections.map((s) => (
        <Section key={s.title} {...s} query={query} />
      ))}
    </div>
  );
}
