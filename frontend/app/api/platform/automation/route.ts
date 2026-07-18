import { NextResponse } from "next/server";
import { PLATFORM_REPOS, isDispatchAllowed } from "@content/platform";
import { requireMemberApp } from "@lib/platform/auth";
import { GithubError, dispatchWorkflow, listRepoWorkflows, settlePool } from "@lib/platform/github";
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

export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;

  // One failing repo must not blank the dashboard -> settled per repo;
  // bounded concurrency keeps 40+ repos under GitHub's abuse limits.
  const settled = await settlePool(PLATFORM_REPOS, (entry) => listRepoWorkflows(entry.repo));
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
  return NextResponse.json({ message: repos, success: true });
}

export async function POST(req: Request) {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  const actor = session.login ?? "unknown";

  const { repo, workflow, ref } = ((await req.json().catch(() => ({}))) ?? {}) as {
    repo?: string;
    workflow?: string;
    ref?: string;
  };
  if (typeof repo !== "string" || typeof workflow !== "string") {
    return NextResponse.json(
      { message: "Body must include { repo, workflow }.", success: false },
      { status: 400 }
    );
  }
  if (!isDispatchAllowed(repo, workflow)) {
    return NextResponse.json(
      {
        message: `Workflow "${workflow}" in ${repo} is not allowlisted for dispatch (see content/platform.ts).`,
        success: false,
      },
      { status: 403 }
    );
  }
  try {
    await dispatchWorkflow(repo, workflow, typeof ref === "string" && ref ? ref : "main");
    return NextResponse.json({
      message: `Dispatched ${workflow} on ${repo} (by @${actor}).`,
      success: true,
    });
  } catch (error) {
    const status = error instanceof GithubError ? error.status : 502;
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Dispatch failed",
        success: false,
      },
      { status: status >= 400 && status < 600 ? status : 502 }
    );
  }
}
