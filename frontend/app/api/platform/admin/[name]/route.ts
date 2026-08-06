import { NextResponse } from "next/server";
import { isHttpsBase, requireAdminApp } from "@lib/platform/auth";

/** Server-side proxy to the Data API admin endpoints — the admin key never
 *  reaches the browser. Query params pass through verbatim. */

const BASE =
  process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";
const NAMES = new Set(["summary", "requests", "keys", "errors", "site"]);

type Ctx = { params: Promise<{ name: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const { name } = await ctx.params;
  if (!NAMES.has(name)) {
    return NextResponse.json(
      { message: "unknown panel", success: false },
      { status: 404 }
    );
  }
  const key = process.env.SDV_DATA_ADMIN_KEY;
  if (!key || !isHttpsBase(BASE)) {
    return NextResponse.json(
      { message: "admin key not configured", success: false },
      { status: 503 }
    );
  }
  const qs = new URL(req.url).search;
  try {
    const upstream = await fetch(`${BASE}/v1/admin/${name}${qs}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return NextResponse.json(await upstream.json(), {
      status: upstream.status,
    });
  } catch {
    return NextResponse.json(
      { message: "data api unreachable", success: false },
      { status: 502 }
    );
  }
}
