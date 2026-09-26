import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { matches, parseCommunityQuery } from "@lib/community";
import { audit, auditParams, exportable, loadCommunity, toCsv } from "@lib/communityData";

/** CSV of the filtered, exportable people. Audited before the file is returned. */
export async function GET(req: Request) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  if (!session?.login) return NextResponse.json({ error: "session has no login" }, { status: 400 });
  try {
    const sp = new URL(req.url).searchParams;
    const query = parseCommunityQuery(sp);
    const { db } = await connectToDatabase();
    const hits = (await loadCommunity(db)).filter((p) => matches(p, query));
    const now = new Date();
    await audit(db, { kind: "export", by: session.login, at: now, params: auditParams(sp), count: hits.filter(exportable).length });
    return new Response(toCsv(hits), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sdv-community-${now.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.warn("community export failed");
    return NextResponse.json({ error: "Couldn't build the export." }, { status: 500 });
  }
}
