import { NextResponse } from "next/server";
import { PLATFORM_REPOS } from "@content/platform";
import { requireMemberApp } from "@lib/platform/auth";
import { GithubError, listReleaseAssets } from "@lib/platform/github";

/**
 * GET ?repo=<owner/name>&tag=<release tag> -> the release's FULL asset list
 * (the Datasets page truncates to 20/release). Feeds the /platform/explore
 * asset picker. Org-member only; repo must be a tracked release repo.
 */

export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  if (!repo || !tag) {
    return NextResponse.json(
      { message: "repo and tag are required.", success: false },
      { status: 400 }
    );
  }
  if (!PLATFORM_REPOS.some((r) => r.repo === repo && r.hasReleases)) {
    return NextResponse.json(
      { message: `${repo} is not a tracked release repo.`, success: false },
      { status: 403 }
    );
  }

  try {
    const assets = await listReleaseAssets(repo, tag);
    return NextResponse.json({ message: assets, success: true });
  } catch (error) {
    const status = error instanceof GithubError ? error.status : 502;
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "GitHub error",
        success: false,
      },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
