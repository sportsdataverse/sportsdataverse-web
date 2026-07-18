import { requireMemberApp } from "@lib/platform/auth";
import { dataApi } from "@lib/platform/orch";

/**
 * Generic member-gated query passthrough to `GET /v1/{schema}/{table}`.
 * Everything except schema/table is forwarded verbatim (filters, select,
 * order, limit, offset, format=csv) — the Data API validates identifiers
 * against information_schema, so the proxy stays dumb.
 */
export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const url = new URL(req.url);
  const schema = url.searchParams.get("schema") ?? "";
  const table = url.searchParams.get("table") ?? "";
  const ident = /^[a-z_][a-z0-9_]*$/;
  if (!ident.test(schema) || !ident.test(table)) {
    return Response.json({ message: "invalid schema/table" }, { status: 400 });
  }
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "schema" && k !== "table") params[k] = v;
  });
  const upstream = await dataApi(`/v1/${schema}/${table}`, {
    searchParams: params,
  });
  // Pass CSV straight through (download); JSON via text keeps status intact.
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  });
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  return new Response(upstream.body, { status: upstream.status, headers });
}
