/**
 * Team-trends config for /platform/trends — SP+-Trends-style multi-season
 * charts over the ESPN team_season_stats releases (long format: one row per
 * team × stat × season with `stat_name`/`stat_display_name`/`value`; schema
 * verified 2026-07-12). CFB's power_index release carries a single season,
 * so v1 is the four basketball leagues (2002/2003 → current).
 */

export type TrendSport = {
  key: string;
  label: string;
  tag: string;
  assetPrefix: string;
};

export const TREND_SPORTS: TrendSport[] = [
  { key: "mbb", label: "MBB", tag: "espn_mens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_" },
  { key: "wbb", label: "WBB", tag: "espn_womens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_" },
  { key: "nba", label: "NBA", tag: "espn_nba_team_season_stats", assetPrefix: "team_season_stats_" },
  { key: "wnba", label: "WNBA", tag: "espn_wnba_team_season_stats", assetPrefix: "team_season_stats_" },
];
