import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  return forward(
    await dataApi(`/v1/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" })
  );
}
