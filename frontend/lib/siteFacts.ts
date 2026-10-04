import { unstable_cache } from "next/cache";
import { listDbStatuses } from "@lib/platform/dbStatus";
import { listRepoReleases } from "@lib/platform/github";
import { siteFacts, type SiteFacts, type WarehouseStatus } from "@lib/warehouseFigures";

/**
 * The one server-side read of the warehouse figures: the sdv-db heartbeat (rows, tables) and the
 * sportsdataverse-data release list (leagues, datasets). /stats, the ticker, the home hero and /about
 * all read it, so they cannot disagree. Each half is cached for an hour across requests; a read that
 * fails throws inside the cache, so it is not cached and the next render tries again, and here it
 * becomes null, which the pages show as no figure at all. Server-only (Mongo, GitHub token).
 */

/** The release catalog /stats counts leagues and datasets from. */
export const RELEASES_REPO = "sportsdataverse/sportsdataverse-data";

export type WarehouseSnapshot = { status: WarehouseStatus; releaseTags: string[] | null };

const cachedStatus = unstable_cache(
  async (): Promise<NonNullable<WarehouseStatus>> => {
    const s = (await listDbStatuses()).find((d) => d.source === "sdv-db");
    if (!s) throw new Error("no sdv-db heartbeat");
    // only the fields the public pages read, never the whole heartbeat document
    return { ok: s.ok, row_estimate: s.row_estimate, table_count: s.table_count, error: s.error, collected_at: s.collected_at };
  },
  ["warehouse-status-v1"],
  { revalidate: 3600 }
);

const cachedReleaseTags = unstable_cache(
  async (): Promise<string[]> => (await listRepoReleases(RELEASES_REPO)).map((r) => r.tag),
  ["warehouse-release-tags-v1"],
  { revalidate: 3600 }
);

export async function warehouseSnapshot(): Promise<WarehouseSnapshot> {
  const [status, releaseTags] = await Promise.all([
    cachedStatus().catch(() => null),
    cachedReleaseTags().catch(() => null),
  ]);
  return { status, releaseTags };
}

export async function getSiteFacts(): Promise<SiteFacts> {
  return siteFacts(await warehouseSnapshot());
}
