/**
 * Player/team lookup config for /platform/lookups — which release asset backs
 * each sport's search and which columns to show. Column names verified against
 * the live parquet schemas (2026-09-26). Each sport names its season-file
 * prefix; the client reads the newest `<prefix><YYYY>.parquet` in the release,
 * so a new season's rosters appear without a code change.
 */

export type LookupSport = {
  key: string;
  label: string;
  tag: string;
  /** Season asset prefix: `<prefix><YYYY>.parquet`. */
  assetPrefix: string;
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

const hoops = (key: string, label: string, tag: string): LookupSport => ({
  key,
  label,
  tag,
  assetPrefix: "rosters_",
  nameCol: "full_name",
  columns: HOOPS_COLUMNS,
  headshotCol: "headshot_href",
  teamCol: "team_display_name",
});

export const LOOKUP_SPORTS: LookupSport[] = [
  hoops("nba", "NBA", "espn_nba_rosters"),
  hoops("wnba", "WNBA", "espn_wnba_rosters"),
  hoops("mbb", "MBB", "espn_mens_college_basketball_rosters"),
  hoops("wbb", "WBB", "espn_womens_college_basketball_rosters"),
  {
    key: "cfb",
    label: "CFB",
    tag: "espn_cfb_rosters",
    assetPrefix: "cfb_rosters_",
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
    assetPrefix: "roster_",
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

/** Newest `<prefix><YYYY>.parquet` among a release's asset names, or null. */
export function newestSeasonAsset(names: string[], prefix: string): string | null {
  const re = new RegExp(`^${prefix}(\\d{4})\\.parquet$`);
  let best: { name: string; year: number } | null = null;
  for (const name of names) {
    const m = re.exec(name);
    if (m && (!best || Number(m[1]) > best.year)) best = { name, year: Number(m[1]) };
  }
  return best?.name ?? null;
}
