/**
 * The cheat-sheet catalogue — one entry per printable PDF under
 * `public/cheatsheets/`, and the lookup that puts a download button on a
 * package card.
 *
 * `SHEETS` is the single source of truth: `/cheatsheets` renders it, and the
 * package-card lookup below is derived from it, so adding a sheet is one entry
 * plus the PDF. Nothing here touches the database.
 *
 * `covers` lists the packages a sheet documents. It is usually one, but
 * `cfbplotR-cfb4th-cfbseedR.pdf` is a single sheet spanning three packages,
 * which is why the card lookup is a many-to-one map rather than a 1:1 pairing.
 */

export type Ecosystem = "R" | "Python" | "Node.js";

export type Cheatsheet = {
  /** Filename under `public/cheatsheets/`. */
  file: string;
  /** Display title. */
  title: string;
  /** Packages this sheet documents; drives the package-card lookup. */
  covers: string[];
  ecosystem: Ecosystem;
  /** Distinct content pages — NOT the PDF's page count, which multiplies by variant. */
  pages: number;
  /** Print variants bundled in the one PDF. */
  variants: string;
  blurb: string;
  /** Docs site for the package(s), for the "docs" link beside the download. */
  docs: string;
  /** True for the ecosystem-wide metapackage sheets. */
  flagship?: boolean;
};

export const SHEETS: Cheatsheet[] = [
  // --- flagships -----------------------------------------------------------
  {
    file: "sportsdataverse-R.pdf",
    title: "sportsdataverse (R)",
    covers: ["sportsdataverse"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "The R metapackage at a glance — every member package, what it loads, and the one-line installs that pull the ecosystem together.",
    docs: "https://r.sportsdataverse.org",
    flagship: true,
  },
  {
    file: "sportsdataverse-py.pdf",
    title: "sportsdataverse (Python)",
    covers: ["sportsdataverse-py"],
    ecosystem: "Python",
    pages: 6,
    variants: "4 style variants",
    blurb:
      "The largest sheet in the set: the Python package's loaders, the ESPN wrapper families across every league, and the top-level namespace.",
    docs: "https://py.sportsdataverse.org",
    flagship: true,
  },
  {
    file: "sportsdataverse-js.pdf",
    title: "sportsdataverse (Node.js)",
    covers: ["sportsdataverse-js"],
    ecosystem: "Node.js",
    pages: 4,
    variants: "light + dark",
    blurb:
      "The JavaScript client — every sport module, the async data getters, and the shapes they return.",
    docs: "https://js.sportsdataverse.org",
    flagship: true,
  },

  // --- R packages ----------------------------------------------------------
  {
    file: "cfbfastR.pdf",
    title: "cfbfastR",
    covers: ["cfbfastR"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "College football play-by-play, schedules and rosters — the CFBD, ESPN and stats.ncaa.org function families side by side.",
    docs: "https://cfbfastR.sportsdataverse.org",
  },
  {
    file: "hoopR.pdf",
    title: "hoopR",
    covers: ["hoopR"],
    ecosystem: "R",
    pages: 4,
    variants: "light + dark",
    blurb:
      "Men's college basketball and the NBA — ESPN loaders, the stats.nba.com surface, and KenPom.",
    docs: "https://hoopR.sportsdataverse.org",
  },
  {
    file: "wehoop.pdf",
    title: "wehoop",
    covers: ["wehoop"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "Women's basketball — the WNBA and women's college game, ESPN and stats.wnba.com in one place.",
    docs: "https://wehoop.sportsdataverse.org",
  },
  {
    file: "baseballr.pdf",
    title: "baseballr",
    covers: ["baseballr"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "Baseball from every angle — MLB Stats API, Statcast, FanGraphs, Baseball Reference and NCAA baseball.",
    docs: "https://billpetti.github.io/baseballr/",
  },
  {
    file: "fastRhockey.pdf",
    title: "fastRhockey",
    covers: ["fastRhockey"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "Hockey play-by-play and box scores — the NHL, the PWHL, and the ESPN hockey family.",
    docs: "https://fastRhockey.sportsdataverse.org",
  },
  {
    file: "oddsapiR.pdf",
    title: "oddsapiR",
    covers: ["oddsapiR"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "Sportsbook odds, lines and player props from The Odds API — every sport key and market in one reference.",
    docs: "https://oddsapiR.sportsdataverse.org",
  },
  {
    file: "cfbplotR-cfb4th-cfbseedR.pdf",
    title: "cfbplotR · cfb4th · cfbseedR",
    covers: ["cfbplotR", "cfb4th", "cfbseedR"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "The college football toolkit sheet: team logos and scales in plots, fourth-down decision modelling, and season simulation with CFP seeding.",
    docs: "https://cfbplotR.sportsdataverse.org",
  },
  {
    file: "sportyR.pdf",
    title: "sportyR",
    covers: ["sportyR"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "Regulation playing surfaces for every major sport, drawn to scale and ready to plot tracking data on.",
    docs: "https://sportyR.sportsdataverse.org",
  },
  {
    file: "mlbplotR.pdf",
    title: "mlbplotR",
    covers: ["mlbplotR"],
    ecosystem: "R",
    pages: 2,
    variants: "light + dark",
    blurb:
      "MLB team logos, caps and player headshots as ggplot2 scales, geoms and gt helpers.",
    docs: "https://camdenk.github.io/mlbplotR/",
  },

  // --- Python --------------------------------------------------------------
  {
    file: "sportypy.pdf",
    title: "sportypy",
    covers: ["sportypy"],
    ecosystem: "Python",
    pages: 1,
    variants: "light + dark",
    blurb: "sportyR's Python twin — the same to-scale surfaces for matplotlib.",
    docs: "https://sportypy.sportsdataverse.org",
  },
];

/** `/cheatsheets/<file>` for a sheet. */
export function sheetHref(sheet: Cheatsheet): string {
  return `/cheatsheets/${sheet.file}`;
}

/** Normalise a package title to the lookup key: lowercase alphanumerics only. */
function key(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Derived from SHEETS.covers, so a new sheet needs no second edit here. */
const BY_PACKAGE: Record<string, string> = Object.fromEntries(
  SHEETS.filter((s) => !s.flagship).flatMap((s) => s.covers.map((c) => [key(c), s.file]))
);

/** Flagship metapackage sheets, one per ecosystem, keyed by card repoType. */
const FLAGSHIP_BY_REPO_TYPE: Record<string, string> = Object.fromEntries(
  SHEETS.filter((s) => s.flagship).map((s) => [s.ecosystem, s.file])
);

export function cheatsheetHref(title: unknown, repoType?: unknown): string | null {
  const k = key(title);
  // The flagship cards all title-start with "sportsdataverse" and only differ
  // by repoType, so the ecosystem — not the title — picks the sheet.
  if (k.startsWith("sportsdataverse")) {
    const flagship = FLAGSHIP_BY_REPO_TYPE[String(repoType ?? "")];
    return flagship ? `/cheatsheets/${flagship}` : null;
  }
  const file = Object.hasOwn(BY_PACKAGE, k) ? BY_PACKAGE[k] : undefined;
  return file ? `/cheatsheets/${file}` : null;
}
