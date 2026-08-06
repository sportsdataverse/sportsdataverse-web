import { NextResponse } from "next/server";
import { isHttpsBase, requireMemberApp } from "@lib/platform/auth";

/**
 * Member-gated pass-through for the Data API's OpenAPI schema.
 *
 * The API stopped serving /openapi.json anonymously, so the docs page reads it
 * through here: the key stays server-side and the spec only reaches signed-in
 * org members. The upstream body (~6 MB) is streamed rather than parsed — this
 * route never inspects it, so there's no reason to buffer it into the function.
 *
 * Reuses SDV_DATA_ADMIN_KEY (minted with read+admin scopes). Only ever sent to
 * this one fixed path, so the extra scope is never exercised; a dedicated
 * read-only key would work equally well if one is ever minted.
 */

const BASE = process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";

export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const key = process.env.SDV_DATA_ADMIN_KEY;
  if (!key || !isHttpsBase(BASE)) {
    return NextResponse.json(
      { message: "data api key not configured", success: false },
      { status: 503 }
    );
  }
  try {
    const upstream = await fetch(`${BASE}/openapi.json`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { message: "spec unavailable", success: false },
        { status: upstream.status === 200 ? 502 : upstream.status }
      );
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        // Per-viewer cache: the spec only changes when the API redeploys, and
        // re-fetching 6 MB on every page view helps nobody.
        "cache-control": "private, max-age=600",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "data api unreachable", success: false },
      { status: 502 }
    );
  }
}
