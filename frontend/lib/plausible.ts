export type ClickRow = { event: string; platform: string; placement: string; count: number };
export type ClickCounts = { status: "unconfigured" | "ok" | "error"; httpStatus?: number; rows: ClickRow[] };

const ENDPOINT = "https://plausible.io/api/v2/query";
const DEFAULT_SITE = "sportsdataverse.org"; // app/providers.tsx reports under this domain

/**
 * follow_click / support_click totals by platform and placement, last 91 days,
 * from the Plausible Stats API v2. Never throws. Reports WHY it has no numbers —
 * unconfigured, or the HTTP status Plausible returned — so the tab can say so
 * instead of drawing an empty chart that reads as "nobody clicked". A response
 * body is never passed through: it is third-party text.
 */
export async function fetchClickCounts(deps: { apiKey?: string; siteId?: string; fetchImpl?: typeof fetch }): Promise<ClickCounts> {
  if (!deps.apiKey) return { status: "unconfigured", rows: [] };
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        site_id: deps.siteId || DEFAULT_SITE,
        metrics: ["events"],
        date_range: "91d", // Plausible's preset; there is no "90d"
        filters: [["is", "event:goal", ["follow_click", "support_click"]]],
        dimensions: ["event:goal", "event:props:platform", "event:props:placement"],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: "error", rows: [] };
  }
  if (!res.ok) return { status: "error", httpStatus: res.status, rows: [] };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: "error", httpStatus: res.status, rows: [] };
  }
  // `null`, `42` and `"x"` are all valid JSON: res.json() resolves on them, so the
  // shape is checked here rather than trusted after the parse
  const results = body && typeof body === "object" ? (body as { results?: unknown }).results : undefined;
  if (!Array.isArray(results)) return { status: "error", httpStatus: res.status, rows: [] };
  const rows: ClickRow[] = [];
  for (const r of results as { dimensions?: unknown; metrics?: unknown }[]) {
    const d = r?.dimensions;
    const m = r?.metrics;
    if (!Array.isArray(d) || d.length !== 3 || !d.every((x) => typeof x === "string")) continue;
    if (!Array.isArray(m) || typeof m[0] !== "number") continue;
    rows.push({ event: d[0], platform: d[1], placement: d[2], count: m[0] });
  }
  rows.sort((a, b) => b.count - a.count);
  // platform/placement are unauthenticated event props anyone can post to our
  // site id; cap the response so a flood of distinct values can't inflate it
  return { status: "ok", rows: rows.slice(0, 20) };
}
