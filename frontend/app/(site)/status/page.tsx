import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import pageMeta from "@content/meta";
import PageHeader from "@components/site/PageHeader";
import ShieldBadge from "@components/site/ShieldBadge";
import {
  RELEASES_URL,
  SNAPSHOT_PAGE_URL,
  badgeUrl,
  formatDate,
  formatUtc,
  loadEcosystemSummary,
  producerAnchor,
  relativeAge,
  runLabel,
  stateCounts,
  stateLabel,
  trackedTagCount,
  workflowAlt,
  workflowStem,
  type EcosystemSummary,
  type ProducerState,
  type WorkflowRun,
} from "@lib/ecosystemStatus";
import ReleaseTagFilter from "./ReleaseTagFilter";

export const metadata: Metadata = {
  title: pageMeta.status.title,
  description: pageMeta.status.description,
  keywords: pageMeta.status.keywords,
  openGraph: { images: [{ url: pageMeta.status.image }] },
};

/** The snapshot is nightly; re-read it at most once an hour. */
export const revalidate = 3600;

const GH = "https://github.com";

const SECTIONS = [
  { id: "release-freshness", label: "Release freshness" },
  { id: "producers", label: "Producers" },
  { id: "red-workflows", label: "Red workflows" },
  { id: "packages", label: "Packages" },
  { id: "how-to-read", label: "How to read this" },
];

// ---- status tones: the shared status-* ramp (DESIGN.md), never hue alone ----

type Tone = "success" | "scheduled" | "running" | "failed" | "cancelled";
const CHIP: Record<Tone, string> = {
  success: "bg-status-success/15 text-status-success-ink dark:text-status-success",
  scheduled: "bg-status-scheduled/15 text-status-scheduled-ink dark:text-status-scheduled",
  running: "bg-status-running/15 text-status-running-ink dark:text-status-running",
  failed: "bg-status-failed/15 text-status-failed-ink dark:text-status-failed",
  cancelled: "bg-status-cancelled/20 text-status-cancelled-ink dark:text-status-cancelled",
};
const DOT: Record<Tone, string> = {
  success: "bg-status-success",
  scheduled: "bg-status-scheduled",
  running: "bg-status-running",
  failed: "bg-status-failed",
  cancelled: "bg-status-cancelled",
};
const STATE_TONE: Record<ProducerState, Tone> = {
  fresh: "success",
  idle: "scheduled",
  stale: "running",
  failing: "failed",
  unknown: "cancelled",
};
function runTone(run: Pick<WorkflowRun, "conclusion" | "created_at">): Tone {
  const label = runLabel(run);
  return label === "passing"
    ? "success"
    : label === "failing"
      ? "failed"
      : label === "in progress"
        ? "running"
        : "cancelled";
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide ${CHIP[tone]}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

const link = "text-accent underline-offset-4 hover:underline";

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${link} inline-flex items-center gap-0.5`}>
      {children}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </a>
  );
}

/** A keyboard-reachable scroll container (tables that overflow must scroll without a mouse). */
const scrollRegion =
  "rounded-md border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function SectionHead({ id, title, note }: { id?: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
      <h2 id={id} className="font-display text-3xl font-bold uppercase tracking-wide">{title}</h2>
      {note ? <p className="font-mono text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function When({ value, now }: { value: string | null; now: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <time dateTime={value}>{formatDate(value)}</time>{" "}
      <span className="text-muted-foreground">· {relativeAge(value, now)}</span>
    </>
  );
}

// ---- sections ----

function Tiles({ summary }: { summary: EcosystemSummary }) {
  const counts = stateCounts(summary.producers);
  const tiles: { label: string; value: number; tone?: Tone }[] = [
    { label: "Fresh producers", value: counts.fresh, tone: "success" },
    { label: "Idle (off-season)", value: counts.idle, tone: "scheduled" },
    { label: "Stale producers", value: counts.stale, tone: "running" },
    { label: "Failing producers", value: counts.failing, tone: "failed" },
    ...(counts.unknown ? [{ label: "Unknown state", value: counts.unknown, tone: "cancelled" as Tone }] : []),
    { label: "Red workflows", value: summary.red_workflows.length, tone: summary.red_workflows.length ? "failed" : "success" },
    { label: "Release tags tracked", value: trackedTagCount(summary) },
  ];
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-md border border-border/60 bg-card px-4 py-3 shadow-sm">
          <p className="font-display text-4xl font-bold tracking-tight">{t.value.toLocaleString("en-US")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {t.tone ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[t.tone]}`} /> : null}
            {t.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function ReleaseFreshness({ summary, now }: { summary: EcosystemSummary; now: number }) {
  const rows = summary.release_tags;
  const producers = [...new Set(rows.map((r) => r.producer).filter((p): p is string => p !== null))].sort();
  const unmapped = rows.filter((r) => r.producer === null).length;
  return (
    <section id="release-freshness" className="mt-12 scroll-mt-24">
      <SectionHead
        id="release-freshness-heading"
        title="Release freshness"
        note={rows.length ? `${rows.length} tags${unmapped ? ` · ${unmapped} unmapped` : ""} · stalest first` : undefined}
      />
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Every <code className="font-mono text-foreground">load_*()</code> function reads these release
        assets on sportsdataverse-data. <External href={RELEASES_URL}>All releases</External>
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">This snapshot lists no release tags yet.</p>
      ) : (
        <>
          <ReleaseTagFilter tableId="release-tags" producers={producers} hasUnmapped={unmapped > 0} total={rows.length} />
          <div
            tabIndex={0}
            role="region"
            aria-label="Release freshness table, scrollable"
            className={`mt-3 max-h-[32rem] overflow-auto ${scrollRegion}`}
          >
            <table
              id="release-tags"
              aria-labelledby="release-freshness-heading"
              className="w-full min-w-[42rem] text-left text-sm"
            >
              <thead>
                <tr className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {["Tag", "Producer", "Assets", "Newest asset", "Through"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={`sticky top-0 z-10 bg-card px-3 py-2 font-semibold shadow-[inset_0_-1px_0_var(--border)] ${h === "Assets" ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.tag}
                    data-tag={r.tag}
                    data-producer={r.producer ?? ""}
                    className="border-t border-border/60 hover:bg-muted/40"
                  >
                    <td className="px-3 py-1.5 font-mono">
                      <a
                        href={`${RELEASES_URL}/tag/${encodeURIComponent(r.tag)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={link}
                      >
                        {r.tag}
                      </a>
                    </td>
                    <td className="px-3 py-1.5">
                      {r.producer ? (
                        <a href={`#${producerAnchor(r.producer)}`} className={link}>
                          {producerAnchor(r.producer)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">unmapped</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.assets.toLocaleString("en-US")}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                      {r.assets === 0 ? (
                        <span className="text-muted-foreground">empty</span>
                      ) : (
                        <When value={r.newest_asset_at} now={now} />
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {r.max_season ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Producers({ summary, now }: { summary: EcosystemSummary; now: number }) {
  return (
    <section id="producers" className="mt-14 scroll-mt-24">
      <SectionHead title="Producers" note={`${summary.producers.length} repos build the release data`} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {summary.producers.map((p) => {
          const anchor = producerAnchor(p.repo);
          const tone = STATE_TONE[p.state];
          return (
            <article key={p.repo} id={anchor} className="scroll-mt-24 rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words font-mono text-base font-semibold">
                  <a href={`${GH}/${p.repo}`} target="_blank" rel="noopener noreferrer" title={p.repo} className={link}>
                    {anchor}
                  </a>
                </h3>
                {p.sport ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                    {p.sport}
                  </span>
                ) : null}
                <Chip tone={tone}>{stateLabel(p.state)}</Chip>
              </div>

              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Data updated</dt>
                <dd className="font-mono text-xs leading-5">
                  <When value={p.updated_at} now={now} />
                </dd>
                <dt className="text-muted-foreground">Through</dt>
                <dd className="font-mono text-xs leading-5">
                  {p.through_season ? `${p.through_season} season` : "—"}
                </dd>
                <dt className="text-muted-foreground">Season</dt>
                <dd className="text-xs leading-5">{p.in_season ? "in season" : "off-season"}</dd>
                <dt className="text-muted-foreground">Release tags</dt>
                <dd className="font-mono text-xs leading-5">{p.tags}</dd>
                <dt className="text-muted-foreground">Read by</dt>
                <dd className="text-xs leading-5">{p.packages.length ? p.packages.join(", ") : "—"}</dd>
              </dl>

              {p.workflows.length ? (
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
                  {p.workflows.map((w) => (
                    <li key={w.file || w.name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {w.url ? <External href={w.url}>{w.name}</External> : <span>{w.name}</span>}
                      <Chip tone={runTone(w)}>{runLabel(w)}</Chip>
                      <span className="font-mono text-muted-foreground">
                        {formatDate(w.created_at)}
                        {w.event ? ` · ${w.event.replace(/_/g, " ")}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  No update workflow runs in this snapshot.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <ShieldBadge
                  src={badgeUrl(p.repo, "updated")}
                  alt={`Data updated: ${formatDate(p.updated_at)}`}
                  href={RELEASES_URL}
                />
                <ShieldBadge
                  src={badgeUrl(p.repo, "through")}
                  alt={`Through: ${p.through_season ? `${p.through_season} season` : "unknown"}`}
                  href={RELEASES_URL}
                />
                <ShieldBadge
                  src={badgeUrl(p.repo, "status")}
                  alt={`Pipeline: ${stateLabel(p.state)}`}
                  href={`${GH}/${p.repo}/actions`}
                />
                {p.workflows
                  .filter((w) => w.file)
                  .map((w) => (
                    <ShieldBadge
                      key={w.file}
                      src={badgeUrl(p.repo, `wf-${workflowStem(w.file)}`)}
                      alt={workflowAlt(w)}
                      href={w.url}
                    />
                  ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RedWorkflows({ summary, now }: { summary: EcosystemSummary; now: number }) {
  const rows = summary.red_workflows;
  return (
    <section id="red-workflows" className="mt-14 scroll-mt-24">
      <SectionHead
        id="red-workflows-heading"
        title="Red workflows"
        note={rows.length ? `${rows.length} latest runs not passing` : undefined}
      />
      {rows.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Chip tone="success">none</Chip>
          Every tracked workflow&rsquo;s latest run passed.
        </p>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Red workflows table, scrollable"
          className={`mt-4 overflow-x-auto ${scrollRegion}`}
        >
          <table aria-labelledby="red-workflows-heading" className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {["Repo", "Workflow", "Conclusion", "Date", "Run"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.repo}/${r.name}`} className="border-t border-border/60">
                  <td className="px-3 py-1.5 font-mono">
                    <a href={`${GH}/${r.repo}`} target="_blank" rel="noopener noreferrer" className={link}>
                      {producerAnchor(r.repo)}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5">
                    <Chip tone={runTone(r)}>{r.conclusion ? r.conclusion.replace(/_/g, " ") : "unknown"}</Chip>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                    <When value={r.created_at} now={now} />
                  </td>
                  <td className="px-3 py-1.5">
                    {r.url ? <External href={r.url}>View run</External> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Packages({ summary }: { summary: EcosystemSummary }) {
  const rows = summary.packages;
  return (
    <section id="packages" className="mt-14 scroll-mt-24">
      <SectionHead title="Packages" note={rows.length ? `${rows.length} package repos · latest release` : undefined} />
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">This snapshot lists no package repos.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <article key={p.repo} className="rounded-md border border-border bg-card p-4 shadow-sm">
              <h3 className="break-words font-mono text-base font-semibold">
                <a href={`${GH}/${p.repo}`} target="_blank" rel="noopener noreferrer" title={p.repo} className={link}>
                  {producerAnchor(p.repo)}
                </a>
              </h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {p.latest_release_tag ? (
                  <>
                    <a
                      href={`${GH}/${p.repo}/releases/tag/${encodeURIComponent(p.latest_release_tag)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={link}
                    >
                      {p.latest_release_tag}
                    </a>
                    {p.published_at ? ` · ${formatDate(p.published_at)}` : ""}
                  </>
                ) : (
                  "no GitHub release"
                )}
              </p>
              {p.workflows.length ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {p.workflows.map((w) => (
                    <li key={w.file || w.name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{w.name}</span>
                      <Chip tone={runTone(w)}>{runLabel(w)}</Chip>
                      <span className="font-mono text-muted-foreground">{formatDate(w.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.workflows
                  .filter((w) => w.file)
                  .map((w) => (
                    <ShieldBadge
                      key={w.file}
                      src={badgeUrl(p.repo, `wf-${workflowStem(w.file)}`)}
                      alt={workflowAlt(w)}
                      href={w.url}
                    />
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HowToRead() {
  const items: [Tone, string, string][] = [
    ["success", "fresh", "new release assets landed within the producer's window."],
    ["scheduled", "idle (off-season)", "the sport is out of season, so no new data is expected. Idle is not broken."],
    ["running", "stale", "in season, but nothing new for longer than the producer's threshold."],
    ["failed", "failing", "the latest run of an update workflow failed."],
    ["cancelled", "unknown", "the snapshot could not tell."],
  ];
  return (
    <section id="how-to-read" className="mt-14 scroll-mt-24">
      <SectionHead title="How to read this" />
      <ul className="mt-4 max-w-3xl space-y-2 text-sm leading-relaxed">
        {items.map(([tone, label, text]) => (
          <li key={label} className="flex flex-wrap items-baseline gap-2">
            <Chip tone={tone}>{label}</Chip>
            <span className="text-muted-foreground">{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        The snapshot is rebuilt nightly from public GitHub data, and this page re-reads it at most
        once an hour, so a run that finished this morning may not show until tomorrow. The badges
        are the same shields the package READMEs use; the text beside them says the same thing.
      </p>
    </section>
  );
}

export default async function StatusPage() {
  const summary = await loadEcosystemSummary();
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per hourly regeneration, and every relative age on the page is as of that render
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <PageHeader title="Status">
        Is the data fresh, and are the pipelines that build it running? A nightly snapshot of every
        public SportsDataverse producer, package and release.
      </PageHeader>

      {summary ? (
        <>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            Snapshot generated {relativeAge(summary.generated_at, now)} ·{" "}
            <time dateTime={summary.generated_at}>{formatUtc(summary.generated_at)}</time> ·{" "}
            <External href={SNAPSHOT_PAGE_URL}>raw snapshot</External>
          </p>

          <nav aria-label="On this page" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">On this page</span>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={link}>
                {s.label}
              </a>
            ))}
          </nav>

          <Tiles summary={summary} />
          <ReleaseFreshness summary={summary} now={now} />
          <Producers summary={summary} now={now} />
          <RedWorkflows summary={summary} now={now} />
          <Packages summary={summary} />
          <HowToRead />
        </>
      ) : (
        <div role="status" className="mt-10 max-w-2xl rounded-md border border-border bg-card p-6 shadow-sm">
          <Chip tone="cancelled">unavailable</Chip>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-wide">
            Status snapshot unavailable
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The nightly status snapshot could not be loaded just now, so this page has nothing
            trustworthy to show. That says nothing about the data itself: the raw report and the
            releases are still on GitHub.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <External href={SNAPSHOT_PAGE_URL}>Raw ecosystem snapshot</External>
            <External href={RELEASES_URL}>sportsdataverse-data releases</External>
          </p>
        </div>
      )}
    </div>
  );
}
