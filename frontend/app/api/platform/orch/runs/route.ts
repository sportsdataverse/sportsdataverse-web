import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const p = new URL(req.url).searchParams;
  return forward(
    await dataApi("/v1/runs", {
      searchParams: {
        limit: p.get("limit") ?? undefined,
        offset: p.get("offset") ?? undefined,
        state: p.get("state") ?? undefined,
      },
    })
  );
}

export async function POST(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const body = await req.json().catch(() => ({}));
  return forward(
    await dataApi("/v1/runs", { method: "POST", body: JSON.stringify(body) })
  );
}
