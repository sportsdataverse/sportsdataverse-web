import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { dataApi } from "@lib/platform/orch";

/** The response is per session, never shared: the upstream `public` caching is not forwarded. */
const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Member-gated proxy to the Data API's `GET /v1/search` (F10): players,
 * teams, games and seasons by name, ranked upstream. `q` passes through
 * trimmed to 64 characters (the API 400s outside 2-64: "q must be 2-64
 * characters after trimming", 2026-10-01); `league` (cfb|nfl, absent
 * = every league) and `types` (comma-separated) pass through as given and the
 * API validates them. The upstream status and JSON body are forwarded as-is;
 * a network failure answers 502.
 */
export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const sp = new URL(req.url).searchParams;
  const pass = (k: string) => sp.get(k)?.trim() || undefined;
  try {
    const upstream = await dataApi("/v1/search", {
      searchParams: { q: pass("q")?.slice(0, 64), league: pass("league"), types: pass("types") },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...PRIVATE },
    });
  } catch {
    return NextResponse.json(
      { message: "The search index did not answer.", success: false },
      { status: 502, headers: PRIVATE }
    );
  }
}
