import { SHOTS_LEAGUES } from "../../content/shots.ts";
import { WP_SPORTS } from "../../content/wp.ts";

/**
 * One hit from `GET /api/platform/search` (the Data API's F10 `/v1/search`),
 * or a dataset hit the palette builds itself from a release tag. F10 also
 * sends a `path`, a game-on-paper path: the platform ignores it and routes a
 * hit to its own view through `platformPathFor`.
 */
export type SearchHit = {
  type: string;
  id: string;
  label: string;
  sublabel?: string | null;
  league: string;
  season?: number | null;
  score?: number;
  path?: string;
};

/** Trends sources per F10 league (content/trends.ts keys): the CFB weekly
 *  summaries key the school name, F10's label; the NFL ratings key the
 *  abbreviation, which F10 carries as its sublabel's first token (`KC · AFC`).
 *  A league with its own Trends key (mbb, nba, …) charts by display name. */
const TRENDS_SPORT: Record<string, string> = {
  cfb: "cfb_team_summaries_weekly",
  nfl: "nfl_ratings_weekly",
};

/**
 * The platform view URL for a search hit, with the view's own URL state
 * (lib/platform/viewState.ts keys), or null for a type the platform has no
 * view for — the palette does not list those.
 *
 * - player → Shots when the league has shots (content/shots.ts), else Lookups by name;
 * - team → Trends with the team picked;
 * - game → Win probability for that game;
 * - season → Explore on the league's play-by-play release (content/wp.ts), that season;
 * - dataset → Explore on that release tag.
 */
export function platformPathFor(hit: SearchHit): string | null {
  const p = new URLSearchParams();
  const season = hit.season == null ? "" : String(hit.season);
  switch (hit.type) {
    case "player":
      if (hit.league in SHOTS_LEAGUES) {
        p.set("league", hit.league);
        if (season) p.set("season", season);
        p.set("player", hit.id);
        return `/platform/shots?${p}`;
      }
      p.set("sport", hit.league);
      p.set("q", hit.label);
      return `/platform/lookups?${p}`;
    case "team":
      p.set("sport", TRENDS_SPORT[hit.league] ?? hit.league);
      // ponytail: the NFL abbreviation is read off the sublabel; an `abbr` field on the hit would replace this
      p.set("team", hit.league === "nfl" ? (hit.sublabel?.split(" · ")[0] || hit.label) : hit.label);
      return `/platform/trends?${p}`;
    case "game":
      p.set("sport", hit.league);
      if (season) p.set("season", season);
      p.set("game", hit.id);
      return `/platform/wp?${p}`;
    case "season": {
      const tag = WP_SPORTS.find((s) => s.key === hit.league)?.tag;
      if (!tag) return null;
      p.set("tag", tag);
      p.set("season", season || hit.id);
      return `/platform/explore?${p}`;
    }
    case "dataset":
      p.set("tag", hit.id);
      return `/platform/explore?${p}`;
    default:
      return null;
  }
}
