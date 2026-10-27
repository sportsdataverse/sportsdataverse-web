/**
 * Ask: a football question → the Query page's URL state, by rules alone (spec D3, v1 has no LLM).
 *
 * "QBs with EPA/play over 0.2 in 2025, min 200 dropbacks" →
 * `schema=nfl&table=passing&position_group=QB&EPAplay__gt=0.2&season=2025&dropbacks__gte=200`.
 *
 * - Metrics come from the generated registry (metricRegistry.ts): its key, label, short and axis
 *   are the aliases, its format says a `%` value is stored 0–1, its polarity says what "best" and
 *   "better than" mean. A word the registry does not know is never mapped to a column.
 * - Every chip records the source characters it consumed. Words no rule consumed come back in
 *   `ignored` (filler like "with", "the" excepted), never silently dropped.
 * - With a catalog (`ctx.columns`), a filter on a column the table does not have is dropped and
 *   its words go back to `ignored`.
 * - The state is read back through the page's own codec (parseQueryView / parseGridView), so the
 *   Ask box can never write a URL the page would not accept from a shared link.
 */
import { METRICS, type MetricEntry } from "../metricRegistry.ts";
import {
  gridViewParams,
  parseGridView,
  parseQueryView,
  queryViewParams,
  type GridView,
  type QueryView,
} from "../viewState.ts";

export type ChipKind = "league" | "table" | "team" | "metric" | "season" | "sort" | "limit" | "qualified";

export type Chip = {
  /** Unique within a result: the URL key the chip writes first. */
  id: string;
  kind: ChipKind;
  /** Shown muted before the value: "EPA/Play >". */
  label: string;
  /** Shown as the value: "0.2", "50%", "passing · QB". */
  display: string;
  /** Every URL pair the chip writes; the first is the one an edit changes. */
  params: [string, string][];
  /** The source characters it consumed; null when it came from the page or was implied. */
  span: [number, number] | null;
  /** Why a chip with no span is there ("this page", "from Chiefs"). */
  implied?: string;
  /** A `%` metric: values are stored 0–1 and shown as percents. */
  pct?: boolean;
};

export type AskState = { query: QueryView; grid: GridView };
export type AskResult = { state: AskState; chips: Chip[]; ignored: string[] };
export type AskContext = {
  /** The Data API's schemas (the page's league list); a league outside it is ignored. */
  schemas?: readonly string[];
  /** The view on screen: a question that names no league or position refines it. */
  base?: { schema: string; table: string };
  /** A table's columns when known; filters on a missing column are dropped. */
  columns?: (schema: string, table: string) => readonly string[] | undefined;
};

// --- tokens ------------------------------------------------------------------------------------

type Num = { v: number; pct: boolean; plus: boolean; int: boolean };
type Tok = { raw: string; w: string; start: number; end: number; num?: Num; used: boolean };

// `49ers` and `3rd` are words; `-0.05`, `.2`, `50%` and `200+` are numbers; `2020-2024` is two years.
const TOKEN_RE = /\d+[a-z]+|(?<![\w.])-?(?:\d+(?:\.\d+)?|\.\d+)%?\+?|[a-z][a-z0-9']*|>=|<=|[<>/%+]/gi;
const NUM_RE = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(%?)(\+?)$/;

function tokenize(q: string): Tok[] {
  return [...q.matchAll(TOKEN_RE)].map((m) => {
    const raw = m[0];
    const n = NUM_RE.exec(raw);
    const w = raw === "/" ? "per" : raw.toLowerCase().replace(/'s?$/, "");
    return {
      raw,
      w,
      start: m.index,
      end: m.index + raw.length,
      used: false,
      ...(n ? { num: { v: Number(n[1]), pct: n[2] === "%", plus: n[3] === "+", int: /^\d+$/.test(n[1]) } } : {}),
    };
  });
}

/** Words that carry no filter: consumed silently, never reported as ignored. */
const FILLER = new Set(
  ("a an the and or with who whose that which what is are was were be had has have in on of for by to from " +
    "only all show me find list give get players player guys season seasons stats during between per % + / , than")
    .split(" ")
);
/** What may sit between a metric and its comparator ("EPA/play of at least 0.1"). */
const SKIP = new Set(["of", "is", "are", "was", "were", "a", "an"]);

/** Phrase match at `i` over unused tokens; returns the end index (exclusive) or -1. */
function matchAt(toks: Tok[], i: number, phrase: readonly string[]): number {
  if (i + phrase.length > toks.length) return -1;
  for (let k = 0; k < phrase.length; k++) if (toks[i + k].used || toks[i + k].w !== phrase[k]) return -1;
  return i + phrase.length;
}

/** The longest entry of `table` matching at `i`. */
function longest<T>(toks: Tok[], i: number, table: readonly (readonly [readonly string[], T])[]): { end: number; val: T } | null {
  let best: { end: number; val: T } | null = null;
  for (const [phrase, val] of table) {
    const end = matchAt(toks, i, phrase);
    if (end > 0 && (!best || end > best.end)) best = { end, val };
  }
  return best;
}

const words = (s: string) => s.split(" ");
const spanOf = (toks: Tok[], ids: number[]): [number, number] => [
  Math.min(...ids.map((i) => toks[i].start)),
  Math.max(...ids.map((i) => toks[i].end)),
];
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);

// --- vocabularies --------------------------------------------------------------------------------

const LEAGUES: [string[], string][] = [
  [["nfl"], "nfl"],
  [["cfb"], "cfb"],
  [["ncaaf"], "cfb"],
  [["fbs"], "cfb"],
  [["ncaa"], "cfb"],
  [["college"], "cfb"],
  [["college", "football"], "cfb"],
];

/** Position words → the player table (and `position_group`, where the word names one). */
type Pos = { table: string; group: string | null };
const POS = (table: string, group: string | null, ...phrases: string[]): [string[], Pos][] =>
  phrases.map((p) => [words(p), { table, group }]);
const POSITIONS: [string[], Pos][] = [
  ...POS("passing", "QB", "qb", "qbs", "quarterback", "quarterbacks"),
  ...POS("passing", null, "passer", "passers", "passing"),
  ...POS("rushing", "RB", "rb", "rbs", "running back", "running backs", "halfback", "halfbacks"),
  ...POS("rushing", null, "rusher", "rushers", "rushing", "ball carriers"),
  ...POS("receiving", "WR", "wr", "wrs", "wide receiver", "wide receivers", "wideout", "wideouts"),
  ...POS("receiving", "TE", "te", "tes", "tight end", "tight ends"),
  ...POS("receiving", null, "receiver", "receivers", "receiving", "pass catchers"),
];

/** NFL `pos_team` abbreviations as nfl.passing/rushing/receiving carry them (2025 release). */
const NFL_TEAMS: [string, string][] = [
  ["ARI", "Arizona Cardinals"], ["ATL", "Atlanta Falcons"], ["BAL", "Baltimore Ravens"], ["BUF", "Buffalo Bills"],
  ["CAR", "Carolina Panthers"], ["CHI", "Chicago Bears"], ["CIN", "Cincinnati Bengals"], ["CLE", "Cleveland Browns"],
  ["DAL", "Dallas Cowboys"], ["DEN", "Denver Broncos"], ["DET", "Detroit Lions"], ["GB", "Green Bay Packers"],
  ["HOU", "Houston Texans"], ["IND", "Indianapolis Colts"], ["JAX", "Jacksonville Jaguars"], ["KC", "Kansas City Chiefs"],
  ["LA", "Los Angeles Rams"], ["LAC", "Los Angeles Chargers"], ["LV", "Las Vegas Raiders"], ["MIA", "Miami Dolphins"],
  ["MIN", "Minnesota Vikings"], ["NE", "New England Patriots"], ["NO", "New Orleans Saints"], ["NYG", "New York Giants"],
  ["NYJ", "New York Jets"], ["PHI", "Philadelphia Eagles"], ["PIT", "Pittsburgh Steelers"], ["SEA", "Seattle Seahawks"],
  ["SF", "San Francisco 49ers"], ["TB", "Tampa Bay Buccaneers"], ["TEN", "Tennessee Titans"], ["WAS", "Washington Commanders"],
];
const NICKNAMES: Record<string, string> = { niners: "SF", bucs: "TB", pats: "NE", jags: "JAX" };
/** A nickname or full name names an NFL team outright; a city only once the league is NFL (Miami, Houston and
 *  Cincinnati are college teams too); Los Angeles and New York are two teams each, so never alone. */
const TEAM_NAMES: [string[], string][] = [
  ...NFL_TEAMS.flatMap(([abbr, name]): [string[], string][] => [
    [words(name.toLowerCase()), abbr],
    [[name.split(" ").at(-1)!.toLowerCase()], abbr],
  ]),
  ...Object.entries(NICKNAMES).map(([n, abbr]): [string[], string] => [[n], abbr]),
];
const TEAM_CITIES: [string[], string][] = NFL_TEAMS.map(([abbr, name]) => [words(name.toLowerCase()).slice(0, -1), abbr]);
const SHARED_CITY = (city: string[]) => TEAM_CITIES.filter(([c]) => c.join(" ") === city.join(" ")).length > 1;

const QUALIFIED: [string[], true][] = [[["qualified"], true], [["qualifiers"], true], [["qualifying"], true]];

/** Registry aliases: key, label, short and axis, lowercased, `/` read as "per", `%` and "(…)" dropped. Earlier
 *  sources win a clash (a key beats another metric's axis); a clash between equals maps to neither. */
function aliasWords(s: string): string[] {
  return s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\//g, " per ").split(/[^a-z0-9]+/).filter(Boolean);
}
function buildAliases(metrics: Record<string, MetricEntry>): [string[], string][] {
  const best = new Map<string, { key: string | null; prio: number }>();
  for (const m of Object.values(metrics)) {
    [m.key.replace(/_/g, " "), m.label, m.short, m.axis].forEach((text, prio) => {
      const w = aliasWords(text).join(" ");
      if (!w) return;
      const had = best.get(w);
      if (!had || prio < had.prio) best.set(w, { key: m.key, prio });
      else if (prio === had.prio && had.key !== m.key) had.key = null;
    });
  }
  return [...best].flatMap(([w, { key }]) => (key ? [[words(w), key] as [string[], string]] : []));
}
const ALIASES = buildAliases(METRICS);
/** Sample words the registry spells otherwise: a carry is a rushing table's `plays`
 *  (gridQualifier's QUALIFIER_VOLUME), a reception is `comp`. */
const SAMPLE_ALIASES: [string[], { key: string; table?: string }][] = [
  [["carries"], { key: "plays", table: "rushing" }],
  [["rushes"], { key: "plays", table: "rushing" }],
  [["receptions"], { key: "comp" }],
];

// --- comparators -----------------------------------------------------------------------------------

type Op = "" | "__gt" | "__gte" | "__lt" | "__lte";
type Cmp = Op | "better" | "worse";
/** `prefix`: the number usually leads its metric ("min 200 dropbacks"), else it follows one ("EPA over 0.2"). */
const CMPS: [string[], { op: Cmp; prefix: boolean }][] = (
  [
    ["at least", "__gte", true], ["no less than", "__gte", true], ["no fewer than", "__gte", true],
    ["minimum of", "__gte", true], ["minimum", "__gte", true], ["min", "__gte", true], [">=", "__gte", false],
    ["greater than", "__gt", false], ["more than", "__gt", false], ["over", "__gt", false], ["above", "__gt", false], [">", "__gt", false],
    ["at most", "__lte", true], ["no more than", "__lte", true], ["maximum of", "__lte", true], ["maximum", "__lte", true],
    ["max", "__lte", true], ["<=", "__lte", false],
    ["less than", "__lt", false], ["fewer than", "__lt", false], ["under", "__lt", false], ["below", "__lt", false], ["<", "__lt", false],
    ["better than", "better", false], ["worse than", "worse", false],
  ] as const
).map(([p, op, prefix]) => [words(p), { op, prefix }]);
const POSTFIX: [string[], Op][] = [
  [["or", "more"], "__gte"], [["or", "higher"], "__gte"], [["or", "better"], "__gte"],
  [["or", "less"], "__lte"], [["or", "fewer"], "__lte"], [["or", "lower"], "__lte"],
];
const OP_SYMBOL: Record<Op, string> = { "": "=", __gt: ">", __gte: "≥", __lt: "<", __lte: "≤" };

type SortWord = "best" | "worst" | "desc" | "asc";
const SORTS: [string[], { dir: SortWord; by: boolean; limit: boolean }][] = (
  [
    ["top", "best", false, true], ["best", "best", false, false], ["leaders", "best", false, false], ["leading", "best", false, false],
    ["bottom", "worst", false, true], ["worst", "worst", false, false],
    ["highest", "desc", false, false], ["most", "desc", false, false], ["lowest", "asc", false, false], ["fewest", "asc", false, false],
    ["sorted by", "best", true, false], ["ranked by", "best", true, false], ["ordered by", "best", true, false],
    ["sort by", "best", true, false], ["rank by", "best", true, false], ["order by", "best", true, false],
  ] as const
).map(([p, dir, by, limit]) => [words(p), { dir, by, limit }]);

// --- the parser ------------------------------------------------------------------------------------

/** A chip while parsing: the tokens it holds and what the catalog check needs. */
type Draft = { chip: Chip; toks: number[]; column?: string; onlyTable?: string };
type Mention = { key: string; from: number; to: number; onlyTable?: string; bound: boolean };

const metricOf = (key: string) => METRICS[key];
const isPct = (m: MetricEntry) => m.format === "pct1";
const fmt = (v: number) => String(Number(v.toFixed(6)));
const showValue = (v: number, pct: boolean) => (pct ? `${fmt(v * 100)}%` : fmt(v));

/** A number as a metric stores it: a `%` metric is 0–1, so "50%" and a bare 50 are 0.5 (a bare 0.5 stays).
 *  A `%` on any other metric, or a share above 100%, is not a value. */
function metricValue(m: MetricEntry, n: Num): number | null {
  if (!isPct(m)) return n.pct ? null : n.v;
  const v = n.pct || Math.abs(n.v) > 1 ? n.v / 100 : n.v;
  return Math.abs(v) > 1 ? null : v;
}

function metricChip(key: string, op: Op, v: number): Chip {
  const m = metricOf(key);
  return {
    id: `${key}${op}`,
    kind: "metric",
    label: `${m.label} ${OP_SYMBOL[op]}`,
    display: showValue(v, isPct(m)),
    params: [[`${key}${op}`, fmt(v)]],
    span: null,
    ...(isPct(m) ? { pct: true } : {}),
  };
}

const LEAGUE_NAME = (s: string) => s.toUpperCase();

export function parseAsk(question: string, ctx: AskContext = {}): AskResult {
  const toks = tokenize(question.slice(0, 500));
  // an empty list means the Data API did not answer: no league is known to be missing
  const known = (s: string) => !ctx.schemas?.length || ctx.schemas.includes(s);
  const drafts: Draft[] = [];
  const take = (ids: number[]) => ids.forEach((i) => (toks[i].used = true));
  const add = (chip: Chip, ids: number[], extra: Partial<Draft> = {}): boolean => {
    if (drafts.some((d) => d.chip.id === chip.id)) return false; // a second "2024" or a repeated filter stays ignored
    take(ids);
    drafts.push({ chip: { ...chip, span: ids.length ? spanOf(toks, ids) : chip.span }, toks: ids, ...extra });
    return true;
  };
  const scan = <T>(table: readonly (readonly [readonly string[], T])[], f: (val: T, ids: number[]) => void) => {
    for (let i = 0; i < toks.length; i++) {
      const hit = longest(toks, i, table);
      if (hit) f(hit.val, range(i, hit.end));
    }
  };

  // 1. league, position, qualified
  let league: string | null = null;
  scan(LEAGUES, (val, ids) => {
    if (league !== null || !known(val)) return;
    league = val;
    add({ id: "schema", kind: "league", label: "League", display: LEAGUE_NAME(val), params: [["schema", val]], span: null }, ids);
  });
  scan(POSITIONS, ({ table, group }, ids) => {
    const params: [string, string][] = [["table", table]];
    if (group) params.push(["position_group", group]);
    add({ id: "table", kind: "table", label: "Table", display: group ? `${table} · ${group}` : table, params, span: null }, ids);
  });
  scan(QUALIFIED, (_, ids) => {
    add({ id: "grid.q", kind: "qualified", label: "", display: "Qualified only", params: [["grid.q", "1"]], span: null }, ids);
  });

  // 2. NFL team: a nickname, full name or upper-case abbreviation implies the NFL; a city needs it said
  if (league !== "cfb") {
    const team = (abbr: string, ids: number[]) =>
      add({ id: "pos_team", kind: "team", label: "Team", display: abbr, params: [["pos_team", abbr]], span: null }, ids, { column: "pos_team" });
    scan(TEAM_NAMES, (abbr, ids) => void team(abbr, ids));
    if (league === "nfl") scan(TEAM_CITIES, (abbr, ids) => {
      if (!SHARED_CITY(ids.map((i) => toks[i].w))) team(abbr, ids);
    });
    toks.forEach((t, i) => {
      if (t.used || !/^[A-Z]{2,3}$/.test(t.raw) || !NFL_TEAMS.some(([a]) => a === t.raw)) return;
      // MIN and NO also open comparators: "MIN 200 dropbacks", "NO more than 10 games" are thresholds, "MIN QBs" is Minnesota
      const cmp = longest(toks, i, CMPS);
      if (cmp && toks[cmp.end]?.num) return;
      team(t.raw, [i]);
    });
  }

  // 3. metric mentions, longest alias first
  const mentions: Mention[] = [];
  for (let i = 0; i < toks.length; i++) {
    const reg = longest(toks, i, ALIASES);
    const sample = longest(toks, i, SAMPLE_ALIASES);
    const hit = sample && (!reg || sample.end > reg.end) ? { end: sample.end, ...sample.val } : reg ? { end: reg.end, key: reg.val } : null;
    if (!hit) continue;
    const to = toks[hit.end]?.raw === "%" ? hit.end + 1 : hit.end; // "catch % at least 70": the % is the name's
    mentions.push({ key: hit.key, from: i, to, onlyTable: "table" in hit ? hit.table : undefined, bound: false });
    i = to - 1;
  }
  const mentionAt = (i: number) => mentions.find((m) => m.from === i);

  // 4. thresholds: comparator + number, or number + "+" / "or more", bound to the metric beside it
  const nextIdx = (i: number) => {
    while (i < toks.length && SKIP.has(toks[i].w) && !toks[i].used) i++;
    return i;
  };
  const prevMention = (i: number) => {
    let j = i - 1;
    while (j >= 0 && SKIP.has(toks[j].w) && !toks[j].used) j--;
    return mentions.find((m) => m.to === j + 1 && !m.bound);
  };
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].used) continue;
    const cmp = longest(toks, i, CMPS);
    const at = cmp ? cmp.end : i;
    const n = toks[at];
    if (!n?.num || n.used || (!cmp && !n.num.plus && !longest(toks, at + 1, POSTFIX))) continue;
    const ids = range(i, at + 1);
    let num = { ...n.num };
    let end = at + 1;
    if (toks[end]?.raw === "%" && !toks[end].used) {
      num = { ...num, pct: true };
      ids.push(end++);
    }
    if (toks[end]?.raw === "+" && !toks[end].used) {
      num = { ...num, plus: true };
      ids.push(end++);
    }
    let op: Cmp | null = cmp ? cmp.val.op : num.plus ? "__gte" : null;
    let prefix = cmp ? cmp.val.prefix : true;
    const post = !cmp ? longest(toks, end, POSTFIX) : null;
    if (post) {
      op = post.val;
      ids.push(...range(end, post.end));
      end = post.end;
      prefix = true;
    }
    if (op === null) continue;
    const before = prevMention(i);
    const afterM = mentionAt(nextIdx(end));
    const after = afterM && !afterM.bound ? afterM : undefined;
    const target = prefix ? (after ?? before) : (before ?? after);
    // "14 dropbacks per game" is a rate the registry does not spell: binding it to the total would be wrong
    if (!target || (toks[target.to]?.w === "per" && toks[target.to + 1] && !toks[target.to + 1].used)) continue;
    const m = metricOf(target.key);
    const v = metricValue(m, num);
    if (v === null) continue;
    const realOp: Op = op === "better" ? (m.polarity === "higher" ? "__gt" : "__lt") : op === "worse" ? (m.polarity === "higher" ? "__lt" : "__gt") : op;
    if (add(metricChip(target.key, realOp, v), [...ids, ...range(target.from, target.to)], { column: target.key, onlyTable: target.onlyTable })) {
      target.bound = true;
      i = end - 1;
    }
  }

  // 5. sort (and "top N"): "best/top … by <metric>", "most <metric>"
  for (let i = 0; i < toks.length && !drafts.some((d) => d.chip.kind === "sort"); i++) {
    const s = longest(toks, i, SORTS);
    if (!s) continue;
    const ids = range(i, s.end);
    let j = s.end;
    let limit: number | null = null;
    const limitIdx = j;
    const n = toks[j]?.num;
    if (s.val.limit && n && n.int && !n.pct && !n.plus && n.v >= 1 && n.v <= 1000 && !toks[j].used) {
      limit = n.v;
      j++;
    }
    let target: Mention | undefined = mentionAt(j);
    if (!target && !s.val.by) {
      for (let k = j; k < toks.length - 1 && !target; k++) {
        if (!toks[k].used && (toks[k].w === "by" || toks[k].w === "in")) {
          target = mentionAt(k + 1);
          if (target) ids.push(k);
        }
      }
    }
    if (!target) continue;
    const m = metricOf(target.key);
    const desc = s.val.dir === "desc" || (s.val.dir === "best" && m.polarity === "higher") || (s.val.dir === "worst" && m.polarity === "lower");
    const how = s.val.dir === "best" ? "best first" : s.val.dir === "worst" ? "worst first" : desc ? "highest first" : "lowest first";
    // a metric already filtered on keeps its tokens with the filter; the sort only claims the sort words
    const own = target.bound ? ids : [...ids, ...range(target.from, target.to)];
    const sorted = add(
      { id: "order", kind: "sort", label: "Sort", display: `${m.label}, ${how}`, params: [["order", `${desc ? "-" : ""}${target.key}`]], span: null },
      own,
      { column: target.key, onlyTable: target.onlyTable }
    );
    if (!sorted) continue;
    target.bound = true;
    if (limit !== null) add({ id: "limit", kind: "limit", label: "Top", display: String(limit), params: [["limit", String(limit)]], span: null }, [limitIdx], { column: target.key, onlyTable: target.onlyTable });
  }

  // 6. seasons: "2025", "since 2020", "2020-2024", "from 2019 to 2021"; a year right before a metric is not one
  const isYear = (t?: Tok) => !!t && !t.used && !!t.num && /^(19|20)\d\d$/.test(t.raw);
  const season = (op: Op, ids: number[], year: string) =>
    add({ id: `season${op}`, kind: "season", label: op ? `Season ${OP_SYMBOL[op]}` : "Season", display: year, params: [[`season${op}`, year]], span: null }, ids);
  for (let i = 0; i < toks.length; i++) {
    if (!isYear(toks[i]) || mentionAt(nextIdx(i + 1))) continue;
    const gap = question.slice(toks[i].end, toks[i + 1]?.start ?? toks[i].end);
    const joiner = toks[i + 1] && ["to", "through", "thru", "and"].includes(toks[i + 1].w) ? i + 1 : -1;
    const second = joiner > 0 ? i + 2 : /^\s*[-–]\s*$/.test(gap) ? i + 1 : -1;
    if (second > 0 && isYear(toks[second])) {
      season("__gte", range(i, second), toks[i].raw);
      season("__lte", [second], toks[second].raw);
      i = second;
      continue;
    }
    const prev = toks[i - 1] && !toks[i - 1].used ? toks[i - 1].w : "";
    const op: Op | null = { since: "__gte", after: "__gt", before: "__lt", until: "__lte", through: "__lte", thru: "__lte" }[prev] as Op ?? "";
    season(op, op ? [i - 1, i] : [i], toks[i].raw);
  }

  // 7. schema and table: said, implied by a team, or the page's; then the catalog check
  const has = (kind: ChipKind) => drafts.some((d) => d.chip.kind === kind);
  if (drafts.length) {
    const team = drafts.find((d) => d.chip.kind === "team");
    if (!has("league")) {
      const schema = team ? "nfl" : ctx.base?.schema;
      if (schema && known(schema)) {
        const implied = team ? `from ${question.slice(...team.chip.span!)}` : "this page";
        drafts.unshift({ chip: { id: "schema", kind: "league", label: "League", display: LEAGUE_NAME(schema), params: [["schema", schema]], span: null, implied }, toks: [] });
      }
    }
    if (!has("table") && ctx.base?.table) {
      const t = ctx.base.table;
      drafts.splice(1, 0, { chip: { id: "table", kind: "table", label: "Table", display: t, params: [["table", t]], span: null, implied: "this page" }, toks: [] });
    }
  }
  const schema = drafts.find((d) => d.chip.kind === "league")?.chip.params[0][1] ?? "";
  const tableDraft = drafts.find((d) => d.chip.kind === "table");
  const table = tableDraft?.chip.params[0][1] ?? "";
  const cols = schema && table ? ctx.columns?.(schema, table) : undefined;
  if (cols && tableDraft && !cols.includes("position_group")) {
    tableDraft.chip = { ...tableDraft.chip, display: table, params: tableDraft.chip.params.slice(0, 1) };
  }
  // a sort or limit carries its metric's column, so it goes when that column is missing
  const kept = drafts.filter((d) => {
    const ok = (!d.onlyTable || d.onlyTable === table) && (!cols || !d.column || cols.includes(d.column));
    if (!ok) d.toks.forEach((i) => (toks[i].used = false));
    return ok;
  });
  const chips = kept.map((d) => d.chip);

  // 8. what is left: runs of unused, meaningful words (a filler word ends a run; a stray `/` or `%` does not)
  const ignored: string[] = [];
  let run: Tok[] = [];
  const flush = () => {
    while (run.length && FILLER.has(run[run.length - 1].w)) run.pop();
    if (run.length) ignored.push(question.slice(run[0].start, run[run.length - 1].end));
    run = [];
  };
  for (const t of toks) {
    const symbol = !/[a-z0-9]/i.test(t.raw);
    if (!t.used && !FILLER.has(t.w)) run.push(t);
    else if (!t.used && symbol && run.length) run.push(t);
    else flush();
  }
  flush();

  return { state: stateOf(chips, ctx.schemas), chips, ignored };
}

/** The page's URL state for a set of chips, read back through the page's own codec. */
export function stateOf(chips: Chip[], schemas?: readonly string[]): AskState {
  const sp = new URLSearchParams();
  for (const c of chips) for (const [k, v] of c.params) sp.append(k, v);
  const schema = sp.get("schema") ?? "";
  return { query: parseQueryView(sp, schemas?.length ? [...schemas] : [schema]), grid: parseGridView(sp) };
}

/** The Query page link for a state: the query's keys, then the grid's. */
export function askHref(state: AskState): string {
  const p = queryViewParams(state.query);
  gridViewParams(state.grid, p);
  return `/platform/query?${p}`;
}

/** A chip with its value edited: a number for a metric ("55%" on a % metric), a year, a row limit; null if invalid. */
export function editChip(chip: Chip, text: string): Chip | null {
  const t = text.trim();
  const [[key]] = chip.params;
  if (chip.kind === "metric") {
    const n = NUM_RE.exec(t);
    if (!n || n[3]) return null;
    const m = metricOf(key.split("__")[0]);
    const v = m ? metricValue(m, { v: Number(n[1]), pct: n[2] === "%", plus: false, int: false }) : null;
    return v === null ? null : { ...chip, display: showValue(v, isPct(m)), params: [[key, fmt(v)]] };
  }
  if (chip.kind === "season") return /^(19|20)\d\d$/.test(t) ? { ...chip, display: t, params: [[key, t]] } : null;
  if (chip.kind === "limit") {
    const v = Number(t);
    return Number.isInteger(v) && v >= 1 && v <= 10_000 ? { ...chip, display: t, params: [[key, t]] } : null;
  }
  return null;
}

export const EDITABLE: readonly ChipKind[] = ["metric", "season", "limit"];
