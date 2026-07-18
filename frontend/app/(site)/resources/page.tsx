import type { Metadata } from "next";
import PageHeader from "@components/site/PageHeader";
import SupportCallout from "@components/site/SupportCallout";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Friends of the SportsDataverse — open-data ecosystems, community APIs, courses, and the conferences and competitions where sports analytics happens.",
};

type Resource = {
  name: string;
  mono: string;
  url: string;
  host: string;
  blurb: string;
};

const FRIENDS: Resource[] = [
  {
    name: "nflverse",
    mono: "NV",
    url: "https://nflverse.nflverse.com",
    host: "nflverse.nflverse.com",
    blurb:
      "The open-source home of NFL analytics — nflfastR, nflreadr, and the nightly data releases our NFL loaders build on.",
  },
  {
    name: "CollegeFootballData",
    mono: "CFBD",
    url: "https://collegefootballdata.com",
    host: "collegefootballdata.com",
    blurb:
      "The community API for college football. cfbfastR's cfbd_* function family is a direct client of it.",
  },
  {
    name: "CollegeBasketballData",
    mono: "CBD",
    url: "https://collegebasketballdata.com",
    host: "collegebasketballdata.com",
    blurb:
      "CFBD's college basketball sibling — hoops schedules, box scores, and betting data behind a free key.",
  },
  {
    name: "PySport",
    mono: "PS",
    url: "https://pysport.org",
    host: "pysport.org",
    blurb:
      "The open-source sports analytics community and package index — kloppy and the wider Python sports stack.",
  },
  {
    name: "AthlyticZ",
    mono: "AZ",
    url: "https://athlyticz.com",
    host: "athlyticz.com",
    blurb:
      "Practitioner-taught sports analytics courses — R, Python, and Stan — including courses built with the packages you'll find here.",
  },
];

const CONFERENCES: Resource[] = [
  {
    name: "CMSAC",
    mono: "CMU",
    url: "https://www.cmsaconference.com",
    host: "cmsaconference.com",
    blurb:
      "Carnegie Mellon Sports Analytics Conference — where the SportsDataverse Initiative paper won the 2021 open-track reproducible research competition.",
  },
  {
    name: "NESSIS",
    mono: "NE",
    url: "https://www.nessis.org",
    host: "nessis.org",
    blurb:
      "New England Symposium on Statistics in Sports — the biennial Harvard gathering of sports statisticians.",
  },
  {
    name: "CASSIS",
    mono: "CAS",
    url: "https://www.cascadiasports.com",
    host: "cascadiasports.com",
    blurb:
      "Cascadia Symposium on Statistics in Sports — the Pacific Northwest's sports stats meeting in Vancouver.",
  },
  {
    name: "CSAS",
    mono: "CT",
    url: "https://statds.org/events/csas2026/",
    host: "statds.org",
    blurb:
      "Connecticut Sports Analytics Symposium — UConn-hosted, with a student data challenge alongside the talks.",
  },
  {
    name: "MLSA",
    mono: "ML",
    url: "https://dtai.cs.kuleuven.be/events/MLSA26",
    host: "dtai.cs.kuleuven.be",
    blurb:
      "Machine Learning and Data Mining for Sports Analytics — the ECML/PKDD workshop for ML-first sports research.",
  },
  {
    name: "MathSport International",
    mono: "MS",
    url: "https://www.mathsportinternational.com",
    host: "mathsportinternational.com",
    blurb: "The long-running European conference on mathematics in sport.",
  },
  {
    name: "MathSport Asia",
    mono: "MSA",
    url: "https://iimk.ac.in/apps/mathsport26/",
    host: "iimk.ac.in",
    blurb: "MathSport's Asian edition — quantitative sports research across the region.",
  },
  {
    name: "IACSS",
    mono: "CS",
    url: "https://iacss.org",
    host: "iacss.org",
    blurb:
      "International Association of Computer Science in Sport — home of the ISCSS symposium and the IJCSS journal.",
  },
  {
    name: "icSPORTS",
    mono: "IC",
    url: "https://icsports.scitevents.org",
    host: "icsports.scitevents.org",
    blurb: "International Conference on Sport Sciences Research and Technology Support.",
  },
  {
    name: "ISACE",
    mono: "ISA",
    url: "https://formal-analysis.com/isace/2026/",
    host: "formal-analysis.com",
    blurb: "International Sports Analytics Conference and Exhibition.",
  },
];

const COMPETITIONS: Resource[] = [
  {
    name: "NFL Big Data Bowl",
    mono: "BDB",
    url: "https://operations.nfl.com/programs-initiatives/innovation/big-data-bowl",
    host: "operations.nfl.com",
    blurb:
      "The NFL's annual player-tracking analytics competition — the sport's biggest open data challenge.",
  },
  {
    name: "Hudl Performance Insights",
    mono: "HPI",
    url: "https://www.hudl.com/blog/hudl-performance-insights-research-competition",
    host: "hudl.com",
    blurb: "Hudl / StatsBomb research competitions on soccer and performance data.",
  },
  {
    name: "Kaggle sports competitions",
    mono: "KG",
    url: "https://www.kaggle.com/competitions?tagIds=4141-Sports",
    host: "kaggle.com",
    blurb:
      "Every active sports-tagged prediction competition — March Madness brackets and beyond.",
  },
];

function ResourceCard({ r }: { r: Resource }) {
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-4 rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 font-display text-sm font-bold uppercase tracking-wide text-primary">
        {r.mono}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
            {r.name}
          </span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {r.host}
          </span>
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {r.blurb}
        </span>
      </span>
    </a>
  );
}

function Section({ head, items }: { head: string; items: Resource[] }) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
          {head}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((r) => (
          <ResourceCard key={r.name} r={r} />
        ))}
      </div>
    </section>
  );
}

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <PageHeader eyebrow="Also see" title="Resources">
        Sports analytics is a community sport. These are the ecosystems we
        build on, the friends we build alongside, and the conferences and
        competitions where the work gets shared.
      </PageHeader>
      <Section head="Friends of the ecosystem" items={FRIENDS} />
      <Section head="Conferences &amp; symposia" items={CONFERENCES} />
      <Section head="Competitions" items={COMPETITIONS} />
      <section className="mt-14">
        <SupportCallout />
      </section>
    </div>
  );
}
