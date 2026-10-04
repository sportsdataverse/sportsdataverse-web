import { classifyReleaseTag } from "../content/platform.ts";

/** The heartbeat fields this page reads; never the full DbStatusDoc shape. */
export type WarehouseStatus = {
  ok?: boolean;
  row_estimate?: number;
  table_count?: number;
  error?: string;
  collected_at: string;
} | null;

export type WarehouseInput = {
  status: WarehouseStatus;
  /** sportsdataverse-data release tags, or null when the release list failed to load. */
  releaseTags: string[] | null;
  packages: number | null;
};

export type WarehouseTile = { title: string; value: string };

export type WarehouseFigures = {
  tiles: WarehouseTile[];
  /** YYYY-MM-DD from the heartbeat, or null when there's nothing live to date it. */
  asOf: string | null;
};

const DASH = "—";

/**
 * `123_456_789` → `"123M+"`, `1_234_567` → `"1.2M+"`, `9_870` → `"9,870"`.
 * Always floored, never rounded, so the figure never overstates the source.
 */
export function formatCount(n: number): string {
  if (n >= 100_000_000) return `${Math.floor(n / 1_000_000)}M+`;
  if (n >= 1_000_000) return `${(Math.floor(n / 100_000) / 10).toFixed(1)}M+`;
  return n.toLocaleString("en-US");
}

/**
 * Live warehouse figures for the public `/stats` page. Each of the three
 * sources (heartbeat, release list, package count) fails independently — a
 * missing one renders "—" on its own tile(s) rather than falling back to a
 * stale hard-coded number.
 */
export function warehouseFigures({ status, releaseTags, packages }: WarehouseInput): WarehouseFigures {
  const rows = status?.row_estimate != null ? formatCount(status.row_estimate) : DASH;
  const tables = status?.table_count != null ? formatCount(status.table_count) : DASH;

  const leagues = releaseTags ? String(warehouseLeagues(releaseTags).length) : DASH;
  const datasets = releaseTags ? String(releaseTags.length) : DASH;

  const pkgs = packages != null ? formatCount(packages) : DASH;

  // The heartbeat can report ok: false (a reachable source with nothing to say) yet
  // still ship stale numbers. Only date the section when the heartbeat vouches for
  // itself, or when it actually gave us the row/table figures those tiles show.
  const heartbeatLive =
    status?.ok === true || status?.row_estimate != null || status?.table_count != null;

  return {
    tiles: [
      { title: "Rows in the warehouse", value: rows },
      { title: "Tables in the warehouse", value: tables },
      { title: "Leagues in the warehouse", value: leagues },
      { title: "Datasets in the catalog", value: datasets },
      { title: "Open-source packages", value: pkgs },
    ],
    asOf: heartbeatLive && status?.collected_at ? status.collected_at.slice(0, 10) : null,
  };
}

/**
 * The leagues the warehouse holds: the sport bucket of each sportsdataverse-data release tag, without
 * "other" (an unmapped tag) and the archived "phf". Sorted, so a page can list them.
 */
export function warehouseLeagues(releaseTags: string[]): string[] {
  return [
    ...new Set(
      releaseTags.map((tag) => classifyReleaseTag(tag).sport).filter((sport) => sport !== "other" && sport !== "phf")
    ),
  ].sort();
}

/** League and row counts for the ticker, the home hero and /about: the figures /stats shows, or null. */
export type SiteFacts = {
  /** `"48.7M+"`, formatted as on /stats; null when the heartbeat has no row estimate. */
  rows: string | null;
  /** League keys (`cfb`, `nba`…); null when the release list did not load or is empty. */
  leagues: string[] | null;
};

export function siteFacts({ status, releaseTags }: Pick<WarehouseInput, "status" | "releaseTags">): SiteFacts {
  const leagues = releaseTags ? warehouseLeagues(releaseTags) : [];
  return {
    rows: status?.row_estimate != null ? formatCount(status.row_estimate) : null,
    leagues: leagues.length ? leagues : null,
  };
}

const leagueCount = (leagues: string[]) => `${leagues.length} league${leagues.length === 1 ? "" : "s"}`;

/** The ticker's warehouse facts; a fact whose figure is missing is left out, never guessed. */
export function tickerFacts(f: SiteFacts): string[] {
  return [
    ...(f.rows ? [`${f.rows} rows in the warehouse`] : []),
    ...(f.leagues ? [`${leagueCount(f.leagues)} in the warehouse`] : []),
  ];
}

/** `"48.7M+ rows across 10 leagues"`, either half alone, or null when neither figure loaded. */
export function warehousePhrase(f: SiteFacts): string | null {
  const rows = f.rows ? `${f.rows} rows` : null;
  const leagues = f.leagues ? leagueCount(f.leagues) : null;
  if (rows && leagues) return `${rows} across ${leagues}`;
  return rows ?? leagues;
}

/** /about's "Open data" pillar: the same figures, worded for a sentence, and none when none loaded. */
export function aboutOpenData({ rows, leagues }: SiteFacts): string {
  const what = `${rows ? `${rows} rows of ` : ""}play-by-play and stats${leagues ? ` across ${leagueCount(leagues)}` : ""}`;
  return `Nightly pipelines scrape, process, and publish season-level datasets as versioned releases: ${what}, loadable in one function call.`;
}

const LEAGUE_LABEL: Record<string, string> = {
  cfb: "CFB",
  mbb: "MBB",
  wbb: "WBB",
  nfl: "NFL",
  nba: "NBA",
  wnba: "WNBA",
  nhl: "NHL",
  pwhl: "PWHL",
  mlb: "MLB",
  baseball: "College baseball",
};

/** Display names for /about's league chips, in LEAGUE_LABEL's order; an unknown key is upper-cased last. */
export function leagueLabels(leagues: string[]): string[] {
  const order = Object.keys(LEAGUE_LABEL);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...leagues]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((k) => LEAGUE_LABEL[k] ?? k.toUpperCase());
}
