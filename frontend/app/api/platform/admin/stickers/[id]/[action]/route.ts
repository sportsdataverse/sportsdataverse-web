import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { cancelStickerRequest, shipStickerRequest } from "@lib/stickers";

const ACTIONS = new Set(["ship", "cancel"]);
type Ctx = { params: Promise<{ id: string; action: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  // an audit trail that refuses is better than one that lies: never fabricate who shipped it
  if (!session?.login) {
    return NextResponse.json({ success: false, message: "session has no login" }, { status: 400 });
  }
  const { id, action } = await ctx.params;
  // checked before the id or the database: the default must never fall through
  // to a destructive action
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400 });

  try {
    const { db } = await connectToDatabase();
    const _id = new ObjectId(id);
    // explicit branches; ACTIONS above already refused anything else
    if (action === "ship") {
      const ok = await shipStickerRequest(db, _id, session.login, new Date());
      return NextResponse.json({
        success: ok,
        message: ok ? "Marked shipped — the address is gone." : "Already shipped or not found.",
      });
    }
    if (action === "cancel") {
      const ok = await cancelStickerRequest(db, _id);
      return NextResponse.json({ success: ok, message: ok ? "Cancelled — the address is gone." : "Not found." });
    }
    return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
  } catch {
    // never log the name or an address field — only which action and which request
    console.warn(`sticker ${action} failed for request ${id}`);
    return NextResponse.json({ success: false, message: "Couldn't update that request — try again." }, { status: 500 });
  }
}
