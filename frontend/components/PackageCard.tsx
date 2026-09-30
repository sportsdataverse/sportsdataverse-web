import Image from "next/image";
import Link from "next/link";
import { Github, FileText, Database, FileDown } from "lucide-react";
import { Card } from "@components/ui/card";
import { Button } from "@components/ui/button";
import { cheatsheetHref } from "@lib/cheatsheets";
import { cranDoi, cranHref } from "@lib/packageOrder";
import type { PackageDoc } from "@lib/packageSchema";

const outlinePill =
  "rounded-full border border-primary/40 px-2 py-0.5 text-xs font-semibold tracking-wide text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function PackageCard({ pkg }: { pkg: PackageDoc }) {
  const cheatsheet = cheatsheetHref(pkg.title, pkg.repoType);
  const cran = cranHref(pkg);
  const doi = cranDoi(pkg);
  return (
    <Card className="group relative h-full overflow-hidden border-transparent bg-card/90 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
      {/* SDV-blue accent bar */}
      <span className="absolute inset-x-0 top-0 h-0.5 bg-primary/60" />
      <div className="flex h-full flex-col items-center gap-3 p-6">
        <h3 className="font-barlow text-2xl font-semibold leading-snug tracking-tight">
          {pkg.repoType == "R" ? `{${pkg.title}}` : pkg.title}
        </h3>
        {pkg.logoHref ? (
          pkg.docsHref ? (
            <Link
              href={pkg.docsHref}
              className="transition-transform duration-300 group-hover:scale-105"
            >
              <Image
                src={pkg.logoHref}
                alt={pkg.title}
                width={120}
                height={139}
                className="h-auto w-auto"
              />
            </Link>
          ) : (
            <Image
              src={pkg.logoHref}
              alt={pkg.title}
              width={120}
              height={139}
              className="h-auto w-auto"
            />
          )
        ) : null}
        {pkg.repoType || cran ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {pkg.repoType ? (
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                {pkg.sports} &middot; {pkg.repoType}
              </span>
            ) : null}
            {cran ? (
              <a href={cran} aria-label={`${pkg.title} on CRAN`} className={outlinePill}>
                CRAN
              </a>
            ) : null}
            {doi ? (
              <a href={`https://doi.org/${doi}`} title={`DOI ${doi}`} aria-label={`DOI ${doi}`} className={outlinePill}>
                DOI
              </a>
            ) : null}
          </div>
        ) : null}
        {pkg.content ? (
          <p className="font-inter text-center text-sm text-muted-foreground">
            {pkg.content}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-center gap-1 pt-2">
          {pkg.sourceHref ? (
            <Button asChild variant="ghost" size="icon" aria-label="Source code">
              <Link href={pkg.sourceHref}>
                <Github className="h-5 w-5" />
              </Link>
            </Button>
          ) : null}
          {pkg.docsHref ? (
            <Button asChild variant="ghost" size="icon" aria-label="Documentation">
              <Link href={pkg.docsHref}>
                <FileText className="h-5 w-5" />
              </Link>
            </Button>
          ) : null}
          {pkg.dataRepoHref ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Data repository"
            >
              <Link href={pkg.dataRepoHref}>
                <Database className="h-5 w-5" />
              </Link>
            </Button>
          ) : null}
          {cheatsheet ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Cheat sheet (PDF)"
            >
              <a href={cheatsheet} download>
                <FileDown className="h-5 w-5" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
