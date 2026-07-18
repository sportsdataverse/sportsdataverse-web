import { NextResponse } from "next/server";
import { PLATFORM_REPOS } from "@content/platform";
import { requireMemberApp } from "@lib/platform/auth";

/**
 * Same-origin Range-passthrough proxy for GitHub release assets. FROZEN
 * contract (the /platform/explore DuckDB engine reads parquet through it).
 *
 * Why it exists: GitHub's release-download redirect and its signed
 * `release-assets.githubusercontent.com` target send NO CORS headers, so
 * browsers cannot fetch them cross-origin at all. This route resolves the
 * signed URL server-side and streams the requested byte range back on the
 * SAME origin.
 *
 * GET/HEAD ?repo=<owner/name>&tag=<tag>&asset=<file>  (org member only)
 */

/** Signed-URL cache: GitHub's redirect targets live for minutes; 60s is safe. */
const signedUrlCache = new Map<string, { url: string; at: number }>();
const SIGNED_TTL_MS = 60_000;

async function resolveSignedUrl(
  repo: string,
  tag: string,
  asset: string
): Promise<string | null> {
  const key = `${repo}/${tag}/${asset}`;
  const hit = signedUrlCache.get(key);
  if (hit && Date.now() - hit.at < SIGNED_TTL_MS) return hit.url;
  const upstream = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`;
  const res = await fetch(upstream, { method: "HEAD", redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) return null;
  signedUrlCache.set(key, { url: location, at: Date.now() });
  return location;
}

const FORWARD_RESPONSE_HEADERS = [
  "content-length",
  "content-range",
  "accept-ranges",
  "content-type",
  "etag",
  "last-modified",
] as const;

async function proxy(req: Request, method: "GET" | "HEAD") {
  const { deny } = await requireMemberApp();
  if (deny) return deny;

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  const asset = url.searchParams.get("asset") ?? "";
  if (!repo || !tag || !asset || asset.includes("/")) {
    return NextResponse.json(
      { message: "repo, tag and asset are required.", success: false },
      { status: 400 }
    );
  }
  if (!PLATFORM_REPOS.some((r) => r.repo === repo && r.hasReleases)) {
    return NextResponse.json(
      { message: `${repo} is not a tracked release repo.`, success: false },
      { status: 403 }
    );
  }

  const signed = await resolveSignedUrl(repo, tag, asset);
  if (!signed) {
    return NextResponse.json(
      { message: "Asset not found.", success: false },
      { status: 404 }
    );
  }

  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(signed, { method, headers });
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { message: `Upstream ${upstream.status}`, success: false },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  // Stream the (possibly multi-MB) range straight through — never buffered.
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(req: Request) {
  return proxy(req, "GET");
}

export async function HEAD(req: Request) {
  return proxy(req, "HEAD");
}
