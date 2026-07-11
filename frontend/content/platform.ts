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
