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
  /** The league's conferences or divisions, season by season (small
   *  multiples), and, for college hoops, the D-I list the band averages. */
  groups: TeamGroups;
};

/**
 * One mechanism for every source: the league's team-group release, tag
 * `<league>_groups` (all six exist). DESCRIBE, 2026-09-28, identical in every
 * league:
 * - `<league>_team_group_seasons.parquet` (membership): league, team_id_source,
 *   team_name, subdivision_id, conference_id, division_id, source, notes
 *   VARCHAR; season INTEGER; team_id VARCHAR (the ESPN id, all digits);
 *   sources_agree BOOLEAN. One row per team per season, keyed like the
 *   source's own seasons (hoops: the ending year). NFL `notes` read
 *   `abbr=KC` in every season; NBA's `nba_stats_team_id=…` (1997 on; `abbr=`
 *   before), WNBA's `wnba_stats_team_id=…`. Only D-I teams in mbb/wbb, every
 *   division in cfb.
 * - `<league>_group_seasons.parquet` (names): group_id, level, name,
 *   short_name, abbreviation, parent_group_id VARCHAR; season, n_teams
 *   INTEGER. The membership file has no group name: the UI shows short_name
 *   ("Big Ten", "AFC East").
 * Group ids are `<league>:<slug>` (`cfb:big-ten`, `nfl:afc-east`).
 */
export type TeamGroups = {
  tag: string;
  members: string;
  names: string;
  /** The membership column the panels group by. */
  level: "conference_id" | "division_id";
  /** The source column that joins membership `team_id`, and how (lib
   *  `assertGroupKeys`): an integer ESPN id CAST to text, a text ESPN id of
   *  digits, or an abbreviation mapped through the newest season's `abbr=`. */
  key: { col: string; kind: "integer" | "digits" | "abbr" };
  /** The band averages these teams only: the college files list non-D-I
   *  opponents too (MBB 2026: 727 teams, 365 D-I). */
  d1Band?: boolean;
};

const groupsOf = (league: string, level: TeamGroups["level"], key: TeamGroups["key"], d1Band = false): TeamGroups => ({
  tag: `${league}_groups`,
  members: `${league}_team_group_seasons.parquet`,
  names: `${league}_group_seasons.parquet`,
  level,
  key,
  ...(d1Band ? { d1Band } : {}),
});

// Levels, and the largest group in each source's seasons (2026-09-28):
// - CFB and the college hoops by conference: 18 (Big Ten 2024-26; MBB ACC and
//   Big Ten 2026, WBB the same). Division would split a conference.
// - NFL by division, the unit that decides a playoff spot: 4 since 2002, 6
//   (AFC Central) 1999-2001. A conference (16) is most of the league.
// - NBA by conference, 15: it seeds the playoffs; divisions (5) have not since 2016.
// - WNBA by conference, 8: it has no divisions.
const ESPN_ID = { col: "team_id", kind: "integer" } as const;

// The ratings frames' producer ranks, verified in sdv-py (dense ranks; def
// ascending, lower allowed EPA is better): sportsdataverse/cfb/cfb_ratings.py
// L689-691 and sportsdataverse/nfl/nfl_ratings.py L177-179 (`_add_ranks`).
const RATING_RANKS = { adj_off_epa: "off_rank", adj_def_epa: "def_rank", adj_net: "net_rank" } as const;

const HOOPS_COLS = { team: "team_display_name", season: "season", stat: "stat_name" };

export const TREND_SPORTS: TrendSport[] = [
  // The hoops files' team_id is INTEGER (the ESPN id): it joins as text.
  // Every NBA/WNBA team joins in every season; MBB/WBB join D-I only.
  { key: "mbb", label: "MBB", tag: "espn_mens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: groupsOf("mbb", "conference_id", ESPN_ID, true) },
  { key: "wbb", label: "WBB", tag: "espn_womens_college_basketball_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: groupsOf("wbb", "conference_id", ESPN_ID, true) },
  { key: "nba", label: "NBA", tag: "espn_nba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: groupsOf("nba", "conference_id", ESPN_ID) },
  { key: "wnba", label: "WNBA", tag: "espn_wnba_team_season_stats", assetPrefix: "team_season_stats_", format: "long", xAxis: "season", cols: HOOPS_COLS, groups: groupsOf("wnba", "conference_id", ESPN_ID) },
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
    // team_id is the ESPN id as digits; 136/136 teams join in 2025, every season 2004-2026.
    groups: groupsOf("cfb", "conference_id", { col: "team_id", kind: "digits" }),
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
    groups: groupsOf("cfb", "conference_id", { col: "team_id", kind: "digits" }),
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
    // The groups file keys the ESPN id, not the abbreviation. The ratings use
    // today's codes in every season (LA, LAC, LV in 2002), while a season's
    // notes use that season's (STL, SD, OAK): the map is the NEWEST season's
    // notes, 32/32 one-to-one; the ESPN id is stable across a move, so every
    // season 1999-2026 then joins 31-32/31-32.
    groups: groupsOf("nfl", "division_id", { col: "team_id", kind: "abbr" }),
  },
];
