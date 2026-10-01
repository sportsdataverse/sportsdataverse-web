import type { CourtKey, ShotSource } from "../lib/platform/viz/surfaces.ts";

/**
 * Leagues for /platform/shots: where one player-season's shots come from
 * (one `/api/platform/query/run` read, filtered by `playerCol` and
 * `seasonCol`, `select`ing only what `normalizeShot(source, row)` reads),
 * which surface they draw on, and the roster table the player picker lists.
 *
 * Verified 2026-10-01 against the Data API (`/v1/<schema>/tables`, and
 * counts through `/v1/<schema>/<table>?season=2026&limit=50000`):
 *
 * | league     | shots            | player col        | roster (id, name)                                  | 2026 roster rows |
 * |------------|------------------|-------------------|----------------------------------------------------|------------------|
 * | nba_stats  | nba_stats.shots  | person_id         | nba_stats.rosters (player_id, player)              | 495              |
 * | wnba_stats | wnba_stats.shots | person_id         | wnba_stats.rosters (player_id, player)             | 223              |
 * | nba        | nba.shots        | athlete_id_1      | nba.rosters (athlete_id, full_name)                | 537              |
 * | wnba       | wnba.shots       | athlete_id_1      | wnba.rosters (athlete_id, full_name)               | 221              |
 * | mbb        | mbb.shots        | athlete_id_1      | mbb.rosters (athlete_id, full_name)                | 12,438 (12,324 ids: transfers) |
 * | wbb        | wbb.shots        | athlete_id_1      | wbb.rosters (athlete_id, full_name)                | 9,778 (9,777 ids) |
 * | nhl        | nhl.pbp          | event_player_1_id | nhl.rosters (player_id, full_name), one row per player-GAME | > 50,000 |
 * | pwhl       | pwhl.xg_pbp      | player_id         | pwhl.rosters (player_id, first_name + last_name)   | 1,801 (all seasons) |
 *
 * Every roster is read for the viewed season and deduplicated by id in the
 * page (a transfer or a trade lists a player twice). nhl.rosters is per
 * game (~52,000 rows a season), past the API's 50,000-row cap: it is read
 * newest game first, skaters only, so the cut falls on the season's first
 * games. ponytail: a skater who played only the first ~100 games of a season
 * is missing from the NHL picker; a season-level NHL roster table would fix it.
 * `position_code__ne=G` is SQL `<>`, so a NULL position would be dropped
 * too — but `position_code__isnull=true` (the API's null operator) finds no
 * such row in any season (2026-10-01), and the API cannot OR two filters, so
 * a NULL-tolerant read would be a second request for an always-empty set.
 *
 * Column dtypes: nba.rosters' `athlete_id` is text where nba.shots'
 * `athlete_id_1` is an integer; the page keeps every id as the URL's string
 * and the Data API matches a filter value against either, so no cast happens
 * on a join here (the picker's id → name map is keyed by `String(id)`).
 *
 * League baseline (`curves`): the schema whose `metric_curves` holds the F4
 * league curve `fg_pct_by_shot_distance` (`entity_type=league`, 37 buckets
 * of [x_lo, x_hi) feet with a made `rate`, one row set per season), which
 * colours each hexagon by its FG% minus the league's at the bin's mean
 * distance. Producers exist today (2026-10-01) for `nba_stats` (1997–2026,
 * season = END year) and `wnba_stats` (1997–2026, the calendar year) only:
 *
 * | league     | curves schema | why                                                                      |
 * |------------|---------------|--------------------------------------------------------------------------|
 * | nba_stats  | nba_stats     | its own                                                                  |
 * | wnba_stats | wnba_stats    | its own                                                                  |
 * | nba        | nba_stats     | the same league, the same END-year season key; the curve is a rate by    |
 * |            |               | distance, not an id join, so the ESPN feed's shots (distance from its own |
 * |            |               | coordinates) read against the NBA Stats league rate at that distance     |
 * | wnba       | wnba_stats    | as nba → nba_stats (calendar-year seasons on both sides)                 |
 * | mbb, wbb   | —             | no producer: the page falls back to the sequential FG% ramp with a note  |
 * | nhl, pwhl  | —             | goals − xG is already an expectation; no F4                              |
 */

export type ShotsSurface = { kind: "court"; court: CourtKey } | { kind: "rink" };

export type ShotsLeague = {
  /** The league picker's text. */
  label: string;
  schema: string;
  table: string;
  /** The shots table's player id column: the read's filter. */
  playerCol: string;
  seasonCol: string;
  /** The columns `normalizeShot` reads, so the read is narrow. */
  select: readonly string[];
  /** The normalizer key (lib/platform/viz/surfaces.ts). */
  source: ShotSource;
  surface: ShotsSurface;
  /** What a made shot is called in the readout and legend. */
  made: "FG" | "goals";
  /** The schema whose `metric_curves` holds this league's F4 league FG% by
   *  distance (table above); absent, the page colours FG% on its own. */
  curves?: "nba_stats" | "wnba_stats";
  roster: {
    schema: string;
    table: string;
    idCol: string;
    /** Joined with a space: one column, or first + last. */
    nameCols: readonly string[];
    /** Fixed filters and order sent with the read. */
    params?: Readonly<Record<string, string>>;
  };
};

const stats = (schema: "nba_stats" | "wnba_stats", label: string, court: CourtKey): ShotsLeague => ({
  label,
  schema,
  table: "shots",
  playerCol: "person_id",
  seasonCol: "season",
  select: ["x_legacy", "y_legacy", "shot_result"],
  source: schema,
  surface: { kind: "court", court },
  made: "FG",
  curves: schema,
  roster: { schema, table: "rosters", idCol: "player_id", nameCols: ["player"] },
});

const espn = (schema: "nba" | "wnba" | "mbb" | "wbb", label: string, curves?: "nba_stats" | "wnba_stats"): ShotsLeague => ({
  label,
  schema,
  table: "shots",
  playerCol: "athlete_id_1",
  seasonCol: "season",
  select: ["coordinate_x_raw", "coordinate_y_raw", "scoring_play", "type_text"],
  source: schema,
  surface: { kind: "court", court: schema },
  made: "FG",
  ...(curves ? { curves } : {}),
  roster: { schema, table: "rosters", idCol: "athlete_id", nameCols: ["full_name"] },
});

/** The first entry is the default: a link without `league` shows it. */
export const SHOTS_LEAGUES: Readonly<Record<string, ShotsLeague>> = {
  nba_stats: stats("nba_stats", "NBA (NBA Stats)", "nba"),
  wnba_stats: stats("wnba_stats", "WNBA (WNBA Stats)", "wnba"),
  nba: espn("nba", "NBA (ESPN)", "nba_stats"),
  wnba: espn("wnba", "WNBA (ESPN)", "wnba_stats"),
  mbb: espn("mbb", "Men's college basketball"),
  wbb: espn("wbb", "Women's college basketball"),
  nhl: {
    label: "NHL",
    schema: "nhl",
    table: "pbp",
    playerCol: "event_player_1_id",
    seasonCol: "season",
    select: ["event_type", "event_team_type", "x_fixed", "y_fixed", "xg"],
    source: "nhl",
    surface: { kind: "rink" },
    made: "goals",
    roster: { schema: "nhl", table: "rosters", idCol: "player_id", nameCols: ["full_name"], params: { position_code__ne: "G", order: "-game_date" } },
  },
  pwhl: {
    label: "PWHL",
    schema: "pwhl",
    table: "xg_pbp",
    playerCol: "player_id",
    seasonCol: "season",
    select: ["x_coord", "y_coord", "goal", "xg"],
    source: "pwhl",
    surface: { kind: "rink" },
    made: "goals",
    roster: { schema: "pwhl", table: "rosters", idCol: "player_id", nameCols: ["first_name", "last_name"], params: { player_type: "skater" } },
  },
};

export const SHOTS_LEAGUE_KEYS = Object.keys(SHOTS_LEAGUES);
