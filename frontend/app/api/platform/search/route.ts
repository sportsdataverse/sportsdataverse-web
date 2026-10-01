import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

/**
 * Member-gated proxy to the Data API's `GET /v1/search` (F10): players,
 * teams, games and seasons by name, ranked upstream. `q` passes through
 * trimmed to 64 characters (the API 400s outside 2-64: "q must be 2-64
 * characters after trimming", 2026-10-01); `league` (cfb|nfl, absent
 * = every league) and `types` (comma-separated) pass through as given and the
 * API validates them. The upstream `Cache-Control: public` is not forwarded:
 * this route is behind a session.
 */
export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const sp = new URL(req.url).searchParams;
  const pass = (k: string) => sp.get(k)?.trim() || undefined;
  const upstream = await dataApi("/v1/search", {
    searchParams: { q: pass("q")?.slice(0, 64), league: pass("league"), types: pass("types") },
  });
  return forward(upstream);
}
