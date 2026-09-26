import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { personHistory } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400, headers: NO_STORE });
  try {
    const { db } = await connectToDatabase();
    const found = await personHistory(db, new ObjectId(id));
    if (!found) return NextResponse.json({ error: "No such person." }, { status: 404, headers: NO_STORE });
    return NextResponse.json(found, { headers: NO_STORE });
  } catch {
    console.warn(`community person ${id} failed`);
    return NextResponse.json({ error: "Couldn't load that person." }, { status: 500, headers: NO_STORE });
  }
}
