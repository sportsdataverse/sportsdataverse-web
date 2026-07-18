import type { Metadata } from "next";
import Link from "next/link";
import Contact from "@components/Contact";
import { connectToDatabase } from "@lib/mongodb";

export const metadata: Metadata = {
  title: "About",
  description:
    "The SportsDataverse is an open-source sports data initiative: free packages in R, Python, and Node.js, open play-by-play data, and models anyone can use.",
};

async function packageCount(): Promise<number | null> {
  try {
    const { db } = await connectToDatabase();
    return await db.collection("packages").countDocuments({});
  } catch {
    return null;
  }
}

const PILLARS = [
  {
    title: "Packages",
    body: "Sport-specific libraries in R, Python, and Node.js — cfbfastR, hoopR, wehoop, fastRhockey, sportsdataverse-py, sportsdataverse.js and friends — with consistent loaders for schedules, rosters, box scores, and play-by-play.",
    href: "/packages",
    link: "Browse the packages",
  },
  {
    title: "Open data",
    body: "Nightly pipelines scrape, process, and publish season-level datasets as versioned releases: over 120 million rows of play-by-play and stats across eight leagues, loadable in one function call.",
    href: "/stats",
    link: "See the numbers",
  },
  {
    title: "Models",
    body: "Expected points, win probability, opponent-adjusted team ratings, and player value — built in the open, validated against real games, and shipped alongside the raw data they're trained on.",
    href: "/blog",
    link: "Read the research",
  },
];

const LEAGUES = [
  "CFB",
  "MBB",
  "WBB",
  "NFL",
  "NBA",
  "WNBA",
  "NHL",
  "PWHL",
];

export default async function AboutPage() {
  const count = await packageCount();
  return (
    <div className="mx-auto max-w-4xl px-4">
      <section className="pt-16 md:pt-24">
        <p className="eyebrow">About us</p>
        <h1 className="mt-3 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl">
          Sports data,
          <br />
          <span className="relative inline-block">
            without the paywall.
            <span className="absolute -bottom-1 left-0 h-1.5 w-full bg-score" />
          </span>
        </h1>
        <div className="mt-8 space-y-5 text-base leading-relaxed text-foreground/90 sm:text-lg">
          <p>
            The SportsDataverse started in 2021 with a simple frustration:
            sports data was either locked behind expensive commercial feeds or
            scattered across sites that could disappear overnight. The tools
            that existed were brilliant but siloed — one package per sport, one
            language per community, no shared conventions.
          </p>
          <p>
            So we built the connective tissue. Today the SportsDataverse is a
            family of {count ?? "40+"} open-source packages and data
            repositories maintained by contributors across the sports analytics
            community, founded and led by{" "}
            <a
              href="https://github.com/saiemgilani"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Saiem Gilani
            </a>
            . Everything ships under permissive licenses: the scrapers, the
            processed data, the models, and the infrastructure that keeps it
            all fresh every night.
          </p>
          <p>
            If you&apos;ve computed EPA for a college football game in R,
            pulled women&apos;s basketball play-by-play in Python, or built a
            win-probability chart from free data — there&apos;s a good chance
            the SportsDataverse was underneath it.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <p className="eyebrow">What we build</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="flex flex-col rounded-lg border border-border bg-card p-5"
            >
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
                {p.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
              <Link
                href={p.href}
                className="mt-4 text-sm font-medium text-accent hover:underline"
              >
                {p.link} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <p className="eyebrow">Leagues covered</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {LEAGUES.map((l) => (
            <span
              key={l}
              className="rounded-md border border-border bg-card px-3 py-1.5 font-display text-lg font-bold tracking-wide text-foreground"
            >
              {l}
            </span>
          ))}
          <span className="rounded-md border border-dashed border-border px-3 py-1.5 font-display text-lg font-bold tracking-wide text-muted-foreground">
            + college baseball, softball &amp; more on the way
          </span>
        </div>
      </section>

      <section className="mt-14">
        <p className="eyebrow">Find us</p>
        <ul className="mt-4 space-y-2.5 text-sm">
          <li>
            <a
              href="https://github.com/sportsdataverse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 transition-colors hover:text-primary"
            >
              GitHub — github.com/sportsdataverse
            </a>
          </li>
          <li>
            <a
              href="https://bsky.app/profile/sportsdataverse.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 transition-colors hover:text-primary"
            >
              Bluesky — @sportsdataverse.org
            </a>
          </li>
          <li>
            <a
              href="https://twitter.com/sportsdataverse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 transition-colors hover:text-primary"
            >
              Twitter / X — @sportsdataverse
            </a>
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <Contact />
      </section>
    </div>
  );
}
