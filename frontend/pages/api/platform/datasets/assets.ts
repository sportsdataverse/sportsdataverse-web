import type { NextApiRequest, NextApiResponse } from "next";
import { PLATFORM_REPOS } from "@content/platform";
import { requireMember } from "@lib/platform/auth";
import { GithubError, listReleaseAssets } from "@lib/platform/github";

/**
 * GET ?repo=<owner/name>&tag=<release tag> -> the release's FULL asset list
 * (the Datasets page truncates to 20/release). Feeds the /platform/explore
 * asset picker. Org-member only; repo must be a tracked release repo.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireMember(req, res);
  if (!actor) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed", success: false });
  }

  const { repo, tag } = req.query;
  if (typeof repo !== "string" || typeof tag !== "string" || !repo || !tag) {
    return res.status(400).json({ message: "repo and tag are required.", success: false });
  }
  if (!PLATFORM_REPOS.some((r) => r.repo === repo && r.hasReleases)) {
    return res.status(403).json({ message: `${repo} is not a tracked release repo.`, success: false });
  }

  try {
    const assets = await listReleaseAssets(repo, tag);
    return res.json({ message: assets, success: true });
  } catch (error) {
    const status = error instanceof GithubError ? error.status : 502;
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      message: error instanceof Error ? error.message : "GitHub error",
      success: false,
    });
  }
}
