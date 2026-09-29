import { hoopsNames, type ScatterNames } from "./scatter.ts";

/**
 * Leaderboards for /platform/ratings: the published ratings and impact models,
 * one league × season per view, every row as the producer wrote it, in the
 * shared ResultsGrid.
 *
 * Verified live 2026-09-28: `columns` is each table's catalog, pasted from
 * `/v1/{schema}/tables` (NFL: the newest release file's parquet schema, as
 * DuckDB types). 2026 rows: NBA 582 players (+230 playoff rows the filter
 * drops), WNBA 238 (+87), MBB 727 teams (365 D-I), WBB 663 (363 D-I), CFB 138,
 * NFL 32 per week (weeks 2-3 in nfl_ratings_weekly_2026.parquet).
 *
 * Traps, each handled here rather than in the page (the same as Scatter's,
 * content/scatter.ts):
 * - player_impact holds playoff rows beside the regular season: `filter`.
 * - College hoops ratings list every ESPN team, non-D-I too: `names.only`
 *   keeps the season's D-I list. Their `rank` is over every rated team, D-I
 *   or not (rank max = row count in every season 2006-2026), so a D-I list's
 *   ranks have gaps: shown as the producer wrote them, never recomputed.
 * - The NFL team key is the abbreviation; nfl.teams.team_id is nflverse's
 *   numeric id, so the names join on team_abbr (32/32 in 2026).
 * - The NFL week column is `as_of_week` (W = the rating entering week W).
 *
 * Every default order is the model's headline rating, highest first. A
 * producer rank column (`rank`) is the rank of that same rating (checked on
 * 2026 rows: rank ascends as the rating descends), so the grid's order and the
 * producer's rank agree.
 */

/** Where a league's rows come from: a Data API table (one read per season),
 *  or a release whose season files (`${assetPrefix}${YYYY}.parquet`) DuckDB
 *  reads, at the file's newest `week`, which the span line names with
 *  `weekLabel`. */
type From =
  | { source: "api"; schema: string; table: string; filter?: Readonly<Record<string, string>> }
  | { source: "release"; tag: string; assetPrefix: string; week: string; weekLabel: string };

export type RatingSource = From & {
  /** The league pill and the span line ("Every NBA player …"). */
  label: string;
  noun: "players" | "teams";
  /** The live catalog: column → type (the grid's header tooltip). */
  columns: Readonly<Record<string, string>>;
  /** The grid's columns, in order; a team source's name column comes first. The
   *  id column comes last: it is what a pinned row is kept by (`grid.pin`). */
  select: readonly string[];
  /** Data API order: the rating the board ranks by, `-` for highest first. */
  order: string;
  /** The producer's rank of that rating, shown, never computed. */
  rank?: string;
  /** A fixed filter's scope for the span line ("regular season"). */
  scope?: string;
  /** What the span line says is shown for sample size (there is no minimum). */
  sample: string;
  /** A team id column named from a Data API team table. */
  names?: ScatterNames;
  /** "Chart this": two numeric columns to open in Scatter, on the same table
   *  and season. Only for a table content/scatter.ts lists: offence on x,
   *  defence on y. WBB ratings and the NFL release file have no Scatter
   *  source, so no button. */
  chart?: { x: string; y: string };
};

/** The name column a team source's grid starts with. */
export const TEAM_COL = "team";

// nba and wnba player_impact share one schema.
const PLAYER_IMPACT = {
  player_id: "bigint", player_name: "text", team_id: "bigint", team_abbreviation: "text", team_name: "text",
  teams: "text", season: "bigint", season_type: "text", o_rapm: "double precision", d_rapm: "double precision",
  rapm: "double precision", off_poss: "bigint", def_poss: "bigint", o_adj_rapm: "double precision",
  d_adj_rapm: "double precision", adj_rapm: "double precision", ospm: "double precision", dspm: "double precision",
  spm: "double precision", min: "double precision", gp: "bigint", obpm: "double precision", dbpm: "double precision",
  bpm: "double precision", war: "double precision", darko_filtered_skill: "double precision",
  darko_projected_rating: "double precision", darko_projected_sd: "double precision",
} as const;

// mbb and wbb ratings share one schema; team_id is TEXT, as is team_group_seasons.team_id.
const HOOPS_RATINGS = {
  season: "bigint", team_id: "text", adj_o: "double precision", adj_d: "double precision", adj_em: "double precision",
  adj_tempo: "double precision", raw_o: "double precision", raw_d: "double precision", games: "bigint", rank: "bigint",
  adj_em_z: "double precision",
} as const;

// cfb.ratings.team_id is BIGINT, as is cfb.team_info.team_id.
const CFB_RATINGS = {
  season: "bigint", team_id: "bigint", adj_off_epa: "double precision", adj_def_epa: "double precision",
  adj_st_epa: "double precision", adj_net: "double precision", fei_off: "double precision", fei_def: "double precision",
  fei_net: "double precision", games: "bigint", off_pace: "double precision", off_rank: "bigint", def_rank: "bigint",
  net_rank: "bigint", net_z: "double precision",
} as const;

// nfl_ratings_weekly_2026.parquet (2023-2025 identical); team_id is the abbreviation.
const NFL_RATINGS = {
  season: "BIGINT", team_id: "VARCHAR", adj_off_epa: "DOUBLE", adj_def_epa: "DOUBLE", adj_st_epa: "DOUBLE",
  adj_net: "DOUBLE", games: "BIGINT", off_rank: "BIGINT", def_rank: "BIGINT", net_rank: "BIGINT", net_z: "DOUBLE",
  as_of_week: "INTEGER",
} as const;

// RAPM ranks: the one model of the five fit on possessions rather than the
// box score (SPM, BPM, WAR and DARKO all start from it), which sit beside it.
// No producer rank column.
const impact = (schema: "nba" | "wnba", label: string): RatingSource => ({
  source: "api",
  schema,
  table: "player_impact",
  filter: { season_type: "Regular Season" },
  label,
  noun: "players",
  columns: PLAYER_IMPACT,
  select: ["player_name", "team_abbreviation", "gp", "min", "off_poss", "def_poss", "rapm", "o_rapm", "d_rapm", "spm", "bpm", "war", "darko_projected_rating", "player_id"],
  order: "-rapm",
  scope: "regular season",
  sample: "possessions (off_poss, def_poss) shown",
  chart: { x: "o_rapm", y: "d_rapm" },
});

// Adjusted efficiency margin (adj_o - adj_d, exactly, on 2026 rows): the
// rating `rank` ranks.
const hoops = (schema: "mbb" | "wbb", label: string): RatingSource => ({
  source: "api",
  schema,
  table: "ratings",
  label,
  noun: "teams",
  columns: HOOPS_RATINGS,
  select: [TEAM_COL, "rank", "adj_em", "adj_o", "adj_d", "adj_tempo", "adj_em_z", "games", "team_id"],
  order: "-adj_em",
  rank: "rank",
  sample: "games shown",
  names: hoopsNames(schema, "team_id"),
});

// Net adjusted EPA per play (adj_off_epa - adj_def_epa, exactly, on 2026
// rows; special teams sit beside it): the rating `net_rank` ranks. net_z is
// the same order, standardised.
const FOOTBALL_SELECT = [TEAM_COL, "net_rank", "adj_net", "adj_off_epa", "off_rank", "adj_def_epa", "def_rank", "adj_st_epa", "net_z", "games", "team_id"];

export const RATINGS: Readonly<Record<string, RatingSource>> = {
  nba: impact("nba", "NBA"),
  wnba: impact("wnba", "WNBA"),
  mbb: { ...hoops("mbb", "MBB"), chart: { x: "adj_o", y: "adj_d" } },
  wbb: hoops("wbb", "WBB"),
  cfb: {
    source: "api",
    schema: "cfb",
    table: "ratings",
    label: "CFB",
    noun: "teams",
    // cfb.ratings is FBS-only: every 2026 id is classification fbs in cfb.team_info.
    scope: "FBS",
    columns: CFB_RATINGS,
    select: FOOTBALL_SELECT,
    order: "-adj_net",
    rank: "net_rank",
    sample: "games shown",
    names: { schema: "cfb", table: "team_info", key: "team_id", name: "school", keyType: "number", col: "team_id" },
    chart: { x: "adj_off_epa", y: "adj_def_epa" },
  },
  nfl: {
    source: "release",
    tag: "nfl_ratings_weekly",
    assetPrefix: "nfl_ratings_weekly_",
    week: "as_of_week",
    weekLabel: "entering week",
    label: "NFL",
    noun: "teams",
    columns: NFL_RATINGS,
    select: FOOTBALL_SELECT,
    order: "-adj_net",
    rank: "net_rank",
    sample: "games shown",
    names: { schema: "nfl", table: "teams", key: "team_abbr", name: "team_name", keyType: "string", col: "team_id" },
  },
};
