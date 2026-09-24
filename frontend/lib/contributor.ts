/**
 * Contributor detection for auth callbacks. Isolated from next-auth to be testable
 * in Node.js test environments.
 */

const SDV_ORG = "sportsdataverse";

/**
 * Has this person landed a merged PR anywhere in the org? One search call with
 * the viewer's own token, cached on the JWT next to the membership check. Any
 * failure reads false: this only ever *skips* the review queue, so a wrong
 * false costs a queue entry while a wrong true admits a stranger.
 */
export async function fetchIsContributor(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const q = encodeURIComponent(`org:${SDV_ORG} is:pr is:merged author:@me`);
  try {
    const res = await fetchImpl(`https://api.github.com/search/issues?q=${q}&per_page=1`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { total_count?: unknown };
    return typeof data.total_count === "number" && data.total_count > 0;
  } catch {
    return false;
  }
}
