import { requireMemberApp } from "@lib/platform/auth";
import { dataApi, forward } from "@lib/platform/orch";

/** Table + column catalog for one schema (powers the query builder). */
export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const schema = new URL(req.url).searchParams.get("schema") ?? "";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    return Response.json({ message: "invalid schema" }, { status: 400 });
  }
  return forward(await dataApi(`/v1/${schema}/tables`));
}
