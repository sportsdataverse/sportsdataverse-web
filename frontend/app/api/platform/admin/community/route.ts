import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { aggregate, crossTab, freeValueOptions, matches, paginate, parseCommunityQuery } from "@lib/community";
import { exportable, listRow, loadCommunity } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };

/** Admin-only: every person, filtered by the allowlisted URL query (lib/community.ts). */
export async function GET(req: Request) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  try {
    const query = parseCommunityQuery(new URL(req.url).searchParams);
    const { db } = await connectToDatabase();
    const all = await loadCommunity(db);
    const hits = all.filter((p) => matches(p, query));
    const pg = paginate(hits, query.page);
    return NextResponse.json(
      {
        total: pg.total,
        page: pg.page,
        pages: pg.pages,
        exportable: hits.filter(exportable).length,
        rows: pg.rows.map(listRow),
        aggregates: aggregate(hits),
        // unfiltered, so a free-value filter (country, region, packages) never
        // hides its own other options or the active value it's applying (I1)
        options: freeValueOptions(all),
        crossTab: query.x && query.y ? crossTab(hits, query.x, query.y) : null,
      },
      { headers: NO_STORE }
    );
  } catch {
    console.warn("community list failed");
    return NextResponse.json({ error: "Couldn't load people." }, { status: 500, headers: NO_STORE });
  }
}
