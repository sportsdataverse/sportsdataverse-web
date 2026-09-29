import type { ScatterNames } from "../../content/scatter.ts";
import type { ReleaseAssetSummary } from "./github.ts";
import { API_MAX_ROWS } from "./wp.ts";

/** One `GET /v1/{schema}/{table}` through the member-gated /api/platform/query/run
 *  proxy (the Query page's call shape): the rows, or the API's error message. */
export async function apiRows(params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/platform/query/run?${new URLSearchParams(params)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { data: Record<string, unknown>[] }).data;
}

/** A release's assets through the member-gated assets route. The body is read
 *  tolerantly and after the status, so a non-JSON error page (a proxy 502)
 *  still reports its HTTP status instead of a JSON parse error. */
export async function fetchReleaseAssets(repo: string, tag: string): Promise<ReleaseAssetSummary[]> {
  const res = await fetch(`/api/platform/datasets/assets?repo=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`);
  const data = (await res.json().catch(() => null)) as { success?: boolean; message?: unknown } | null;
  if (!res.ok || !data?.success) {
    throw new Error(typeof data?.message === "string" && data.message ? data.message : `Release assets failed (HTTP ${res.status})`);
  }
  return data.message as ReleaseAssetSummary[];
}

/** Every season from a table's first to its latest under its fixed filters,
 *  newest first: two one-row reads. */
export async function seasonRange(
  src: { schema: string; table: string; filter?: Readonly<Record<string, string>> },
  col = "season"
): Promise<string[]> {
  const edge = (order: string) => apiRows({ ...src.filter, schema: src.schema, table: src.table, select: col, order, limit: "1" });
  const [first, last] = await Promise.all([edge(col), edge(`-${col}`)]);
  const [a, b] = [Number(first[0]?.[col]), Number(last[0]?.[col])];
  if (!Number.isInteger(a) || !Number.isInteger(b)) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => String(b - i));
}

/** The team table's key → name rows that `names` joins (the season's own
 *  where `bySeason`, e.g. a D-I list). */
export function teamNameRows(names: ScatterNames, season: string): Promise<Record<string, unknown>[]> {
  return apiRows({
    schema: names.schema,
    table: names.table,
    select: `${names.key},${names.name}`,
    ...(names.bySeason ? { season } : {}),
    limit: API_MAX_ROWS,
  });
}
