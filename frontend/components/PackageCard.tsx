import Image from "next/image";
import Link from "next/link";
import { Github, FileText, Database, FileDown, CircleCheck, CircleDot, CircleHelp, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card } from "@components/ui/card";
import { Button } from "@components/ui/button";
import StatusChip, { STATE_TONE } from "@components/site/StatusChip";
import { cheatsheetHref } from "@lib/cheatsheets";
import { stateLabel, worstPipeline, type PipelineLink, type ProducerState } from "@lib/ecosystemStatus";
import { cranDoi, cranHref } from "@lib/packageOrder";
import type { PackageDoc } from "@lib/packageSchema";

const outlinePill =
  "rounded-full border border-primary/40 px-2 py-0.5 text-xs font-semibold tracking-wide text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// ponytail: a flat cap keeps a many-producer card (the py/js metapackages read ~17) short; the rest are on /status
const MAX_PIPELINES = 4;

/**
 * The state of each producer whose releases this package reads, as the same chip /status shows,
 * linked to its /status group. Each chip is captioned with its producer's label (hoopR reads four
 * basketball producers).
 */
function Pipelines({ pipelines }: { pipelines: PipelineLink[] }) {
  return (
    <ul className="flex w-full flex-col items-center gap-1">
      {pipelines.slice(0, MAX_PIPELINES).map((p) => (
        <li key={p.repo} className="flex flex-wrap items-center justify-center gap-x-1.5 text-center">
          <span className="text-xs text-muted-foreground">{p.label}</span>
          <Link
            href={`/status#${p.anchor}`}
            aria-label={`${p.label} data pipeline: ${stateLabel(p.state)}`}
            className="inline-flex min-h-6 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <StatusChip tone={STATE_TONE[p.state]}>{stateLabel(p.state)}</StatusChip>
          </Link>
        </li>
      ))}
      {pipelines.length > MAX_PIPELINES ? (
        <li>
          <Link href="/status#producers" className="inline-flex min-h-6 items-center text-xs text-accent underline-offset-4 hover:underline">
            +{pipelines.length - MAX_PIPELINES} more data pipelines
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

/** One shape per pipeline state, in the state's own status-* ink: a status never carries meaning by hue alone. */
const STATE_ICON: Record<ProducerState, { Icon: LucideIcon; ink: string }> = {
  fresh: { Icon: CircleCheck, ink: "text-status-success-ink dark:text-status-success" },
  idle: { Icon: CircleDot, ink: "text-status-scheduled-ink dark:text-status-scheduled" },
  stale: { Icon: TriangleAlert, ink: "text-status-running-ink dark:text-status-running" },
  failing: { Icon: CircleX, ink: "text-status-failed-ink dark:text-status-failed" },
  unknown: { Icon: CircleHelp, ink: "text-status-cancelled-ink dark:text-status-cancelled" },
};

const rowIcon =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * A package as one compact row, for phones (below `sm`, where the card would be a screen tall): a small
 * logo, the name, language and sports, two lines of description, the docs and source links, and one dot
 * for the worst state among the producers it reads, linked to that producer's /status group.
 */
function PackageRow({ pkg, pipelines }: { pkg: PackageDoc; pipelines?: PipelineLink[] }) {
  const worst = worstPipeline(pipelines ?? []);
  const worstIcon = worst ? STATE_ICON[worst.state] : null;
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 sm:hidden">
      {pkg.logoHref ? (
        <Image src={pkg.logoHref} alt="" width={40} height={46} className="size-10 shrink-0 object-contain" />
      ) : (
        <span aria-hidden className="size-10 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <h3 className="min-w-0 flex-1 truncate font-barlow text-lg font-semibold leading-6">
            {pkg.repoType == "R" ? `{${pkg.title}}` : pkg.title}
          </h3>
          {pkg.docsHref ? (
            <Link href={pkg.docsHref} aria-label={`${pkg.title} documentation`} className={rowIcon}>
              <FileText className="size-4" />
            </Link>
          ) : null}
          {pkg.sourceHref ? (
            <Link href={pkg.sourceHref} aria-label={`${pkg.title} source code`} className={rowIcon}>
              <Github className="size-4" />
            </Link>
          ) : null}
          {worst ? (
            <Link
              href={`/status#${worst.anchor}`}
              aria-label={`${worst.label} data pipeline: ${stateLabel(worst.state)}`}
              title={`${worst.label} data pipeline: ${stateLabel(worst.state)}`}
              className={rowIcon}
            >
              {worstIcon ? <worstIcon.Icon aria-hidden className={`size-4 ${worstIcon.ink}`} /> : null}
            </Link>
          ) : null}
        </div>
        <p className="font-mono text-xs leading-4 text-muted-foreground">
          {[pkg.repoType, pkg.sports].filter(Boolean).join(" · ")}
        </p>
        {pkg.content ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{pkg.content}</p>
        ) : null}
      </div>
    </div>
  );
}

/** The full card, from `sm` up. */
function FullCard({ pkg, pipelines }: { pkg: PackageDoc; pipelines?: PipelineLink[] }) {
  const cheatsheet = cheatsheetHref(pkg.title, pkg.repoType);
  const cran = cranHref(pkg);
  const doi = cranDoi(pkg);
  return (
    <Card className="group relative hidden h-full overflow-hidden border-transparent bg-card/90 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl sm:block">
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
            {cran && doi ? (
              // one unit, so a long category pill wraps CRAN and DOI together
              <span className="inline-flex gap-1.5">
                <a href={cran} aria-label={`${pkg.title} on CRAN`} className={outlinePill}>
                  CRAN
                </a>
                <a href={`https://doi.org/${doi}`} title={`DOI ${doi}`} aria-label={`DOI ${doi}`} className={outlinePill}>
                  DOI
                </a>
              </span>
            ) : null}
          </div>
        ) : null}
        {pipelines?.length ? <Pipelines pipelines={pipelines} /> : null}
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

/** One package: a compact row below `sm`, the full card from `sm` up (only one is ever displayed). */
export default function PackageCard({
  pkg,
  pipelines,
}: {
  pkg: PackageDoc;
  /** Producers whose releases this package's loaders read (from the /status snapshot). */
  pipelines?: PipelineLink[];
}) {
  return (
    <>
      <PackageRow pkg={pkg} pipelines={pipelines} />
      <FullCard pkg={pkg} pipelines={pipelines} />
    </>
  );
}
