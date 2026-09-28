/**
 * Team-trends config for /platform/trends, all release parquet read in-browser
 * through DuckDB:
 * - long, by season: the ESPN hoops `team_season_stats` releases (one row per
 *   team × stat × season, `stat_name`/`stat_display_name`/`value`; schema
 *   verified 2026-07-12), every season file on one chart;
 * - wide, by week: the CFB/NFL weekly frames (one column per stat), one
 *   season's file charted by week within that season.
 */

/** Where team names live when the release's team column is an id: a Data API
 *  team table. The release id and `key` must both be `keyType`, or the join
 *  throws (lib/platform/trends.ts `teamNameLookup`). */
export type TeamNames = {
  schema: string;
  table: string;
  key: string;
  name: string;
  keyType: "number" | "string";
};

export type TrendSport = {
  key: string;
  label: string;
  tag: string;
  /** Season files are `${assetPrefix}${YYYY}.parquet`. */
  assetPrefix: string;
  format: "long" | "wide";
  /** season: every season file on one chart; week: one season, by week. */
  xAxis: "season" | "week";
  /** `stat` is long only: the column naming the stat. A wide source's stats
   *  are its numeric columns, listed by DESCRIBE at load. */
  cols: { team: string; season: string; week?: string; stat?: string };
  names?: TeamNames;
};

const HOOPS_COLS = { team: "team_display_name", season: "season", stat: "stat_name" };

export const TREND_SPORTS: TrendSport[] = [
  { key: "mbb", label: "MBB", tag: "espn_mens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  { key: "wbb", label: "WBB", tag: "espn_womens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  { key: "nba", label: "NBA", tag: "espn_nba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  { key: "wnba", label: "WNBA", tag: "espn_wnba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  // Weekly frames. Columns from DESCRIBE on each release's newest file
  // (2026; 2025 identical), 2026-09-28:
  // team_id VARCHAR, pos_team VARCHAR (the school), division, conference,
  // season BIGINT, through_week INTEGER, and 537 numeric stats (`*_off`,
  // `*_def`, `*_margin`, their `_n` counts and `_rank` columns).
  {
    key: "cfb_team_summaries_weekly",
    label: "CFB weekly",
    tag: "cfb_team_summaries_weekly",
    assetPrefix: "cfb_team_summaries_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "pos_team", season: "season", week: "through_week" },
  },
  // team_id VARCHAR of digits (the ESPN id, NOT a bigint), season BIGINT,
  // through_week INTEGER; stats adj_off_epa, adj_def_epa, adj_st_epa, adj_net,
  // fei_off, fei_def, fei_net, games, off_pace, off_rank, def_rank, net_rank,
  // net_z. Names: cfb.team_info (team_id bigint, school), ids cast to BIGINT.
  {
    key: "cfb_ratings_weekly",
    label: "CFB ratings",
    tag: "cfb_ratings_weekly",
    assetPrefix: "cfb_ratings_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "team_id", season: "season", week: "through_week" },
    names: { schema: "cfb", table: "team_info", key: "team_id", name: "school", keyType: "number" },
  },
  // team_id VARCHAR abbreviation (ARI, KC, LA…), season BIGINT, as_of_week
  // INTEGER; stats adj_off_epa, adj_def_epa, adj_st_epa, adj_net, games,
  // off_rank, def_rank, net_rank, net_z. nfl.teams.team_id is nflverse's
  // numeric id, not the abbreviation: the join key is team_abbr.
  {
    key: "nfl_ratings_weekly",
    label: "NFL ratings",
    tag: "nfl_ratings_weekly",
    assetPrefix: "nfl_ratings_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "team_id", season: "season", week: "as_of_week" },
    names: { schema: "nfl", table: "teams", key: "team_abbr", name: "team_name", keyType: "string" },
  },
];
