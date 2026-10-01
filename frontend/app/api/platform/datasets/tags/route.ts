import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { GithubError, listRepoReleases } from "@lib/platform/github";

const DATA_REPO = "sportsdataverse/sportsdataverse-data";
const TTL_MS = 15 * 60_000;
let memo: { tags: string[]; ts: number } | null = null;

/**
 * GET -> every sportsdataverse-data release tag, `{success, message: string[]}`,
 * for the ⌘K palette's Datasets group (filtered client-side). The listing is
 * 350+ releases over 4 GitHub pages (`listRepoReleases` pages them all), so it
 * is memoised 15 minutes per instance on top of github.ts's 2-minute + ETag
 * cache. Org-member only.
 */
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  try {
    if (!memo || Date.now() - memo.ts > TTL_MS) {
      memo = { tags: (await listRepoReleases(DATA_REPO)).map((r) => r.tag), ts: Date.now() };
    }
    return NextResponse.json({ message: memo.tags, success: true });
  } catch (error) {
    const status = error instanceof GithubError ? error.status : 502;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "GitHub error", success: false },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
