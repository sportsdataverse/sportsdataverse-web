/**
 * Hover glossary for the platform data surfaces.
 *
 * Curated descriptions for the column names and tables that recur across the
 * warehouse (mirrors the sdv-py returns-table language). Lookup is by bare
 * column name with a dtype fallback, so every tooltip shows *something* and
 * known names show a real definition. Extend freely — one entry here surfaces
 * everywhere (grid headers, column chips, filter selects).
 */

export const COLUMN_GLOSSARY: Record<string, string> = {
  // identity / keys
  season: "Season, keyed by the 4-digit ending year (2024 = the 2023-24 cross-year season).",
  season_type: "Regular season vs postseason indicator (provider-coded).",
  week: "Week number within the season.",
  game_id: "Unique game identifier (provider-native; join key across game tables).",
  game_date: "Calendar date the game was played.",
  team_id: "Unique team identifier — the join key to team/roster tables.",
  athlete_id: "Unique player identifier (ESPN athlete id).",
  player_id: "Unique player identifier (stats-provider person id).",
  play_id: "Unique play identifier within a game.",
  drive_id: "Unique drive identifier (football) — groups plays into possessions.",
  pos_team: "The team in possession on this row (offense).",
  def_pos_team: "The team defending on this row.",
  posteam: "Offense (possession team) — nflverse naming.",
  defteam: "Defense — nflverse naming.",
  home_team: "Home team name/abbreviation.",
  away_team: "Away team name/abbreviation.",
  conference: "Conference the team belongs to.",
  division: "Division/level (e.g. FBS) or divisional grouping.",

  // core advanced metrics
  epa: "Expected Points Added — change in expected points from before to after the play.",
  wpa: "Win Probability Added — change in win probability attributable to the play.",
  wp: "Pre-play win probability for the possession/home team (model output, 0-1).",
  home_wp: "Home team's win probability at this point in the game (0-1).",
  vegas_wp: "Win probability from the spread-informed model.",
  success: "Success indicator — whether the play beat the efficiency baseline (EPA > 0).",
  explosiveness: "Average EPA on successful plays — how big the wins are when they win.",
  havoc: "Havoc rate — share of plays with a TFL, forced fumble, pass breakup, or INT.",
  adj_off_epa: "Opponent-adjusted offensive EPA per play (ridge-adjusted for schedule).",
  adj_def_epa: "Opponent-adjusted defensive EPA per play allowed — negative is better.",
  adj_st_epa: "Opponent-adjusted special-teams EPA per play.",
  adj_net: "Net adjusted EPA per play: adj_off_epa − adj_def_epa. The single-number team rating.",
  net_adj_epa: "Net adjusted EPA per play: adjusted offense minus adjusted defense.",
  fei_net: "FEI-style net efficiency rating (possession-based, opponent-adjusted).",
  off_rank: "Rank of adjusted offensive EPA within the season (1 = best).",
  def_rank: "Rank of adjusted defensive EPA within the season (1 = best).",
  net_rank: "Rank of net adjusted EPA within the season (1 = best).",
  net_z: "Net adjusted EPA expressed as a z-score against the season's distribution.",
  pctile: "Percentile bucket (0-100) this row's distribution values describe.",

  // play-by-play context
  period: "Period/quarter number (values above 4 are overtime).",
  clock: "Game clock display at the snap/event.",
  down: "Down (football).",
  distance: "Yards to gain for a first down.",
  yards_gained: "Yards gained on the play.",
  yard_line: "Field position at the snap.",
  play_type: "Provider-coded play type (rush, pass, kickoff, ...).",
  play_text: "Narrative description of the play.",
  text: "Narrative description of the play/event.",
  score_differential: "Possession team score minus opponent score before the play.",
  home_score: "Home team score after/at the row's event.",
  away_score: "Away team score after/at the row's event.",

  // box / season stats
  min: "Minutes played.",
  pts: "Points.",
  reb: "Total rebounds.",
  ast: "Assists.",
  stl: "Steals.",
  blk: "Blocks.",
  tov: "Turnovers.",
  fg_pct: "Field-goal percentage.",
  fg3_pct: "Three-point percentage.",
  ft_pct: "Free-throw percentage.",
  plus_minus: "Team point differential while the player was on the floor.",
  num: "Jersey number worn by the player.",
  exp: "Years of playing experience entering the season ('R' = rookie).",

  // roster / people
  full_name: "Player full display name.",
  position: "Listed position.",
  height: "Listed height.",
  weight: "Listed weight (lbs).",
  birth_date: "Date of birth.",
  headshot_url: "URL of the player's headshot image.",
};

/** Table-level blurbs, keyed by bare table name (schema-agnostic). */
export const TABLE_GLOSSARY: Record<string, string> = {
  pbp: "Play-by-play — one row per play/event with model enrichment (EPA/WP where available).",
  schedule: "One row per game: matchup, date, venue, scores, status.",
  team_box: "Team box scores — one row per team per game.",
  player_box: "Player box scores — one row per player per game.",
  rosters: "Season rosters — one row per player per team-season.",
  game_rosters: "Game-level rosters — who was on the roster for each game.",
  standings: "Season standings snapshots.",
  shots: "Shot-level detail with coordinates where the provider ships them.",
  ratings: "Opponent-adjusted team ratings — one row per team-season (adj EPA, FEI, ranks).",
  team_summaries: "The wide team-season profile: adjusted EPA, success/explosiveness splits, situational rates.",
  percentiles: "Season distribution percentiles for the summary metrics (one row per percentile).",
  betting: "Closing/consensus betting lines per game.",
  drives: "Drive-level summaries (football).",
  model_pbp: "Model-scored play-by-play from the in-house EPA/WP models.",
  player_impact: "Player impact/on-off value model output.",
  lineups: "Lineup-level (multi-player unit) stats.",
  player_game_logs: "One row per player per game — the stats-provider game log.",
  player_season_stats: "Player season aggregates.",
  team_season_stats: "Team season aggregates.",
  officials: "Game officials assignments.",
  coaches: "Coach records per team-season.",
  schedule_crosswalk: "Id-mapping between providers for games.",
  player_crosswalk: "Id-mapping between providers for players.",
  team_crosswalk: "Id-mapping between providers for teams.",
  fpi_weekly: "ESPN FPI weekly snapshots.",
};

/** Tooltip text for a column: glossary hit + dtype, or dtype alone. */
export function columnTip(name: string, dtype?: string): string {
  const desc = COLUMN_GLOSSARY[name];
  const type = dtype ? ` (${dtype})` : "";
  return desc ? `${name}${type} — ${desc}` : `${name}${type}`;
}

/** Tooltip text for a table chip. */
export function tableTip(name: string): string {
  const desc = TABLE_GLOSSARY[name];
  return desc ? `${name} — ${desc}` : name;
}
