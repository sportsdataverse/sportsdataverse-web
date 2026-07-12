/**
 * Win-probability chart config for /platform/wp — which pbp release backs
 * each sport and the column map for the game picker + WP series. Column
 * names verified against the live parquet schemas (2026-07-12). MBB/WBB pbp
 * is now enriched in place with home_win_prob + pregame_home_prob (the
 * espn_*_college_basketball_pbp releases), so all four sports are wired.
 */

export type WpSport = {
  key: string;
  label: string;
  tag: string;
  /** Season asset name prefix, e.g. "play_by_play_" -> play_by_play_2024.parquet */
  assetPrefix: string;
  cols: {
    gameId: string;
    /** Ordering column within a game (play sequence). */
    order: string;
    /** Home-perspective win probability, 0-1. */
    wp: string;
    period: string;
    clock?: string;
    text: string;
    homeName: string;
    awayName: string;
    /** Running score columns when the frame carries them. */
    homeScore?: string;
    awayScore?: string;
    week?: string;
  };
};

export const WP_SPORTS: WpSport[] = [
  {
    key: "cfb",
    label: "CFB",
    tag: "espn_cfb_pbp",
    assetPrefix: "play_by_play_",
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_wp_before",
      period: "period",
      clock: "clock.displayValue",
      text: "text",
      homeName: "homeTeamName",
      awayName: "awayTeamName",
      homeScore: "homeScore",
      awayScore: "awayScore",
      week: "week",
    },
  },
  {
    key: "nfl",
    label: "NFL",
    tag: "nfl_model_pbp",
    assetPrefix: "model_pbp_",
    cols: {
      gameId: "game_id",
      order: "play_id",
      wp: "home_wp",
      period: "qtr",
      text: "desc",
      homeName: "home_team",
      awayName: "away_team",
      week: "week",
    },
  },
  {
    key: "mbb",
    label: "MBB",
    tag: "espn_mens_college_basketball_pbp",
    assetPrefix: "play_by_play_",
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_win_prob",
      period: "period_number",
      clock: "clock_display_value",
      text: "text",
      homeName: "home_team_name",
      awayName: "away_team_name",
      homeScore: "home_score",
      awayScore: "away_score",
    },
  },
  {
    key: "wbb",
    label: "WBB",
    tag: "espn_womens_college_basketball_pbp",
    assetPrefix: "play_by_play_",
    cols: {
      gameId: "game_id",
      order: "game_play_number",
      wp: "home_win_prob",
      period: "period_number",
      clock: "clock_display_value",
      text: "text",
      homeName: "home_team_name",
      awayName: "away_team_name",
      homeScore: "home_score",
      awayScore: "away_score",
    },
  },
];
