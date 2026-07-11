import type { NextApiRequest, NextApiResponse } from "next";
import { PLATFORM_REPOS, isDispatchAllowed } from "@content/platform";
import { requireMember } from "@lib/platform/auth";
import { GithubError, dispatchWorkflow, listRepoWorkflows } from "@lib/platform/github";
import type { WorkflowSummary } from "@lib/platform/github";

export type AutomationRepo = {
  repo: string;
  kind: string;
  sport: string;
  dispatchable: string[];
  workflows: WorkflowSummary[];
  error: string | null;
};

/**
 * GET  -> workflow + latest-run summary for every tracked repo.
 * POST -> { repo, workflow, ref? } workflow_dispatch (allowlisted files only).
 * Both require an org-member session; the GitHub token stays server-side.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireMember(req, res);
  if (!actor) return;

  if (req.method === "GET") {
    // One failing repo must not blank the dashboard -> allSettled per repo.
    const settled = await Promise.allSettled(
      PLATFORM_REPOS.map((entry) => listRepoWorkflows(entry.repo))
    );
    const repos: AutomationRepo[] = PLATFORM_REPOS.map((entry, i) => {
      const outcome = settled[i];
      return {
        repo: entry.repo,
        kind: entry.kind,
        sport: entry.sport,
        dispatchable: entry.dispatchable ?? [],
        workflows: outcome.status === "fulfilled" ? outcome.value : [],
        error:
          outcome.status === "rejected"
            ? outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason)
            : null,
      };
    });
    return res.json({ message: repos, success: true });
  }

  if (req.method === "POST") {
    const { repo, workflow, ref } = (req.body ?? {}) as {
      repo?: string;
      workflow?: string;
      ref?: string;
    };
    if (typeof repo !== "string" || typeof workflow !== "string") {
      return res
        .status(400)
        .json({ message: "Body must include { repo, workflow }.", success: false });
    }
    if (!isDispatchAllowed(repo, workflow)) {
      return res.status(403).json({
        message: `Workflow "${workflow}" in ${repo} is not allowlisted for dispatch (see content/platform.ts).`,
        success: false,
      });
    }
    try {
      await dispatchWorkflow(repo, workflow, typeof ref === "string" && ref ? ref : "main");
      return res.json({
        message: `Dispatched ${workflow} on ${repo} (by @${actor}).`,
        success: true,
      });
    } catch (error) {
      const status = error instanceof GithubError ? error.status : 502;
      return res.status(status >= 400 && status < 600 ? status : 502).json({
        message: error instanceof Error ? error.message : "Dispatch failed",
        success: false,
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ message: "Method not allowed", success: false });
}
