import type { NextApiRequest, NextApiResponse } from "next";
import { PLATFORM_REPOS } from "@content/platform";
import { requireMember } from "@lib/platform/auth";

/**
 * Same-origin Range-passthrough proxy for GitHub release assets.
 *
 * Why it exists: the /platform/explore DuckDB engine reads parquet via HTTP
 * range requests, but GitHub's release-download redirect and its signed
 * `release-assets.githubusercontent.com` target send NO CORS headers, so
 * browsers cannot fetch them cross-origin at all. This route resolves the
 * signed URL server-side and streams the requested byte range back on the
 * SAME origin — no CORS, session auth rides along on the worker's XHR.
 *
 * GET/HEAD ?repo=<owner/name>&tag=<tag>&asset=<file>  (org member only)
 */

export const config = {
  api: { responseLimit: false },
};

/** Signed-URL cache: GitHub's redirect targets live for minutes; 60s is safe. */
const signedUrlCache = new Map<string, { url: string; at: number }>();
const SIGNED_TTL_MS = 60_000;

async function resolveSignedUrl(repo: string, tag: string, asset: string): Promise<string | null> {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireMember(req, res);
  if (!actor) return;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ message: "Method not allowed", success: false });
  }

  const { repo, tag, asset } = req.query;
  if (
    typeof repo !== "string" ||
    typeof tag !== "string" ||
    typeof asset !== "string" ||
    !repo ||
    !tag ||
    !asset ||
    asset.includes("/")
  ) {
    return res.status(400).json({ message: "repo, tag and asset are required.", success: false });
  }
  if (!PLATFORM_REPOS.some((r) => r.repo === repo && r.hasReleases)) {
    return res
      .status(403)
      .json({ message: `${repo} is not a tracked release repo.`, success: false });
  }

  const signed = await resolveSignedUrl(repo, tag, asset);
  if (!signed) {
    return res.status(404).json({ message: "Asset not found.", success: false });
  }

  const headers: Record<string, string> = {};
  if (typeof req.headers.range === "string") headers.Range = req.headers.range;

  const upstream = await fetch(signed, { method: req.method, headers });
  if (!upstream.ok && upstream.status !== 206) {
    return res
      .status(upstream.status === 404 ? 404 : 502)
      .json({ message: `Upstream ${upstream.status}`, success: false });
  }

  res.status(upstream.status);
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  if (req.method === "HEAD" || !upstream.body) {
    return res.end();
  }
  // Stream the (possibly multi-MB) range straight through — never buffered.
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
