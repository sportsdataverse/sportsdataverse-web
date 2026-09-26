import { classifyReleaseTag } from "../content/platform.ts";

/** The heartbeat fields this page reads; never the full DbStatusDoc shape. */
export type WarehouseStatus = {
  ok?: boolean;
  row_estimate?: number;
  table_count?: number;
  error?: string;
  collected_at: string;
} | null;

export type WarehouseInput = {
  status: WarehouseStatus;
  /** sportsdataverse-data release tags, or null when the release list failed to load. */
  releaseTags: string[] | null;
  packages: number | null;
};

export type WarehouseTile = { title: string; value: string };

export type WarehouseFigures = {
  tiles: WarehouseTile[];
  /** YYYY-MM-DD from the heartbeat, or null when there's nothing live to date it. */
  asOf: string | null;
};

const DASH = "—";

/**
 * `123_456_789` → `"123M+"`, `1_234_567` → `"1.2M+"`, `9_870` → `"9,870"`.
 * Always floored, never rounded, so the figure never overstates the source.
 */
export function formatCount(n: number): string {
  if (n >= 100_000_000) return `${Math.floor(n / 1_000_000)}M+`;
  if (n >= 1_000_000) return `${(Math.floor(n / 100_000) / 10).toFixed(1)}M+`;
  return n.toLocaleString("en-US");
}

/**
 * Live warehouse figures for the public `/stats` page. Each of the three
 * sources (heartbeat, release list, package count) fails independently — a
 * missing one renders "—" on its own tile(s) rather than falling back to a
 * stale hard-coded number.
 */
export function warehouseFigures({ status, releaseTags, packages }: WarehouseInput): WarehouseFigures {
  const rows = status?.row_estimate != null ? formatCount(status.row_estimate) : DASH;
  const tables = status?.table_count != null ? formatCount(status.table_count) : DASH;

  const leagues = releaseTags
    ? String(
        new Set(
          releaseTags
            .map((tag) => classifyReleaseTag(tag).sport)
            .filter((sport) => sport !== "other" && sport !== "phf")
        ).size
      )
    : DASH;
  const datasets = releaseTags ? String(releaseTags.length) : DASH;

  const pkgs = packages != null ? formatCount(packages) : DASH;

  // The heartbeat can report ok: false (a reachable source with nothing to say) yet
  // still ship stale numbers. Only date the section when the heartbeat vouches for
  // itself, or when it actually gave us the row/table figures those tiles show.
  const heartbeatLive =
    status?.ok === true || status?.row_estimate != null || status?.table_count != null;

  return {
    tiles: [
      { title: "Rows in the warehouse", value: rows },
      { title: "Tables in the warehouse", value: tables },
      { title: "Leagues in the warehouse", value: leagues },
      { title: "Datasets in the catalog", value: datasets },
      { title: "Open-source packages", value: pkgs },
    ],
    asOf: heartbeatLive && status?.collected_at ? status.collected_at.slice(0, 10) : null,
  };
}
