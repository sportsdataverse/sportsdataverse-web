import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

/** The Data API's freshness bootstrap, `GET /v1/meta`: `datasets["schema.table"]`
 *  is when that table's data last changed (UTC ISO-8601). */
export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  return forward(await dataApi("/v1/meta"));
}
