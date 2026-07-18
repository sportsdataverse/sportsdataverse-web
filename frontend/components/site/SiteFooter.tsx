import Link from "next/link";

const GROUPS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Site",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/snippets", label: "Snippets" },
      { href: "/projects", label: "Projects" },
      { href: "/packages", label: "Packages" },
      { href: "/stats", label: "Stats" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "https://py.sportsdataverse.org", label: "Python", external: true },
      { href: "https://js.sportsdataverse.org", label: "Node.js", external: true },
      { href: "https://sportsdataverse.org/#r-packages", label: "R packages", external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "https://github.com/sportsdataverse", label: "GitHub", external: true },
      { href: "https://twitter.com/sportsdataverse", label: "Twitter/X", external: true },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <span className="font-script text-lg text-primary">SportsDataverse</span>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Open-source sports data tooling — making data and utilities
            accessible for everyone.
          </p>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {g.title}
            </h3>
            <ul className="mt-3 space-y-2">
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
      <div className="border-t border-border/60 py-4 text-center font-mono text-xs text-muted-foreground">
        © {new Date().getFullYear()} SportsDataverse
      </div>
    </footer>
  );
}
