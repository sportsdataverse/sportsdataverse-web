import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { setDoNotContact } from "@lib/communityData";

const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ on: z.boolean() });

export async function POST(req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  // the audit trail names who did it; never fabricate one
  if (!session?.login) return NextResponse.json({ success: false, message: "session has no login" }, { status: 400, headers: NO_STORE });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400, headers: NO_STORE });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, message: "bad request body" }, { status: 400, headers: NO_STORE });
  try {
    const { db } = await connectToDatabase();
    const ok = await setDoNotContact(db, new ObjectId(id), parsed.data.on, session.login, new Date());
    return NextResponse.json(
      { success: ok, message: ok ? (parsed.data.on ? "Marked do-not-contact — left out of every export." : "Contactable again.") : "No such person." },
      { status: ok ? 200 : 404, headers: NO_STORE }
    );
  } catch {
    console.warn(`do-not-contact failed for person ${id}`);
    return NextResponse.json({ success: false, message: "Couldn't update — try again." }, { status: 500, headers: NO_STORE });
  }
}
