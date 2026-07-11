/**
 * Server-only GitHub REST helpers for the /platform area.
 *
 * Auth: `GH_PLATFORM_TOKEN` (fine-grained PAT, actions:read + actions:write
 * on the org repos). Read endpoints degrade to unauthenticated calls (public
 * repos work, 60 req/h rate limit) when the token is unset; dispatch refuses.
 *
 * Never import this from client code — the token must not ship to browsers.
 */

const GH_API = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sportsdataverse-web-platform",
  };
  const token = process.env.GH_PLATFORM_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Hard cap on any single GitHub call so a slow upstream can't hang a page render. */
const GH_TIMEOUT_MS = 15_000;

async function ghGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GH_API}${path}`, {
    headers: ghHeaders(),
    signal: AbortSignal.timeout(GH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new GithubError(res.status, `GitHub ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Workflows / runs (Automation pillar)
// ---------------------------------------------------------------------------

export type WorkflowRunSummary = {
  id: number;
  run_number: number;
  event: string;
  status: string | null; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | ...
  html_url: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowSummary = {
  id: number;
  name: string;
  path: string; // ".github/workflows/<file>"
  file: string; // "<file>"
  state: string; // active | disabled_*
  html_url: string;
  latest_run: WorkflowRunSummary | null;
};

type GhWorkflow = {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
};

type GhRun = WorkflowRunSummary & { workflow_id: number };

/**
 * List a repo's workflows with each one's latest run. Two API calls per repo
 * (workflows + last 50 runs), matched in memory — cheap enough for a
 * dashboard, no pagination loops.
 */
export async function listRepoWorkflows(repo: string): Promise<WorkflowSummary[]> {
  const [wfs, runs] = await Promise.all([
    ghGet<{ workflows: GhWorkflow[] }>(`/repos/${repo}/actions/workflows?per_page=100`),
    ghGet<{ workflow_runs: GhRun[] }>(`/repos/${repo}/actions/runs?per_page=50`),
  ]);
  const latestByWorkflow = new Map<number, GhRun>();
  for (const run of runs.workflow_runs) {
    // Runs come newest-first; keep the first seen per workflow.
    if (!latestByWorkflow.has(run.workflow_id)) latestByWorkflow.set(run.workflow_id, run);
  }
  return wfs.workflows.map((wf) => {
    const run = latestByWorkflow.get(wf.id) ?? null;
    return {
      id: wf.id,
      name: wf.name,
      path: wf.path,
      file: wf.path.split("/").pop() ?? wf.path,
      state: wf.state,
      html_url: wf.html_url,
      latest_run: run
        ? {
            id: run.id,
            run_number: run.run_number,
            event: run.event,
            status: run.status,
            conclusion: run.conclusion,
            html_url: run.html_url,
            created_at: run.created_at,
            updated_at: run.updated_at,
          }
        : null,
    };
  });
}

/** Trigger workflow_dispatch on `ref` (default branch name). 204 on success. */
export async function dispatchWorkflow(
  repo: string,
  workflowFile: string,
  ref = "main"
): Promise<void> {
  if (!process.env.GH_PLATFORM_TOKEN) {
    throw new GithubError(503, "GH_PLATFORM_TOKEN is not configured; dispatch is disabled.");
  }
  const res = await fetch(
    `${GH_API}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    {
      method: "POST",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    }
  );
  if (res.status !== 204) {
    const body = await res.text();
    throw new GithubError(res.status, `dispatch ${repo}/${workflowFile} -> ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// Releases (Datasets pillar)
// ---------------------------------------------------------------------------

export type ReleaseAssetSummary = {
  name: string;
  size: number;
  download_count: number;
  updated_at: string;
  browser_download_url: string;
};

export type ReleaseSummary = {
  tag: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  asset_count: number;
  total_size: number;
  assets: ReleaseAssetSummary[];
};

type GhRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  assets: {
    name: string;
    size: number;
    download_count: number;
    updated_at: string;
    browser_download_url: string;
  }[];
};

/**
 * A repo's releases, newest first. Assets are truncated to the newest 20 per
 * release to keep payloads sane (sportsdataverse-data releases carry hundreds
 * of assets); `asset_count`/`total_size` always reflect the full set.
 */
export async function listRepoReleases(repo: string, perPage = 15): Promise<ReleaseSummary[]> {
  const releases = await ghGet<GhRelease[]>(`/repos/${repo}/releases?per_page=${perPage}`);
  return releases.map((rel) => ({
    tag: rel.tag_name,
    name: rel.name,
    html_url: rel.html_url,
    published_at: rel.published_at,
    asset_count: rel.assets.length,
    total_size: rel.assets.reduce((sum, a) => sum + a.size, 0),
    assets: rel.assets
      .slice()
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, 20)
      .map((a) => ({
        name: a.name,
        size: a.size,
        download_count: a.download_count,
        updated_at: a.updated_at,
        browser_download_url: a.browser_download_url,
      })),
  }));
}
