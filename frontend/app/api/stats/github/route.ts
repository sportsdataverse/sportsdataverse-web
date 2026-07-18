import { NextResponse } from "next/server";
import {
  fetchGithub,
  getOldStats,
  getGithubStarsAndForks,
} from "@lib/github";

export async function GET() {
  const {
    public_repos: repos,
    public_gists: gists,
    followers,
  } = await fetchGithub();
  const { githubStars, forks } = await getGithubStarsAndForks();

  // it runs when user's api is exhausted, it gives the old data
  if (repos === undefined && gists === undefined) {
    const {
      public_repos: repos,
      public_gists: gists,
      followers,
    } = getOldStats();
    return NextResponse.json(
      {
        repos,
        gists,
        followers,
        githubStars,
        forks,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      repos,
      gists,
      followers,
      githubStars,
      forks,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    }
  );
}
