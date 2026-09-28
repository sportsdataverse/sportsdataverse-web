/**
 * Win-probability chart config for /platform/wp. The season picker lists the
 * pbp release's season assets (`tag` + `assetPrefix`); games and plays are
 * read from the Data API: `{schema}.schedule?season=` for the game picker and
 * `{schema}.pbp?game_id=` for one game's WP series. Column names verified
 * against the live Data API (2026-09-27). MBB/WBB publish home_win_prob from
 * 2025 on; earlier seasons have the column but every value is null.
 *
 * Team colours (verified live 2026-09-28): MBB/WBB carry them on the schedule
 * row; CFB and NFL join the schedule's team key to a small team table
 * (`cfb.team_info` 684 rows, `nfl.teams` 36), read once per sport.
 */

export type WpSport = {
  key: string;
  label: string;
  tag: string;
  /** Season asset name prefix, e.g. "play_by_play_" -> play_by_play_2024.parquet */
  assetPrefix: string;
  /** Data API schema holding `schedule` and `pbp`. */
  schema: string;
  /** Game picker columns on `{schema}.schedule`. */
  schedule: {
    id: string;
    week?: string;
    home: string;
    away: string;
    /** Team keys joined to `teams.key` (CFB ids, NFL abbreviations). */
    homeId?: string;
    awayId?: string;
    /** Colour columns on the schedule row itself (MBB/WBB). */
    homeColor?: string;
    homeAlt?: string;
    awayColor?: string;
    awayAlt?: string;
    /** Extra filters, `col` or `col__op` (`__gte`, …), that keep games without
     *  plays out of the picker. The API ignores an unknown filter column, so
     *  test/wp.test.ts pins each sport's exact params. */
    filter?: Record<string, string>;
  };
  /** Team colour table on `{schema}`, when the schedule has no colours. */
  teams?: { table: string; key: string; color: string; alt: string };
  /** One game's WP series on `{schema}.pbp`. */
  cols: {
    gameId: string;
    /** Ordering column within a game (play sequence). */
    order: string;
    /** Home-perspective win probability, 0-1. */
    wp: string;
    period: string;
    clock?: string;
    text: string;
    /** Running score columns when the frame carries them. */
    homeScore?: string;
    awayScore?: string;
  };
};

export const WP_SPORTS: WpSport[] = [
  {
    key: "cfb",
    label: "CFB",
    tag: "espn_cfb_pbp",
    assetPrefix: "play_by_play_",
    schema: "cfb",
    // The schedule lists every division (3,801 games in 2024) and games not yet
    // played; pbp covers completed FBS home games plus some FCS ones (946).
    // cfb.schedule has no pbp flag, so this is a proxy with a known ceiling:
    // it drops 24-45 FCS-vs-FCS games a season that do have pbp and lists up to
    // 18 that don't (exact for 2026), and 2014/2019 pbp games that are missing
    // from the schedule itself can't be listed at all.
    // ponytail: proxy filter; upgrade to { PBP: "true" } like mbb/wbb once
    // sdv-db writes a PBP flag to cfb.schedule at ingest.
    schedule: {
      id: "game_id",
      week: "week",
      home: "home_team",
      away: "away_team",
      homeId: "home_id",
      awayId: "away_id",
      filter: { home_division: "fbs", completed: "true" },
    },
    teams: { table: "team_info", key: "team_id", color: "color", alt: "alt_color" },
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_wp_before",
      period: "period",
      clock: "clock.displayValue",
      text: "text",
      homeScore: "homeScore",
      awayScore: "awayScore",
    },
  },
  {
    key: "nfl",
    label: "NFL",
    tag: "nfl_model_pbp",
    assetPrefix: "model_pbp_",
    schema: "nfl",
    // The schedule carries the whole season up front; a score means it was
    // played (2024: 285 of 285; 2026 so far: 33 of 272).
    // Every schedule abbreviation 2002-2024 (OAK, SD, STL, LA, …) is in nfl.teams.
    schedule: {
      id: "game_id",
      week: "week",
      home: "home_team",
      away: "away_team",
      homeId: "home_team",
      awayId: "away_team",
      filter: { home_score__gte: "0" },
    },
    teams: { table: "teams", key: "team_abbr", color: "team_color", alt: "team_color2" },
    cols: {
      gameId: "game_id",
      order: "play_id",
      wp: "home_wp",
      period: "qtr",
      text: "desc",
    },
  },
  {
    key: "mbb",
    label: "MBB",
    tag: "espn_mens_college_basketball_pbp",
    assetPrefix: "play_by_play_",
    schema: "mbb",
    // The schedule's own pbp flag: exact both ways, 2006-2026.
    schedule: {
      id: "game_id",
      home: "home_display_name",
      away: "away_display_name",
      homeColor: "home_color",
      homeAlt: "home_alternate_color",
      awayColor: "away_color",
      awayAlt: "away_alternate_color",
      filter: { PBP: "true" },
    },
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_win_prob",
      period: "period_number",
      clock: "clock_display_value",
      text: "text",
      homeScore: "home_score",
      awayScore: "away_score",
    },
  },
  {
    key: "wbb",
    label: "WBB",
    tag: "espn_womens_college_basketball_pbp",
    assetPrefix: "play_by_play_",
    schema: "wbb",
    // The schedule's own pbp flag: exact both ways, 2006-2026.
    schedule: {
      id: "game_id",
      home: "home_display_name",
      away: "away_display_name",
      homeColor: "home_color",
      homeAlt: "home_alternate_color",
      awayColor: "away_color",
      awayAlt: "away_alternate_color",
      filter: { PBP: "true" },
    },
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_win_prob",
      period: "period_number",
      clock: "clock_display_value",
      text: "text",
      homeScore: "home_score",
      awayScore: "away_score",
    },
  },
];
