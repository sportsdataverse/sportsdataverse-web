import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { countShipped, listOpenStickerRequests } from "@lib/stickers";

/** The single place a postal address is readable, and only while unshipped. */
export async function GET() {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  try {
    const { db } = await connectToDatabase();
    const [open, shipped] = await Promise.all([listOpenStickerRequests(db), countShipped(db)]);
    return NextResponse.json(
      {
        shipped,
        requests: open.map((r) => ({
          id: String(r._id),
          name: r.name,
          address: r.address ?? null,
          createdAt: r.createdAt,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // never log the name or an address field — only that the list failed
    console.warn("sticker list failed");
    return NextResponse.json({ error: "Couldn't load sticker requests." }, { status: 500 });
  }
}
