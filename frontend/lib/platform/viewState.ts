/**
 * URL state for the platform data pages: one parse/serialize pair per page.
 *
 * The URL is a mirror of what is on screen, so a link reproduces the view.
 * Parsers never trust the URL: unknown sports fall back to the default,
 * identifiers are pattern-checked, limits are clamped, unknown filter
 * operators are dropped (the Data API would 400 on them). Serializers omit
 * defaults so a fresh page has a bare URL.
 *
 * Filters everywhere speak the Data API's language — `col`, `col__gte`, … —
 * so a Query page URL and its curl are the same request.
 */
import { WP_SPORTS } from "../../content/wp.ts";
import { TREND_SPORTS } from "../../content/trends.ts";
import { LOOKUP_SPORTS } from "../../content/lookups.ts";
import { ROLLING } from "../../content/rolling.ts";
import { SCATTER_SOURCES } from "../../content/scatter.ts";
import { RATINGS, type RatingSource } from "../../content/ratings.ts";
import { SHOTS_LEAGUE_KEYS } from "../../content/shots.ts";
import { scatterAxes } from "./viz/scatterMath.ts";
import { ROLLING_CARDS, ROLLING_TABS, type RollingCard, type RollingTab } from "./rolling.ts";
import { MAX_TRENDS_TEAMS, formatValue, trimGaps, type TrendPicks } from "./trends.ts";
import { ALL_PAIRS_CAP } from "./chartTokens.ts";
import type { TintMode } from "./scales.ts";
import { bases, familyOrder } from "./gridRegistry.ts";

export function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) p.append(k, one);
  }
  return p;
}

export const SUFFIXES = ["", "__ne", "__gt", "__gte", "__lt", "__lte", "__like"] as const;
export type Suffix = (typeof SUFFIXES)[number];
export type ApiFilter = { column: string; op: Suffix; value: string };

/** Explore builds SQL; its operator strings map 1:1 onto the URL suffixes. */
export const SQL_OP_BY_SUFFIX: Record<Suffix, string> = {
  "": "=", __ne: "!=", __gt: ">", __gte: ">=", __lt: "<", __lte: "<=", __like: "contains",
};
export const SUFFIX_BY_SQL_OP: Record<string, Suffix> = Object.fromEntries(
  Object.entries(SQL_OP_BY_SUFFIX).map(([s, op]) => [op, s as Suffix])
);

const COLUMN = /^[A-Za-z_][\w.]*$/; // warehouse columns include dots (clock.displayValue)
const TABLE = /^[a-z_][a-z0-9_]*$/;
/** A value a URL list may carry as is: `grid.pin` splits on commas. */
export const TOKEN = /^[\w.-]+$/;

const clamp = (n: number, lo: number, hi: number, dflt: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : dflt;

/** `week__gte` → {column: week, op: __gte}; split at the FIRST "__" like the API. */
function splitKey(key: string): { column: string; op: Suffix } | null {
  const i = key.indexOf("__");
  const column = i < 0 ? key : key.slice(0, i);
  const op = (i < 0 ? "" : key.slice(i)) as Suffix;
  return COLUMN.test(column) && SUFFIXES.includes(op) ? { column, op } : null;
}

export const MAX_LEN = 200; // uniform cap for every parsed token/value; sql keeps its own 10k cap

function readFilters(sp: URLSearchParams, keep: (key: string) => string | null): ApiFilter[] {
  const out: ApiFilter[] = [];
  sp.forEach((value, key) => {
    const bare = keep(key);
    const parsed = bare === null ? null : splitKey(bare);
    if (parsed) out.push({ ...parsed, value: value.slice(0, MAX_LEN) });
  });
  return out;
}

function writeFilters(p: URLSearchParams, filters: ApiFilter[], prefix: string) {
  for (const f of filters) if (f.column && f.value !== "") p.append(`${prefix}${f.column}${f.op}`, f.value);
}

function pick<T extends string>(value: string | null, allowed: readonly T[], dflt: T): T {
  return allowed.includes(value as T) ? (value as T) : dflt;
}

// --- Explore -----------------------------------------------------------------

export type ExploreView = { tag: string; table: string; season: string; filters: ApiFilter[]; limit: number; sql: string };
const EXPLORE_LIMIT = 100;

export function parseExploreView(sp: URLSearchParams): ExploreView {
  const tok = (k: string) => {
    const v = (sp.get(k) ?? "").slice(0, MAX_LEN);
    return TOKEN.test(v) ? v : "";
  };
  return {
    tag: tok("tag"),
    table: tok("table"),
    season: tok("season"),
    filters: readFilters(sp, (k) => (k.startsWith("w.") ? k.slice(2) : null)),
    limit: clamp(Number(sp.get("limit") ?? EXPLORE_LIMIT), 1, 1_000_000, EXPLORE_LIMIT),
    sql: (sp.get("sql") ?? "").slice(0, 10_000),
  };
}

export function exploreViewParams(v: ExploreView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.tag) p.set("tag", v.tag);
  if (v.table) p.set("table", v.table);
  if (v.season) p.set("season", v.season);
  writeFilters(p, v.filters, "w.");
  if (v.limit !== EXPLORE_LIMIT) p.set("limit", String(v.limit));
  if (v.sql) p.set("sql", v.sql);
  return p;
}

// --- Query (the URL IS the Data API request) ---------------------------------

export type QueryView = { schema: string; table: string; filters: ApiFilter[]; select: string[]; order: string; limit: number };
const QUERY_RESERVED = new Set(["schema", "table", "select", "order", "limit"]);

export function parseQueryView(sp: URLSearchParams, schemas: string[]): QueryView {
  const table = (sp.get("table") ?? "").slice(0, MAX_LEN);
  const order = (sp.get("order") ?? "").slice(0, MAX_LEN);
  return {
    schema: pick((sp.get("schema") ?? "").slice(0, MAX_LEN), schemas, schemas[0] ?? ""),
    table: TABLE.test(table) ? table : "",
    filters: readFilters(sp, (k) => (QUERY_RESERVED.has(k) || k.startsWith("grid.") ? null : k)),
    select: (sp.get("select") ?? "")
      .split(",")
      .map((c) => c.slice(0, MAX_LEN))
      .filter((c) => COLUMN.test(c)),
    order: COLUMN.test(order.replace(/^-/, "")) ? order : "",
    limit: clamp(Number(sp.get("limit") ?? 100), 1, 10_000, 100),
  };
}

/** Used for BOTH the address bar and the /api/platform/query/run call. */
export function queryViewParams(v: QueryView): URLSearchParams {
  const p = new URLSearchParams({ schema: v.schema, table: v.table });
  writeFilters(p, v.filters, "");
  if (v.select.length) p.set("select", v.select.join(","));
  if (v.order) p.set("order", v.order);
  p.set("limit", String(v.limit));
  return p;
}

// --- Win probability / Trends / Lookups ---------------------------------------

export type WpView = { sport: string; season: string; game: string };
const WP_KEYS = WP_SPORTS.map((s) => s.key);

/** True when an Explore link named a table or season that the pickers did not
 *  land on (missing from the release), so its filters must not be applied.
 *  A link that named neither keeps them. */
export function exploreLinkMoved(
  link: { table: string; season: string },
  table: string,
  season: string
): boolean {
  return (link.table !== "" && table !== link.table) || (link.season !== "" && season !== link.season);
}

export function parseWpView(sp: URLSearchParams): WpView {
  const season = sp.get("season") ?? "";
  const game = (sp.get("game") ?? "").slice(0, MAX_LEN);
  return {
    sport: pick(sp.get("sport"), WP_KEYS, WP_KEYS[0]),
    season: /^\d{4}$/.test(season) ? season : "",
    game: /^\w+$/.test(game) ? game : "",
  };
}

export function wpViewParams(v: WpView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.sport !== WP_KEYS[0]) p.set("sport", v.sport);
  if (v.season) p.set("season", v.season);
  if (v.game) p.set("game", v.game);
  return p;
}

/** `teams` rides as repeated `team` keys in position order (`team=A&team=B`);
 *  an empty `team=` is a gap left by a removal, so every team keeps its colour
 *  slot through a link. A link from before the overlay (one `team=A`) still
 *  parses, to `['A']`. `season` picks a by-week source's season file; blank
 *  means the newest. `view=multiples` draws one panel per team of `group` (a
 *  groups-file id, `cfb:big-ten`; blank means the default group); no `view`,
 *  or any other, is the overlay. */
export type TrendsView = {
  sport: string;
  teams: TrendPicks;
  stat: string;
  season: string;
  view: "overlay" | "multiples";
  group: string;
};
const TREND_KEYS = TREND_SPORTS.map((s) => s.key);
const TREND_VIEWS = ["overlay", "multiples"] as const;
const GROUP_ID = /^[a-z0-9]+:[a-z0-9-]+$/;

/** Picks by position from repeated `key`s (position = colour slot): a blank
 *  key is a gap, a repeated value is dropped, at most `max` positions, no
 *  trailing gap. */
function readPicks(sp: URLSearchParams, key: string, max: number): TrendPicks {
  const picks: TrendPicks = [];
  for (const raw of sp.getAll(key)) {
    const t = raw.slice(0, MAX_LEN);
    if (t === "") picks.push(null);
    else if (!picks.includes(t)) picks.push(t);
  }
  return trimGaps(picks.slice(0, max));
}

export function parseTrendsView(sp: URLSearchParams): TrendsView {
  const group = (sp.get("group") ?? "").slice(0, MAX_LEN);
  return {
    sport: pick(sp.get("sport"), TREND_KEYS, TREND_KEYS[0]),
    teams: readPicks(sp, "team", MAX_TRENDS_TEAMS),
    stat: (sp.get("stat") ?? "").slice(0, MAX_LEN),
    season: /^\d{4}$/.test(sp.get("season") ?? "") ? sp.get("season")! : "",
    view: pick(sp.get("view"), TREND_VIEWS, "overlay"),
    group: GROUP_ID.test(group) ? group : "",
  };
}

export function trendsViewParams(v: TrendsView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.sport !== TREND_KEYS[0]) p.set("sport", v.sport);
  if (v.season) p.set("season", v.season);
  if (v.view === "multiples") {
    p.set("view", v.view);
    if (v.group) p.set("group", v.group);
  }
  for (const t of trimGaps(v.teams)) p.append("team", t ?? "");
  if (v.stat) p.set("stat", v.stat);
  return p;
}

export type LookupsView = { sport: string; mode: "players" | "teams"; q: string };
const LOOKUP_KEYS = LOOKUP_SPORTS.map((s) => s.key);

export function parseLookupsView(sp: URLSearchParams): LookupsView {
  return {
    sport: pick(sp.get("sport"), LOOKUP_KEYS, LOOKUP_KEYS[0]),
    mode: pick(sp.get("mode"), ["players", "teams"] as const, "players"),
    q: (sp.get("q") ?? "").slice(0, 200),
  };
}

export function lookupsViewParams(v: LookupsView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.sport !== LOOKUP_KEYS[0]) p.set("sport", v.sport);
  if (v.mode !== "players") p.set("mode", v.mode);
  if (v.q) p.set("q", v.q);
  return p;
}

// --- Scatter ------------------------------------------------------------------

/** One source (schema + table, from content/scatter.ts), one season, two
 *  numeric columns, up to ALL_PAIRS_CAP highlight chips by colour slot
 *  (`hl`, a blank key per gap, as Trends' `team`), and the marks: dots
 *  (the default, off the URL) or faces (`marks=face`: headshots, or logos
 *  for a team source). */
export type ScatterView = { schema: string; table: string; season: string; x: string; y: string; hl: TrendPicks; marks: "dot" | "face" };
const SCATTER_DEFAULT = SCATTER_SOURCES[0];

/** A source outside content/scatter.ts falls back to the first; `numeric`
 *  (the source's axes, once its catalog is known) drops an x or y that is not
 *  one of them, falling back to the first two. Without it, x/y are only
 *  pattern-checked. */
export function parseScatterView(sp: URLSearchParams, numeric?: readonly string[]): ScatterView {
  const [schema, table] = [sp.get("schema"), sp.get("table")];
  const src = SCATTER_SOURCES.find((s) => s.schema === schema && s.table === table) ?? SCATTER_DEFAULT;
  const col = (k: string) => {
    const v = (sp.get(k) ?? "").slice(0, MAX_LEN);
    return COLUMN.test(v) ? v : "";
  };
  const season = sp.get("season") ?? "";
  const axes = numeric ? scatterAxes(col("x"), col("y"), numeric) : { x: col("x"), y: col("y") };
  return {
    schema: src.schema,
    table: src.table,
    season: /^\d{4}$/.test(season) ? season : "",
    ...axes,
    hl: readPicks(sp, "hl", ALL_PAIRS_CAP),
    marks: sp.get("marks") === "face" ? "face" : "dot",
  };
}

export function scatterViewParams(v: ScatterView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.schema !== SCATTER_DEFAULT.schema || v.table !== SCATTER_DEFAULT.table) {
    p.set("schema", v.schema);
    p.set("table", v.table);
  }
  if (v.season) p.set("season", v.season);
  if (v.x) p.set("x", v.x);
  if (v.y) p.set("y", v.y);
  for (const c of trimGaps(v.hl)) p.append("hl", c ?? "");
  if (v.marks === "face") p.set("marks", "face");
  return p;
}

// --- Rolling form -------------------------------------------------------------

/** One metric × unit (`window_n` alone is ambiguous, see content/rolling.ts),
 *  and each card's own window: switching one card never moves another. */
export type RollingView = {
  league: string;
  metric: string;
  unit: string;
  win: Record<RollingCard, number>;
  tab: RollingTab;
  active: boolean;
};
const ROLLING_LEAGUES = Object.keys(ROLLING);
const TAB_KEYS = ROLLING_TABS.map((t) => t.key);

/** The configured entry for (metric, unit), else the league's first. Each card
 *  reads only `win.<card>` for a known card (else the legacy `window=`), and keeps
 *  it only if the entry's unit publishes that window, else the entry's first.
 *  `window=` is never written back. Active is on unless `active=0`. */
export function parseRollingView(sp: URLSearchParams): RollingView {
  const league = pick(sp.get("league"), ROLLING_LEAGUES, ROLLING_LEAGUES[0]);
  const [first] = ROLLING[league];
  const metric = sp.get("metric") ?? first.metric;
  const unit = sp.get("unit") ?? first.unit;
  const m = ROLLING[league].find((e) => e.metric === metric && e.unit === unit) ?? first;
  const cardWindow = (card: RollingCard) => {
    // Task 1 links (#72) carried one page-wide window=; it still sets any card without its own key.
    const n = Number((sp.get(`win.${card}`) ?? sp.get("window") ?? "").slice(0, MAX_LEN));
    return m.windows.includes(n) ? n : m.windows[0];
  };
  return {
    league,
    metric: m.metric,
    unit: m.unit,
    win: { hero: cardWindow("hero"), movers: cardWindow("movers") },
    tab: pick(sp.get("tab"), TAB_KEYS, "best"),
    active: sp.get("active") !== "0",
  };
}

export function rollingViewParams(v: RollingView): URLSearchParams {
  const p = new URLSearchParams();
  const entries = ROLLING[v.league] ?? [];
  const m = entries.find((e) => e.metric === v.metric && e.unit === v.unit);
  if (v.league !== ROLLING_LEAGUES[0]) p.set("league", v.league);
  if (m !== entries[0]) {
    p.set("metric", v.metric);
    p.set("unit", v.unit);
  }
  for (const card of ROLLING_CARDS) if (v.win[card] !== m?.windows[0]) p.set(`win.${card}`, String(v.win[card]));
  if (v.tab !== "best") p.set("tab", v.tab);
  if (!v.active) p.set("active", "0");
  return p;
}

/** A link to a rolling view (the overview's "hottest right now" row). */
export function rollingHref(v: RollingView): string {
  const qs = rollingViewParams(v).toString();
  return qs ? `/platform/rolling?${qs}` : "/platform/rolling";
}

// --- Ratings -------------------------------------------------------------------

/** One league (content/ratings.ts) and one season; blank means the newest the
 *  league has. An unknown league falls back to the first. */
export type RatingsView = { league: string; season: string };
const RATING_LEAGUES = Object.keys(RATINGS);

export function parseRatingsView(sp: URLSearchParams): RatingsView {
  const season = sp.get("season") ?? "";
  return { league: pick(sp.get("league"), RATING_LEAGUES, RATING_LEAGUES[0]), season: /^\d{4}$/.test(season) ? season : "" };
}

export function ratingsViewParams(v: RatingsView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.league !== RATING_LEAGUES[0]) p.set("league", v.league);
  if (v.season) p.set("season", v.season);
  return p;
}

/** "Chart this": a board's `chart` pair as a Scatter link on the same table
 *  and season, through Scatter's own codec; null (no button) when the table
 *  is not a Scatter source. */
export function ratingsChartHref(src: RatingSource, season: string): string | null {
  if (!src.chart || src.source !== "api" || !SCATTER_SOURCES.some((s) => s.schema === src.schema && s.table === src.table)) return null;
  const qs = scatterViewParams({ schema: src.schema, table: src.table, season, x: src.chart.x, y: src.chart.y, hl: [], marks: "dot" }).toString();
  return `/platform/scatter?${qs}`;
}

// --- Shots ---------------------------------------------------------------------

/** One league (content/shots.ts), one season (blank: the newest), one player
 *  id (blank: the roster's first), the view mode (only `raw` is drawn until
 *  the modes land; the key is reserved) and the smallest bin drawn, 1–15
 *  (15 reads "15+"). */
export type ShotsView = { league: string; season: string; player: string; mode: "raw" | "smoothed" | "zones"; minN: number };
/** The map's modes, in the control's order (ShotsClient). */
export const SHOTS_MODES = ["raw", "smoothed", "zones"] as const;
export const SHOTS_MIN_N = { min: 1, max: 15, dflt: 2 } as const;

export function parseShotsView(sp: URLSearchParams): ShotsView {
  const season = sp.get("season") ?? "";
  const player = (sp.get("player") ?? "").slice(0, MAX_LEN);
  return {
    league: pick(sp.get("league"), SHOTS_LEAGUE_KEYS, SHOTS_LEAGUE_KEYS[0]),
    season: /^\d{4}$/.test(season) ? season : "",
    player: TOKEN.test(player) ? player : "",
    mode: pick(sp.get("mode"), SHOTS_MODES, "raw"),
    minN: clamp(Number(sp.get("min") || SHOTS_MIN_N.dflt), SHOTS_MIN_N.min, SHOTS_MIN_N.max, SHOTS_MIN_N.dflt),
  };
}

export function shotsViewParams(v: ShotsView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.league !== SHOTS_LEAGUE_KEYS[0]) p.set("league", v.league);
  if (v.season) p.set("season", v.season);
  if (v.player) p.set("player", v.player);
  if (v.mode !== "raw") p.set("mode", v.mode);
  if (v.minN !== SHOTS_MIN_N.dflt) p.set("min", String(v.minN));
  return p;
}

// --- ResultsGrid (sort / column filters / tint / pins / qualified only), keyed by column NAME --

export type SortDir = "asc" | "desc";
/** Pinned rows by their identity column's value, in pin order (`grid.pin=player_id:1,2`).
 *  A result without one pins by row index, for the session only, and writes none. */
export type GridPin = { col: string; values: string[] };
/** `qualified`: a leaderboard's rows below its qualifier are hidden (`grid.q=1`); the intent is kept on a
 *  result without a gate, like `tint`'s. `preset`: a registry family whose columns alone show
 *  (`grid.preset=efficiency`); a result without that preset drops it, with a notice. `basis`: a
 *  registry basis every column with that variant shows in its place (`grid.basis=per_play`); null is
 *  the native view, and a result that can't serve the basis drops it, with a notice. */
export type GridView = {
  sort: { col: string; dir: SortDir } | null;
  filters: Record<string, string>;
  tint: TintMode;
  pin: GridPin | null;
  qualified: boolean;
  preset: string | null;
  basis: string | null;
};
/** ResultsGrid's internal shape: the same view keyed by column index (pins stay by name and value). */
export type GridIndexState = Omit<GridView, "sort" | "filters"> & { sort: { col: number; dir: SortDir } | null; filters: Record<number, string> };
export const EMPTY_GRID: GridView = { sort: null, filters: {}, tint: "delta", pin: null, qualified: false, preset: null, basis: null };

/** The most rows a grid pins at once (the tray's columns; `grid.pin`'s values). */
export const MAX_PINS = 8;

/** `col:v1,v2`: a COLUMN name, then up to MAX_PINS distinct id-like values; anything else is no pins. */
function readPin(raw: string): GridPin | null {
  const i = raw.indexOf(":");
  const col = raw.slice(0, i);
  if (i < 0 || !COLUMN.test(col) || col.length > MAX_LEN) return null;
  const values = [...new Set(raw.slice(i + 1).split(","))]
    .filter((v) => v.length <= MAX_LEN && TOKEN.test(v))
    .slice(0, MAX_PINS);
  return values.length ? { col, values } : null;
}

export function parseGridView(sp: URLSearchParams): GridView {
  const raw = sp.get("grid.sort") ?? "";
  const col = raw.replace(/^-/, "").slice(0, MAX_LEN);
  const filters: Record<string, string> = {};
  sp.forEach((value, key) => {
    const name = key.startsWith("grid.f.") ? key.slice(7, 7 + MAX_LEN) : "";
    if (COLUMN.test(name) && value) filters[name] = value.slice(0, MAX_LEN);
  });
  return {
    sort: COLUMN.test(col) ? { col, dir: raw.startsWith("-") ? "desc" : "asc" } : null,
    filters,
    tint: pick(sp.get("grid.tint"), ["delta", "pct", "off"] as const, "delta"),
    pin: readPin(sp.get("grid.pin") ?? ""),
    qualified: sp.get("grid.q") === "1",
    preset: readPreset(sp.get("grid.preset") ?? ""),
    basis: readBasis(sp.get("grid.basis") ?? ""),
  };
}

/** A registry family name, exactly (`efficiency`); anything else is no preset. */
function readPreset(raw: string): string | null {
  return /^[a-z]+$/.test(raw) && familyOrder().includes(raw) ? raw : null;
}

/** A registry basis, exactly (`per_play`); anything else is the native view. */
function readBasis(raw: string): string | null {
  return bases().includes(raw) ? raw : null;
}

/** Appends the grid keys to `p` (a page's own params). */
export function gridViewParams(v: GridView, p: URLSearchParams): void {
  if (v.sort) p.set("grid.sort", `${v.sort.dir === "desc" ? "-" : ""}${v.sort.col}`);
  if (v.tint !== "delta") p.set("grid.tint", v.tint);
  for (const [col, text] of Object.entries(v.filters)) if (text) p.set(`grid.f.${col}`, text);
  if (v.pin?.values.length) p.set("grid.pin", `${v.pin.col}:${v.pin.values.join(",")}`);
  if (v.qualified) p.set("grid.q", "1");
  if (v.preset) p.set("grid.preset", v.preset);
  if (v.basis) p.set("grid.basis", v.basis);
}

/** `String()` of a non-finite double, as DuckDB cells arrive. */
const NON_FINITE = /^[+-]?(Infinity|NaN)$/;

/** ResultsGrid's sort order for two cells. Nulls and blanks (`""` is missing,
 *  as in scales.ts) sort last and non-finite numbers just before them in BOTH
 *  directions (the Data API's NULLS LAST), so `dir` orders only the rest:
 *  numbers numerically and ahead of text, text by localeCompare. A tie is 0,
 *  so a stable sort keeps the original order. */
export function compareCells(a: string | null, b: string | null, dir: SortDir): number {
  const sink = (v: string | null) => (v === null || v.trim() === "" ? 2 : NON_FINITE.test(v.trim()) ? 1 : 0);
  const [sa, sb] = [sink(a), sink(b)];
  if (sa || sb) return sa - sb;
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const [na, nb] = [num(a!), num(b!)];
  const byValue = na !== null && nb !== null ? na - nb : na !== null ? -1 : nb !== null ? 1 : a!.localeCompare(b!);
  return dir === "asc" ? byValue : -byValue;
}

export type ViewRow = { cells: (string | null)[]; orig: number };

/** ResultsGrid's view over the rows it displays: the rows `keep` admits (by original index) that
 *  match every column filter (a case-insensitive substring of the RAW cell, so a grid.f link keeps
 *  its rows, and a shown value is the raw one's prefix unless its last digit rounded up), in `sort`'s
 *  order by compareCells over those same cells (stable: a tie keeps the input order). Every row keeps
 *  its ORIGINAL index for numbering, selection identity and external linking. */
export function viewRows(
  rows: (string | null)[][],
  sort: { col: number; dir: SortDir } | null,
  filters: Record<number, string>,
  keep?: (orig: number) => boolean
): ViewRow[] {
  let out: ViewRow[] = rows.map((cells, orig) => ({ cells, orig }));
  if (keep) out = out.filter(({ orig }) => keep(orig));
  const active = Object.entries(filters).filter(([, v]) => v !== "");
  if (active.length) out = out.filter(({ cells }) => active.every(([c, v]) => (cells[Number(c)] ?? "").toLowerCase().includes(v.toLowerCase())));
  if (sort) out = [...out].sort((a, b) => compareCells(a.cells[sort.col], b.cells[sort.col], sort.dir));
  return out;
}

/** A decimal number as DuckDB and the Data API write one; a fraction or an exponent makes it non-integer. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A cell as ResultsGrid, its tray and its rail show it. A finite number written
 *  with a fraction or an exponent reads at most 3 decimals, ungrouped (formatValue);
 *  one that would round to 0 there keeps 3 significant digits, so it never reads 0.
 *  Everything else is verbatim: integers (ids, years, a zero-padded game_id, an id
 *  past 2^53), text, NaN/Infinity, null. Display only: sort, filter and CSV use the raw cell. */
export function formatCell(v: string | null): string | null {
  if (v === null || !DECIMAL.test(v) || !/[.eE]/.test(v)) return v;
  const n = Number(v);
  // past 2^53 a double can't hold the integer digits, so the source string is the only exact copy
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return v;
  if (n !== 0 && Math.abs(n) < 0.0005) return String(Number(n.toPrecision(3)));
  return formatValue(n, undefined, false);
}

export function gridByIndex(v: GridView, columns: string[]): GridIndexState {
  const idx = (name: string) => columns.indexOf(name);
  const filters: Record<number, string> = {};
  for (const [name, text] of Object.entries(v.filters)) if (idx(name) >= 0) filters[idx(name)] = text;
  const sortCol = v.sort ? idx(v.sort.col) : -1;
  return { sort: v.sort && sortCol >= 0 ? { col: sortCol, dir: v.sort.dir } : null, filters, tint: v.tint, pin: v.pin, qualified: v.qualified, preset: v.preset, basis: v.basis };
}

export function gridByName(s: GridIndexState, columns: string[]): GridView {
  const filters: Record<string, string> = {};
  for (const [i, text] of Object.entries(s.filters)) if (text && columns[Number(i)]) filters[columns[Number(i)]] = text;
  return { sort: s.sort && columns[s.sort.col] ? { col: columns[s.sort.col], dir: s.sort.dir } : null, filters, tint: s.tint, pin: s.pin, qualified: s.qualified, preset: s.preset, basis: s.basis };
}
