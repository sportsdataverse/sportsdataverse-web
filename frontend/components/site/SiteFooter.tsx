import Link from "next/link";

const GROUPS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Site",
    links: [
      { href: "/packages", label: "Packages" },
      { href: "/projects", label: "Projects" },
      { href: "/blog", label: "Blog" },
      { href: "/about", label: "About" },
      { href: "/stats", label: "Stats" },
      { href: "/snippets", label: "Snippets" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "https://py.sportsdataverse.org", label: "Python (sportsdataverse-py)", external: true },
      { href: "https://js.sportsdataverse.org", label: "Node.js (sportsdataverse.js)", external: true },
      { href: "https://r.sportsdataverse.org", label: "R (sportsdataverse-R)", external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "https://github.com/sportsdataverse", label: "GitHub", external: true },
      { href: "https://bsky.app/profile/sportsdataverse.org", label: "Bluesky — @sportsdataverse.org", external: true },
      { href: "https://twitter.com/sportsdataverse", label: "Twitter / X", external: true },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <span className="font-script text-xl text-primary">SportsDataverse</span>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Open-source sports data and tooling — play-by-play, models, and
            packages in R, Python, and Node.js, free for everyone.
          </p>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="eyebrow">{g.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {g.links.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-foreground/80 transition-colors hover:text-primary"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      href={l.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-4 text-center font-mono text-xs text-muted-foreground">
        © {new Date().getFullYear()} SportsDataverse · MIT-licensed code, open data
      </div>
    </footer>
  );
}
