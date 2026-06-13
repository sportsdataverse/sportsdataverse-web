import Image from "next/image";
import Link from "next/link";
import { Github, FileText, Database } from "lucide-react";
import { Card } from "@components/ui/card";
import { Button } from "@components/ui/button";

export default function PackageCard({ pkg }: { pkg: any }) {
  return (
    <Card className="group relative h-full overflow-hidden border-transparent bg-white/90 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl dark:bg-darkSecondary/90 dark:text-gray-100">
      {/* SDV-blue accent bar */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-80" />
      <div className="flex h-full flex-col items-center gap-3 p-6">
        <h3 className="font-barlow text-2xl font-semibold leading-snug tracking-tight">
          {pkg.repoType == "R" ? `{${pkg.title}}` : pkg.title}
        </h3>
        {pkg.logoHref ? (
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
        ) : null}
        {pkg.repoType ? (
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary dark:bg-white/10 dark:text-sky-300">
            {pkg.sports} &middot; {pkg.repoType}
          </span>
        ) : null}
        {pkg.content ? (
          <p className="font-inter text-center text-sm text-muted-foreground dark:text-gray-300">
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
        </div>
      </div>
    </Card>
  );
}
