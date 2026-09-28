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
   *  are its numeric columns, listed by DESCRIBE at load. `games` (weekly
   *  only) dates the file: weeks past the last one that added games are a
   *  forward-filled tail and are not charted. */
  cols: { team: string; season: string; week?: string; stat?: string; games?: string };
  /** What a week number means on the x axis (weekly only). */
  weekLabel?: "Through week" | "Entering week";
  /** Group a long stat list into picker sections (lib `statGroups`). */
  groupStats?: boolean;
  names?: TeamNames;
  /** Stat → its producer rank column, where the rank is not `<stat>_rank`. */
  ranks?: Readonly<Record<string, string>>;
  /** Limit the league band to one division: a team-group-seasons release
   *  (`season` INTEGER, `team_id` VARCHAR ESPN id, one row per D-I team per
   *  season, keyed by the ending year like the ESPN files). The ESPN hoops
   *  files' `team_id` is INTEGER: the join casts it to text. */
  groups?: { tag: string; asset: string };
};

// The ratings frames' producer ranks, verified in sdv-py (dense ranks; def
// ascending, lower allowed EPA is better): sportsdataverse/cfb/cfb_ratings.py
// L689-691 and sportsdataverse/nfl/nfl_ratings.py L177-179 (`_add_ranks`).
const RATING_RANKS = { adj_off_epa: "off_rank", adj_def_epa: "def_rank", adj_net: "net_rank" } as const;

const HOOPS_COLS = { team: "team_display_name", season: "season", stat: "stat_name" };

export const TREND_SPORTS: TrendSport[] = [
  // The college files list non-D-I opponents too (MBB 2026: 727 teams, 365
  // D-I), so their band is D-I only.
  { key: "mbb", label: "MBB", tag: "espn_mens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: { tag: "mbb_groups", asset: "mbb_team_group_seasons.parquet" } },
  { key: "wbb", label: "WBB", tag: "espn_womens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: { tag: "wbb_groups", asset: "wbb_team_group_seasons.parquet" } },
  { key: "nba", label: "NBA", tag: "espn_nba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  { key: "wnba", label: "WNBA", tag: "espn_wnba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS },
  // Weekly frames. Columns from DESCRIBE on each release's newest file
  // (2026; 2025 identical), 2026-09-28:
  // team_id, pos_team (the school), division, conference, fbs_class VARCHAR;
  // season BIGINT; through_week INTEGER (W = through week W); and 535 numeric
  // columns: `*_off`, `*_def`, their `_pass`/`_rush` splits, `*_margin`, 144
  // `_n` sample sizes (not charted) and 186 `_rank` columns. playsgame_off_n
  // equals the ratings' `games` on every joined row.
  {
    key: "cfb_team_summaries_weekly",
    label: "CFB weekly",
    tag: "cfb_team_summaries_weekly",
    assetPrefix: "cfb_team_summaries_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "pos_team", season: "season", week: "through_week", games: "playsgame_off_n" },
    weekLabel: "Through week",
    groupStats: true,
  },
  // team_id VARCHAR of digits (the ESPN id, NOT a bigint), season BIGINT,
  // through_week INTEGER (W = through week W); stats adj_off_epa, adj_def_epa,
  // adj_st_epa, adj_net, fei_off, fei_def, fei_net, games, off_pace, off_rank,
  // def_rank, net_rank, net_z. Names: cfb.team_info (team_id bigint, school);
  // a release id must be all digits to join (lib `releaseKey`).
  {
    key: "cfb_ratings_weekly",
    label: "CFB ratings",
    tag: "cfb_ratings_weekly",
    assetPrefix: "cfb_ratings_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "team_id", season: "season", week: "through_week", games: "games" },
    weekLabel: "Through week",
    names: { schema: "cfb", table: "team_info", key: "team_id", name: "school", keyType: "number" },
    ranks: RATING_RANKS,
  },
  // team_id VARCHAR abbreviation (ARI, KC, LA…), season BIGINT, as_of_week
  // INTEGER (W = the rating entering week W); stats adj_off_epa, adj_def_epa, adj_st_epa, adj_net, games,
  // off_rank, def_rank, net_rank, net_z. nfl.teams.team_id is nflverse's
  // numeric id, not the abbreviation: the join key is team_abbr.
  {
    key: "nfl_ratings_weekly",
    label: "NFL ratings",
    tag: "nfl_ratings_weekly",
    assetPrefix: "nfl_ratings_weekly_",
    format: "wide",
    xAxis: "week",
    cols: { team: "team_id", season: "season", week: "as_of_week", games: "games" },
    weekLabel: "Entering week",
    names: { schema: "nfl", table: "teams", key: "team_abbr", name: "team_name", keyType: "string" },
    ranks: RATING_RANKS,
  },
];
