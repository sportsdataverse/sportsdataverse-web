/**
 * Tracked repos for the members-only /platform area.
 *
 * Single source of truth for which org repos the automation + dataset
 * dashboards cover. Editing this list is a deliberate, reviewable code change.
 * Inventory grounded in the org GraphQL sweep of 2026-07-11: every active
 * public repo with ≥1 active workflow or ≥1 release. Private repos are
 * excluded (the site's fine-grained PAT covers public repos only).
 *
 * `dispatchable` is an allowlist of workflow file names that may be triggered
 * via workflow_dispatch from the UI — anything not listed here can only be
 * observed, never dispatched.
 *
 * `hasReleases` puts the repo on the Datasets tab (release-asset registry).
 */
export type PlatformRepoKind = "raw" | "data" | "package";

export type PlatformRepo = {
  /** owner/name on GitHub */
  repo: string;
  kind: PlatformRepoKind;
  sport: string;
  /** Workflow file names (e.g. "scrape.yml") that may be dispatched from the UI. */
  dispatchable?: string[];
  /** Include this repo's GitHub releases on the Datasets page. */
  hasReleases?: boolean;
};

export const SDV_ORG_SLUG = "sportsdataverse";

const R = (
  repo: string,
  kind: PlatformRepoKind,
  sport: string,
  extra: Partial<PlatformRepo> = {}
): PlatformRepo => ({ repo: `${SDV_ORG_SLUG}/${repo}`, kind, sport, ...extra });

export const PLATFORM_REPOS: PlatformRepo[] = [
  // --- football ---------------------------------------------------------
  R("nfl-raw", "raw", "nfl"),
  R("nfl-data", "data", "nfl", {
    dispatchable: ["nfl_pbp_cron.yml", "nfl_rosters_players_cron.yml"],
  }),
  R("cfbfastR-raw", "raw", "cfb", { dispatchable: ["cfbfastR_data_trigger.yaml"] }),
  R("cfbfastR-cfb-raw", "raw", "cfb"),
  R("cfbfastR-data", "data", "cfb", { dispatchable: ["daily_cfb.yml", "update_rosters.yml"] }),
  R("cfbfastR-cfb-data", "data", "cfb", { hasReleases: true }),
  R("cfbfastR", "package", "cfb", { hasReleases: true }),
  R("cfb4th", "package", "cfb"),
  R("cfbseedR", "package", "cfb"),
  R("cfbplotR", "package", "cfb"),
  R("usfootballR", "package", "football"),
  // --- basketball -------------------------------------------------------
  R("hoopR-mbb-raw", "raw", "mbb"),
  R("hoopR-mbb-data", "data", "mbb"),
  R("hoopR-kp-data", "data", "mbb"),
  R("hoopR-nba-raw", "raw", "nba"),
  R("hoopR-nba-data", "data", "nba"),
  R("hoopR-nba-stats-data", "data", "nba"),
  R("hoopR", "package", "mbb/nba", { hasReleases: true }),
  R("wehoop-wbb-raw", "raw", "wbb"),
  R("wehoop-wbb-data", "data", "wbb"),
  R("wehoop-wnba-raw", "raw", "wnba"),
  R("wehoop-wnba-data", "data", "wnba"),
  R("wehoop-wnba-stats-data", "data", "wnba"),
  R("wehoop", "package", "wbb/wnba", { hasReleases: true }),
  // --- hockey -----------------------------------------------------------
  R("fastRhockey-nhl-raw", "raw", "nhl"),
  R("fastRhockey-nhl-data", "data", "nhl"),
  R("fastRhockey-pwhl-raw", "raw", "pwhl"),
  R("fastRhockey-pwhl-data", "data", "pwhl"),
  R("fastRhockey", "package", "hockey", { hasReleases: true }),
  // --- baseball ---------------------------------------------------------
  R("baseballr-data", "data", "baseball", { dispatchable: ["daily_ncaa_baseball.yml"] }),
  R("sportsdataverse-baseball-data", "data", "baseball"),
  // --- cross-sport / recruiting / odds -----------------------------------
  R("sportsdataverse-data", "data", "multi", { hasReleases: true }),
  R("recruitR", "package", "recruiting"),
  R("recruitR-py", "package", "recruiting"),
  R("oddsapiR", "package", "odds", { hasReleases: true }),
  // --- packages / sites ---------------------------------------------------
  R("sportsdataverse-py", "package", "multi", {
    hasReleases: true,
    dispatchable: ["live-tests-cron.yml", "validation-cron.yml"],
  }),
  R("sportsdataverse-R", "package", "multi"),
  R("sportsdataverse-js", "package", "multi", { hasReleases: true }),
  R("sportsdataverse-web", "package", "multi"),
  R("sportyR", "package", "viz", { hasReleases: true }),
  R("sportypy", "package", "viz", { hasReleases: true }),
];

/** True when `workflowFile` in `repo` is allowlisted for workflow_dispatch. */
export function isDispatchAllowed(repo: string, workflowFile: string): boolean {
  const entry = PLATFORM_REPOS.find((r) => r.repo === repo);
  return Boolean(entry?.dispatchable?.includes(workflowFile));
}

// ---------------------------------------------------------------------------
// sportsdataverse-data release classification
// ---------------------------------------------------------------------------

export type ReleaseGroup = {
  /** League/sport bucket the release belongs to (Datasets-page grouping key). */
  sport: string;
  /** Upstream data provider the release is scraped/derived from. */
  provider: string;
  /** owner/name of the repo whose jobs produce/refresh this release ("" = unknown). */
  producer: string;
};

/**
 * Rules mapping sportsdataverse-data release tags to (sport, provider,
 * producer). First match wins, so a prefix must precede any shorter prefix it
 * extends. Grounded in the 350-tag inventory of 2026-09-26; a tag matching no
 * rule lands in the "other" bucket, which is a signal to extend this table.
 */
const RELEASE_RULES: ({ prefix: string } & ReleaseGroup)[] = [
  // The ESPN box scores are still written by cfbfastR-data; every other espn_cfb_ tag by cfbfastR-cfb-data.
  { prefix: "espn_cfb_player_boxscores", sport: "cfb", provider: "espn", producer: "sportsdataverse/cfbfastR-data" },
  { prefix: "espn_cfb_team_boxscores", sport: "cfb", provider: "espn", producer: "sportsdataverse/cfbfastR-data" },
  { prefix: "espn_cfb_", sport: "cfb", provider: "espn", producer: "sportsdataverse/cfbfastR-cfb-data" },
  { prefix: "espn_nfl_", sport: "nfl", provider: "espn", producer: "sportsdataverse/nfl-data" },
  { prefix: "cfb_", sport: "cfb", provider: "sportsdataverse", producer: "sportsdataverse/cfbfastR-cfb-data" },
  { prefix: "ncaa_mfb_", sport: "cfb", provider: "ncaa", producer: "sportsdataverse/ncaa-mfb-football-data" },
  { prefix: "ncaa_mbb_", sport: "mbb", provider: "ncaa", producer: "sportsdataverse/ncaa-mbb-hoops-data" },
  { prefix: "ncaa_wbb_", sport: "wbb", provider: "ncaa", producer: "sportsdataverse/ncaa-wbb-hoops-data" },
  { prefix: "mbb_", sport: "mbb", provider: "sportsdataverse", producer: "sportsdataverse/hoopR-mbb-data" },
  { prefix: "wbb_", sport: "wbb", provider: "sportsdataverse", producer: "sportsdataverse/wehoop-wbb-data" },
  { prefix: "cfbfastR_cfb_", sport: "cfb", provider: "cfbfastR", producer: "sportsdataverse/cfbfastR-data" },
  { prefix: "espn_mens_college_basketball_", sport: "mbb", provider: "espn", producer: "sportsdataverse/hoopR-mbb-data" },
  { prefix: "espn_womens_college_basketball_", sport: "wbb", provider: "espn", producer: "sportsdataverse/wehoop-wbb-data" },
  { prefix: "espn_nba_", sport: "nba", provider: "espn", producer: "sportsdataverse/hoopR-nba-data" },
  { prefix: "espn_wnba_", sport: "wnba", provider: "espn", producer: "sportsdataverse/wehoop-wnba-data" },
  { prefix: "nba_stats_", sport: "nba", provider: "stats.nba.com", producer: "sportsdataverse/hoopR-nba-stats-data" },
  { prefix: "wnba_stats_", sport: "wnba", provider: "stats.wnba.com", producer: "sportsdataverse/wehoop-wnba-stats-data" },
  // Model outputs (player_impact) — after the *_stats_ rules, which they would shadow.
  { prefix: "nba_", sport: "nba", provider: "sportsdataverse", producer: "sportsdataverse/hoopR-nba-stats-data" },
  { prefix: "wnba_", sport: "wnba", provider: "sportsdataverse", producer: "sportsdataverse/wehoop-wnba-stats-data" },
  { prefix: "mlb_", sport: "mlb", provider: "mlb stats api", producer: "sportsdataverse/baseballr-data" },
  { prefix: "ncaa_baseball_", sport: "baseball", provider: "ncaa", producer: "sportsdataverse/baseballr-data" },
  { prefix: "nfl_ngs_", sport: "nfl", provider: "nfl next gen stats", producer: "sportsdataverse/nfl-ngs-data" },
  { prefix: "nfl_", sport: "nfl", provider: "nflverse/espn", producer: "sportsdataverse/nfl-data" },
  { prefix: "nhl_", sport: "nhl", provider: "nhl api", producer: "sportsdataverse/fastRhockey-nhl-data" },
  { prefix: "pwhl_", sport: "pwhl", provider: "hockeytech", producer: "sportsdataverse/fastRhockey-pwhl-data" },
  { prefix: "phf_", sport: "phf", provider: "archived (league defunct)", producer: "sportsdataverse/fastRhockey-pwhl-data" },
];

export function classifyReleaseTag(tag: string): ReleaseGroup {
  // Crosswalks: "<sport>_crosswalk", built by sportsdataverse-py tooling.
  const crosswalk = tag.match(/^([a-z]+)_crosswalk$/);
  if (crosswalk) {
    return {
      sport: crosswalk[1],
      provider: "sportsdataverse",
      producer: "sportsdataverse/sportsdataverse-py",
    };
  }
  // ESPN daily snapshots (espn_{league}_{injuries,depthcharts}) are all written
  // by cfbfastR-cfb-data's espn_daily_snapshots.yml, whatever the league.
  const snapshot = tag.match(/^espn_([a-z]+)_(injuries|depthcharts)$/);
  if (snapshot) {
    return { sport: snapshot[1], provider: "espn", producer: "sportsdataverse/cfbfastR-cfb-data" };
  }
  const rule = RELEASE_RULES.find((r) => tag.startsWith(r.prefix));
  return rule ?? { sport: "other", provider: "—", producer: "" };
}
