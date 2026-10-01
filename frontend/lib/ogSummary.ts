/**
 * Share cards for the platform views (P11): what a shared link unfurls to.
 *
 * A view's card and its og:url carry only the params that identify the view:
 * a per-view whitelist over the P2 codec's canonical output, so free text
 * (`sql`, `q`), filter values (Explore's `w.*`, Query's columns, `grid.*`)
 * and picked rows (`hl`, `grid.pin`) never leave the page. The summary is
 * labels from content/ plus identifier tokens: never a row value, a WP
 * number or a rating. `/api/og` renders `ogCard` and nothing else, so it
 * can't be made to print a caller's sentence.
 */
import type { Metadata } from "next";
import { WP_SPORTS } from "../content/wp.ts";
import { TREND_SPORTS } from "../content/trends.ts";
import { LOOKUP_SPORTS } from "../content/lookups.ts";
import { ROLLING } from "../content/rolling.ts";
import { SCATTER_SOURCES } from "../content/scatter.ts";
import { RATINGS } from "../content/ratings.ts";
import { SHOTS_LEAGUES } from "../content/shots.ts";
import { baseMetadata } from "./metadata.ts";
import {
  parseWpView, wpViewParams, parseTrendsView, trendsViewParams, parseExploreView, exploreViewParams,
  parseQueryView, parseLookupsView, lookupsViewParams, parseScatterView, scatterViewParams,
  parseRollingView, rollingViewParams, parseRatingsView, ratingsViewParams, parseShotsView, shotsViewParams,
} from "./platform/viewState.ts";

export const SUMMARY_MAX = 80;
const MAX_PARAMS = 40;
const MAX_PARAM_LEN = 64;

/** An identifier fit for the card: no spaces or dots, so no sentence and no domain. */
const tok = (v: string) => (/^[\w-]{1,32}$/.test(v) ? v : "");
const year = (v: string) => (/^\d{4}$/.test(v) ? v : "");
const labelOf = (list: readonly { key: string; label: string }[], key: string) => list.find((s) => s.key === key)?.label ?? "";

type Spec = {
  title: string;
  /** The keys of the view's canonical params that may leave the page. */
  keys: readonly string[];
  canonical: (sp: URLSearchParams) => URLSearchParams;
  summary: (sp: URLSearchParams) => string[];
};

const SCHEMA = /^[a-z_][a-z0-9_]*$/;
/** The Query page validates `schema` against the Data API's list; metadata can't call the API, so pattern-check it. */
const queryView = (sp: URLSearchParams) => {
  const schema = sp.get("schema") ?? "";
  return parseQueryView(sp, SCHEMA.test(schema) ? [schema] : []);
};

const VIEWS: Record<string, Spec> = {
  wp: {
    title: "Win probability",
    keys: ["sport", "season", "game"],
    canonical: (sp) => wpViewParams(parseWpView(sp)),
    summary: (sp) => {
      const v = parseWpView(sp);
      return [labelOf(WP_SPORTS, v.sport), v.season, tok(v.game) && `game ${v.game}`];
    },
  },
  trends: {
    title: "Trends",
    keys: ["sport", "season", "view", "group", "team", "stat"],
    canonical: (sp) => trendsViewParams(parseTrendsView(sp)),
    summary: (sp) => {
      const v = parseTrendsView(sp);
      const n = v.teams.filter(Boolean).length;
      return [labelOf(TREND_SPORTS, v.sport), tok(v.stat), v.season, n ? `${n} team${n > 1 ? "s" : ""}` : "", v.view === "multiples" ? "small multiples" : ""];
    },
  },
  explore: {
    title: "Explore",
    keys: ["tag", "table", "season", "limit"],
    canonical: (sp) => exploreViewParams(parseExploreView(sp)),
    summary: (sp) => {
      const v = parseExploreView(sp);
      return [tok(v.tag), tok(v.table), year(v.season)];
    },
  },
  query: {
    title: "Query",
    keys: ["schema", "table"],
    canonical: (sp) => {
      const v = queryView(sp);
      return new URLSearchParams([["schema", v.schema], ["table", v.table]].filter(([, x]) => x));
    },
    summary: (sp) => {
      const v = queryView(sp);
      return [[tok(v.schema), tok(v.table)].filter(Boolean).join(".")];
    },
  },
  lookups: {
    title: "Lookups",
    keys: ["sport", "mode"],
    canonical: (sp) => lookupsViewParams(parseLookupsView(sp)),
    summary: (sp) => {
      const v = parseLookupsView(sp);
      return [labelOf(LOOKUP_SPORTS, v.sport), v.mode];
    },
  },
  scatter: {
    title: "Scatter",
    keys: ["schema", "table", "season", "x", "y"],
    canonical: (sp) => scatterViewParams(parseScatterView(sp)),
    summary: (sp) => {
      const v = parseScatterView(sp);
      const src = SCATTER_SOURCES.find((s) => s.schema === v.schema && s.table === v.table);
      return [src?.label ?? "", v.season, tok(v.x) && tok(v.y) ? `${v.x} vs ${v.y}` : ""];
    },
  },
  rolling: {
    title: "Rolling form",
    keys: ["league", "metric", "unit", "win.hero", "win.movers", "tab", "active"],
    canonical: (sp) => rollingViewParams(parseRollingView(sp)),
    summary: (sp) => {
      const v = parseRollingView(sp);
      const m = ROLLING[v.league].find((e) => e.metric === v.metric && e.unit === v.unit);
      return [v.league.toUpperCase(), m?.label ?? ""];
    },
  },
  ratings: {
    title: "Ratings",
    keys: ["league", "season"],
    canonical: (sp) => ratingsViewParams(parseRatingsView(sp)),
    summary: (sp) => {
      const v = parseRatingsView(sp);
      return [RATINGS[v.league].label, v.season];
    },
  },
  shots: {
    title: "Shots",
    keys: ["league", "season", "player"],
    canonical: (sp) => shotsViewParams(parseShotsView(sp)),
    summary: (sp) => {
      const v = parseShotsView(sp);
      return [SHOTS_LEAGUES[v.league].label, v.season, tok(v.player) && `player ${v.player}`];
    },
  },
};

const specOf = (view: string): Spec | null => (Object.hasOwn(VIEWS, view) ? VIEWS[view] : null);

/** The first MAX_PARAMS params, each dropped (not cut) past MAX_PARAM_LEN: every reader sees a bounded URL. */
function capped(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  let n = 0;
  for (const [k, v] of sp) {
    if (n++ >= MAX_PARAMS) break;
    if (k.length <= MAX_PARAM_LEN && v.length <= MAX_PARAM_LEN) out.append(k, v);
  }
  return out;
}

/** The view's canonical params, whitelisted: what its og:url and card URL carry. */
export function ogParams(view: string, sp: URLSearchParams): URLSearchParams {
  const spec = specOf(view);
  const out = new URLSearchParams();
  if (!spec) return out;
  for (const [k, v] of spec.canonical(capped(sp))) if (spec.keys.includes(k)) out.append(k, v);
  return out;
}

/** ≤ SUMMARY_MAX characters of labels and identifiers, e.g. "NFL · 2024 · game 2024_01_BAL_KC". */
export function ogSummary(view: string, sp: URLSearchParams): string {
  const spec = specOf(view);
  if (!spec) return "Platform";
  const text = spec
    .summary(capped(sp))
    .filter(Boolean)
    .join(" · ")
    .replace(/[^\w .,:/()·-]/g, "");
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

/** Everything `/api/og` renders: a known view's name (else "Platform") and its summary. */
export function ogCard(view: string, sp: URLSearchParams): { title: string; summary: string } {
  const spec = specOf(view);
  return spec ? { title: spec.title, summary: ogSummary(view, sp) } : { title: "Platform", summary: "" };
}

/** A platform view page's `generateMetadata`: its title, og:url and share card. */
export function ogMetadata(view: string, sp: URLSearchParams): Metadata {
  const { title, summary } = ogCard(view, sp);
  const qs = ogParams(view, sp);
  const images = [
    {
      // `card`, not `view`: Trends has its own `view` (overlay | multiples), and a second
      // `view` would be read first by the codec and drop it from the card
      url: `/api/og?${new URLSearchParams([["card", view], ...qs])}`,
      width: 1200,
      height: 630,
      alt: summary ? `${title}: ${summary}` : title,
    },
  ];
  return {
    title,
    openGraph: { ...baseMetadata.openGraph, url: `/platform/${view}${qs.size ? `?${qs}` : ""}`, images },
    twitter: { ...baseMetadata.twitter, images },
  };
}
