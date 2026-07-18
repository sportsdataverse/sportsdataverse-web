import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  return forward(await dataApi("/v1/pipelines"));
}
