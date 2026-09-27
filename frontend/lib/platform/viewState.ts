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
import type { TintMode } from "./scales.ts";

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
const TOKEN = /^[\w.-]+$/;

const clamp = (n: number, lo: number, hi: number, dflt: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : dflt;

/** `week__gte` → {column: week, op: __gte}; split at the FIRST "__" like the API. */
function splitKey(key: string): { column: string; op: Suffix } | null {
  const i = key.indexOf("__");
  const column = i < 0 ? key : key.slice(0, i);
  const op = (i < 0 ? "" : key.slice(i)) as Suffix;
  return COLUMN.test(column) && SUFFIXES.includes(op) ? { column, op } : null;
}

const MAX_LEN = 200; // uniform cap for every parsed token/value; sql keeps its own 10k cap

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

export type TrendsView = { sport: string; team: string; stat: string };
const TREND_KEYS = TREND_SPORTS.map((s) => s.key);

export function parseTrendsView(sp: URLSearchParams): TrendsView {
  return {
    sport: pick(sp.get("sport"), TREND_KEYS, TREND_KEYS[0]),
    team: (sp.get("team") ?? "").slice(0, 200),
    stat: (sp.get("stat") ?? "").slice(0, 200),
  };
}

export function trendsViewParams(v: TrendsView): URLSearchParams {
  const p = new URLSearchParams();
  if (v.sport !== TREND_KEYS[0]) p.set("sport", v.sport);
  if (v.team) p.set("team", v.team);
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

// --- ResultsGrid (sort / column filters / tint), keyed by column NAME --------

export type SortDir = "asc" | "desc";
export type GridView = { sort: { col: string; dir: SortDir } | null; filters: Record<string, string>; tint: TintMode };
/** ResultsGrid's internal shape: the same view keyed by column index. */
export type GridIndexState = { sort: { col: number; dir: SortDir } | null; filters: Record<number, string>; tint: TintMode };
export const EMPTY_GRID: GridView = { sort: null, filters: {}, tint: "delta" };

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
  };
}

/** Appends the grid keys to `p` (a page's own params). */
export function gridViewParams(v: GridView, p: URLSearchParams): void {
  if (v.sort) p.set("grid.sort", `${v.sort.dir === "desc" ? "-" : ""}${v.sort.col}`);
  if (v.tint !== "delta") p.set("grid.tint", v.tint);
  for (const [col, text] of Object.entries(v.filters)) if (text) p.set(`grid.f.${col}`, text);
}

export function gridByIndex(v: GridView, columns: string[]): GridIndexState {
  const idx = (name: string) => columns.indexOf(name);
  const filters: Record<number, string> = {};
  for (const [name, text] of Object.entries(v.filters)) if (idx(name) >= 0) filters[idx(name)] = text;
  const sortCol = v.sort ? idx(v.sort.col) : -1;
  return { sort: v.sort && sortCol >= 0 ? { col: sortCol, dir: v.sort.dir } : null, filters, tint: v.tint };
}

export function gridByName(s: GridIndexState, columns: string[]): GridView {
  const filters: Record<string, string> = {};
  for (const [i, text] of Object.entries(s.filters)) if (text && columns[Number(i)]) filters[columns[Number(i)]] = text;
  return { sort: s.sort && columns[s.sort.col] ? { col: columns[s.sort.col], dir: s.sort.dir } : null, filters, tint: s.tint };
}
