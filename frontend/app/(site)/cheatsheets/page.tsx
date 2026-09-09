import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import SupportCallout from "@components/site/SupportCallout";
import { SHEETS, sheetHref, type Cheatsheet, type Ecosystem } from "@lib/cheatsheets";

export const metadata: Metadata = {
  title: "Cheat sheets",
  description:
    "Printable one-page references for every SportsDataverse package — R, Python and Node.js. Free PDFs, light and dark, US Letter landscape.",
  alternates: { canonical: "/cheatsheets" },
  openGraph: {
    title: "SportsDataverse cheat sheets",
    description:
      "Printable one-page references for every SportsDataverse package — R, Python and Node.js.",
    url: "/cheatsheets",
  },
};

const ECOSYSTEMS: { key: Ecosystem; head: string; note: string }[] = [
  {
    key: "R",
    head: "R",
    note: "install.packages() or remotes::install_github()",
  },
  { key: "Python", head: "Python", note: "pip install sportsdataverse" },
  { key: "Node.js", head: "Node.js", note: "npm install sportsdataverse" },
];

function SheetCard({ s }: { s: Cheatsheet }) {
  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
          {s.title}
        </h3>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {s.pages} {s.pages === 1 ? "page" : "pages"}
        </span>
      </div>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
        {s.blurb}
      </p>
      {s.covers.length > 1 ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          covers {s.covers.join(" · ")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={sheetHref(s)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
        >
          PDF
        </a>
        <a
          href={s.docs}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          Docs
        </a>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {s.variants}
        </span>
      </div>
    </div>
  );
}

function Section({ head, note, items }: { head: string; note: string; items: Cheatsheet[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">{head}</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{note}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((s) => (
          <SheetCard key={s.file} s={s} />
        ))}
      </div>
    </section>
  );
}

export default function CheatsheetsPage() {
  // Flagships first inside each ecosystem — the metapackage sheet is the one
  // to hand somebody who has not picked a package yet.
  const byEcosystem = (eco: Ecosystem) =>
    SHEETS.filter((s) => s.ecosystem === eco).sort(
      (a, b) => Number(Boolean(b.flagship)) - Number(Boolean(a.flagship))
    );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <PageHeader eyebrow="Print one out" title="Cheat sheets">
        One-page references for every package in the ecosystem — the function
        families, the loaders, and what each one returns. Free to download,
        print and hand out. Every sheet ships light and dark on US Letter
        landscape, so it survives a lecture-hall projector and a laser printer
        equally well.
      </PageHeader>

      {ECOSYSTEMS.map((e) => (
        <Section key={e.key} head={e.head} note={e.note} items={byEcosystem(e.key)} />
      ))}

      <section className="mt-14 rounded-lg border border-border bg-card p-5">
        <h2 className="font-display text-xl font-bold uppercase tracking-tight">
          Using these in a class?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Go ahead — they are free to redistribute, and they are built for it.
          If you are teaching with them we would genuinely like to know, and if
          a sheet is missing a function you reach for constantly, open an issue
          on the package repo and it will make the next revision.
        </p>
      </section>

      <section className="mt-14">
        <SupportCallout />
      </section>
    </div>
  );
}
