import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  const p = new URL(req.url).searchParams;
  return forward(
    await dataApi(`/v1/runs/${encodeURIComponent(id)}/logs`, {
      searchParams: {
        limit: p.get("limit") ?? undefined,
        offset: p.get("offset") ?? undefined,
      },
    })
  );
}
