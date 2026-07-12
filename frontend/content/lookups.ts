/**
 * Player/team lookup config for /platform/lookups — which release asset backs
 * each sport's search and which columns to show. Column names verified against
 * the live parquet schemas (2026-07-12). The `asset` pins the current-season
 * file; roll it forward when a new season's rosters release lands.
 */

export type LookupSport = {
  key: string;
  label: string;
  tag: string;
  asset: string;
  /** Column searched with ILIKE. */
  nameCol: string;
  /** Columns shown in the results grid, in order. */
  columns: { col: string; label: string }[];
  headshotCol?: string;
  teamCol: string;
};

/** The four ESPN basketball roster releases share one 36-column shape. */
const HOOPS_COLUMNS = [
  { col: "full_name", label: "Player" },
  { col: "team_display_name", label: "Team" },
  { col: "position_abbreviation", label: "Pos" },
  { col: "jersey", label: "#" },
  { col: "height", label: "Ht" },
  { col: "weight", label: "Wt" },
  { col: "experience_years", label: "Exp" },
  { col: "athlete_id", label: "ESPN id" },
];

const hoops = (key: string, label: string, tag: string, asset: string): LookupSport => ({
  key,
  label,
  tag,
  asset,
  nameCol: "full_name",
  columns: HOOPS_COLUMNS,
  headshotCol: "headshot_href",
  teamCol: "team_display_name",
});

export const LOOKUP_SPORTS: LookupSport[] = [
  hoops("nba", "NBA", "espn_nba_rosters", "rosters_2026.parquet"),
  hoops("wnba", "WNBA", "espn_wnba_rosters", "rosters_2026.parquet"),
  hoops("mbb", "MBB", "espn_mens_college_basketball_rosters", "rosters_2026.parquet"),
  hoops("wbb", "WBB", "espn_womens_college_basketball_rosters", "rosters_2026.parquet"),
  {
    key: "cfb",
    label: "CFB",
    tag: "espn_cfb_rosters",
    asset: "rosters_2024.parquet",
    nameCol: "display_name",
    columns: [
      { col: "display_name", label: "Player" },
      { col: "team_display_name", label: "Team" },
      { col: "jersey", label: "#" },
      { col: "display_height", label: "Ht" },
      { col: "display_weight", label: "Wt" },
      { col: "experience_display_value", label: "Exp" },
      { col: "athlete_id", label: "ESPN id" },
    ],
    headshotCol: "headshot_href",
    teamCol: "team_display_name",
  },
  {
    key: "nfl",
    label: "NFL",
    tag: "nfl_rosters",
    asset: "roster_2024.parquet",
    nameCol: "full_name",
    columns: [
      { col: "full_name", label: "Player" },
      { col: "team", label: "Team" },
      { col: "position", label: "Pos" },
      { col: "jersey_number", label: "#" },
      { col: "college", label: "College" },
      { col: "years_exp", label: "Exp" },
      { col: "gsis_id", label: "GSIS id" },
      { col: "espn_id", label: "ESPN id" },
    ],
    headshotCol: "headshot_url",
    teamCol: "team",
  },
];
