/**
 * Tracked repos for the members-only /platform area.
 *
 * Single source of truth for which org repos the automation + dataset
 * dashboards cover. Editing this list is a deliberate, reviewable code change.
 *
 * `dispatchable` is an allowlist of workflow file names that may be triggered
 * via workflow_dispatch from the UI — anything not listed here can only be
 * observed, never dispatched.
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

export const PLATFORM_REPOS: PlatformRepo[] = [
  { repo: "sportsdataverse/nfl-raw", kind: "raw", sport: "nfl" },
  {
    repo: "sportsdataverse/nfl-data",
    kind: "data",
    sport: "nfl",
    hasReleases: true,
    dispatchable: ["nfl_pbp_cron.yml", "nfl_rosters_players_cron.yml"],
  },
  {
    repo: "sportsdataverse/cfbfastR-raw",
    kind: "raw",
    sport: "cfb",
    dispatchable: ["cfbfastR_data_trigger.yaml"],
  },
  {
    repo: "sportsdataverse/cfbfastR-data",
    kind: "data",
    sport: "cfb",
    hasReleases: true,
    dispatchable: ["daily_cfb.yml", "update_rosters.yml"],
  },
  {
    repo: "sportsdataverse/hoopR-data",
    kind: "data",
    sport: "mbb/nba",
    hasReleases: true,
    dispatchable: ["scrape_mbb.yml", "scrape_nba.yml"],
  },
  { repo: "sportsdataverse/wehoop-data", kind: "data", sport: "wbb/wnba", hasReleases: true },
  { repo: "sportsdataverse/fastRhockey-data", kind: "data", sport: "hockey", hasReleases: true },
  {
    repo: "sportsdataverse/baseballr-data",
    kind: "data",
    sport: "mlb",
    hasReleases: true,
    dispatchable: ["daily_ncaa_baseball.yml"],
  },
  { repo: "sportsdataverse/sportsdataverse-data", kind: "data", sport: "multi", hasReleases: true },
  {
    repo: "sportsdataverse/sportsdataverse-py",
    kind: "package",
    sport: "multi",
    dispatchable: ["live-tests-cron.yml", "validation-cron.yml"],
  },
];

/** True when `workflowFile` in `repo` is allowlisted for workflow_dispatch. */
export function isDispatchAllowed(repo: string, workflowFile: string): boolean {
  const entry = PLATFORM_REPOS.find((r) => r.repo === repo);
  return Boolean(entry?.dispatchable?.includes(workflowFile));
}
