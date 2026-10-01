import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { listRepoReleases } from "@lib/platform/github";

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const TTL_MS = 15 * 60_000;
/** Member-only: never shared by a cache between sessions. */
const PRIVATE = { "Cache-Control": "private, no-store" };

let memo: { tags: string[]; ts: number } | null = null;
let inflight: Promise<string[]> | null = null;

/**
 * GET -> every sportsdataverse-data release tag, `{success, message: string[]}`,
 * for the ⌘K palette's Datasets group (filtered client-side). The listing is
 * 350+ releases over 4 GitHub pages (`listRepoReleases` pages them all), so it
 * is memoised 15 minutes per instance on top of github.ts's 2-minute + ETag
 * cache. Org-member only; a GitHub failure with nothing memoised is a fixed
 * 502 (no upstream message is echoed).
 */
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  try {
    return NextResponse.json({ message: await releaseTags(), success: true }, { headers: PRIVATE });
  } catch {
    return NextResponse.json(
      { message: "The release listing did not answer.", success: false },
      { status: 502, headers: PRIVATE }
    );
  }
}

/**
 * Every release tag, memoised 15 minutes per instance. One listing at a time:
 * callers arriving while it pages GitHub share that promise. After the memo
 * expires, a failed listing serves the memoised tags (stale on error);
 * without any, it throws.
 */
async function releaseTags(): Promise<string[]> {
  if (memo && Date.now() - memo.ts < TTL_MS) return memo.tags;
  if (!inflight) {
    inflight = listRepoReleases(DATA_REPO)
      .then((releases) => {
        memo = { tags: releases.map((r) => r.tag), ts: Date.now() };
        return memo.tags;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch (error) {
    if (memo) return memo.tags;
    throw error;
  }
}
