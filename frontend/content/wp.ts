/**
 * Win-probability chart config for /platform/wp. The season picker lists the
 * pbp release's season assets (`tag` + `assetPrefix`); games and plays are
 * read from the Data API: `{schema}.schedule?season=` for the game picker and
 * `{schema}.pbp?game_id=` for one game's WP series. Column names verified
 * against the live Data API (2026-09-27). MBB/WBB publish home_win_prob from
 * 2025 on; earlier seasons have the column but every value is null.
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
    /** Extra equality filters, for a schedule wider than the pbp coverage. */
    filter?: Record<string, string>;
  };
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
    // The schedule lists every division (3,801 games in 2024); pbp covers FBS
    // home games plus a few FCS ones (944). Without this, 3 of 4 picks are empty.
    schedule: { id: "game_id", week: "week", home: "home_team", away: "away_team", filter: { home_division: "fbs" } },
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
    schedule: { id: "game_id", week: "week", home: "home_team", away: "away_team" },
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
    schedule: { id: "game_id", home: "home_display_name", away: "away_display_name" },
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
    schedule: { id: "game_id", home: "home_display_name", away: "away_display_name" },
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
