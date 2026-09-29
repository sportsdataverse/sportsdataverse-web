import type { TeamNames } from "./trends.ts";

/**
 * Sources for /platform/scatter: curated wide Data API tables, one row per
 * player (or team) per season, read with one `/api/platform/query/run` call
 * per (source, season). Every numeric column that is not an id or the season
 * is an axis (lib/platform/viz/scatterMath.ts `numericColumns`).
 *
 * Verified 2026-09-28 through the member proxy (`/api/platform/query/tables`,
 * `/api/platform/query/run`): axes = numeric columns less ids and season;
 * rows = the largest season under `filter`, before the D-I cut. None comes
 * near the Data API's 50,000-row cap; the plan's `limit=5000` would have cut
 * 27 college seasons.
 *
 * | source                        | axes          | largest season                   |
 * |-------------------------------|---------------|----------------------------------|
 * | nba.player_impact             | 20            | 605 (2022)                       |
 * | wnba.player_impact            | 20            | 238 (2026)                       |
 * | nba_stats.player_season_stats | 201 (74 used) | 605 (2022)                       |
 * | mbb.player_value              | 4             | 9,990 (2026; 5,015 D-I)          |
 * | wbb.player_value              | 4             | 8,305 (2026; 4,692 D-I)          |
 * | cfb.passing/rushing/receiving | 65 / 39 / 47  | 635 / 1,673 / 2,331              |
 * | nfl.passing/rushing/receiving | 74 / 39 / 47  | 123 / 371 / 551                  |
 * | cfb.ratings                   | 13            | 138; 138 of 138 ids named        |
 * | mbb.ratings                   | 9             | 727 (2026; 365 D-I, all named)   |
 *
 * Traps, each handled here rather than in the page:
 * - player_impact and player_season_stats hold playoff rows beside the
 *   regular season (a player twice per season): `filter` keeps one.
 * - nba_stats.player_season_stats is long by measure type × per mode ×
 *   season type (~24 rows per player-season, each measure type filling its
 *   own columns): one slice, advanced per game. Empty columns leave the rail.
 * - Team tables and college player_value carry a team id, no name: `names`.
 * - College hoops tables hold every ESPN team, non-D-I too (mbb.ratings 2026:
 *   362 of 727, median 1 game): `names.only` keeps the season's D-I list
 *   (team_group_seasons), the rule Trends' band has used since P7 T3.
 * - The NFL team key is an abbreviation (`pos_team`), shown as is.
 * - NBA, WNBA and NFL rows carry the full team name (`team_name`) beside the
 *   abbreviation, for the highlight to match; nba_stats and the college
 *   sources carry one team string only.
 */

/** A team-id column named from a Data API table (lib/platform/trends.ts
 *  `teamNameLookup`, which asserts both keys are `keyType`). `col` is the
 *  source column it renames; `bySeason` reads only the viewed season's rows.
 *  `only` names the population the table lists ("D-I"): rows whose `col` is
 *  not in it are left out and counted in the note. */
export type ScatterNames = TeamNames & { col: string; bySeason?: boolean; only?: string };

export type ScatterSource = {
  schema: string;
  table: string;
  /** The source picker's text. */
  label: string;
  /** What a mark is, in the note ("12 players have no value for …"). */
  noun: "players" | "teams";
  idCol: string;
  labelCol: string;
  teamCol?: string;
  /** The team's full name where `teamCol` is an abbreviation: a highlight
   *  chip matches either ("BOS", "Boston Celtics"). */
  teamNameCol?: string;
  seasonCol: string;
  /** Fixed Data API filters, sent with every read of the source. */
  filter?: Readonly<Record<string, string>>;
  names?: ScatterNames;
};

const player = (
  schema: string,
  table: string,
  label: string,
  labelCol: string,
  teamCol: string,
  filter?: Record<string, string>,
  teamNameCol?: string
): ScatterSource => ({
  schema,
  table,
  label,
  noun: "players",
  idCol: "player_id",
  labelCol,
  teamCol,
  teamNameCol,
  seasonCol: "season",
  filter,
});

/** A college hoops team id named from the season's D-I list (also /platform/ratings). */
export const hoopsNames = (league: "mbb" | "wbb", col: string): ScatterNames => ({
  schema: league,
  table: "team_group_seasons",
  key: "team_id",
  name: "team_name",
  keyType: "string",
  col,
  bySeason: true,
  only: "D-I",
});

/** The first entry is the default: a link without schema/table shows it, so
 *  reordering this list changes what every old default link shows. */
export const SCATTER_SOURCES: readonly ScatterSource[] = [
  player("nba", "player_impact", "NBA player impact", "player_name", "team_abbreviation", { season_type: "Regular Season" }, "team_name"),
  player("wnba", "player_impact", "WNBA player impact", "player_name", "team_abbreviation", { season_type: "Regular Season" }, "team_name"),
  player("nba_stats", "player_season_stats", "NBA advanced, per game (NBA Stats)", "player_name", "team_abbreviation", {
    season_type: "regular-season",
    measure_type: "advanced",
    per_mode: "pergame",
  }),
  { ...player("mbb", "player_value", "MBB player value", "player", "team_id"), names: hoopsNames("mbb", "team_id") },
  { ...player("wbb", "player_value", "WBB player value", "player", "team_id"), names: hoopsNames("wbb", "team_id") },
  player("cfb", "passing", "CFB passing", "passer_player_name", "pos_team"),
  player("cfb", "rushing", "CFB rushing", "rusher_player_name", "pos_team"),
  player("cfb", "receiving", "CFB receiving", "receiver_player_name", "pos_team"),
  player("nfl", "passing", "NFL passing", "passer_player_name", "pos_team", undefined, "team_name"),
  player("nfl", "rushing", "NFL rushing", "rusher_player_name", "pos_team", undefined, "team_name"),
  player("nfl", "receiving", "NFL receiving", "receiver_player_name", "pos_team", undefined, "team_name"),
  {
    schema: "cfb",
    table: "ratings",
    label: "CFB team ratings",
    noun: "teams",
    idCol: "team_id",
    labelCol: "team_id",
    seasonCol: "season",
    names: { schema: "cfb", table: "team_info", key: "team_id", name: "school", keyType: "number", col: "team_id" },
  },
  {
    schema: "mbb",
    table: "ratings",
    label: "MBB team ratings",
    noun: "teams",
    idCol: "team_id",
    labelCol: "team_id",
    seasonCol: "season",
    names: hoopsNames("mbb", "team_id"),
  },
];

export const sourceKey = (s: { schema: string; table: string }) => `${s.schema}.${s.table}`;
