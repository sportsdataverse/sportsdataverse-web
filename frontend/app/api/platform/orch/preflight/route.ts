import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

// Synchronous package-freshness audit: every SDV package clone vs origin +
// installed version vs clone. Powers the env-health badge on the pipelines page.
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  return forward(await dataApi("/v1/preflight"));
}
