import { NextResponse } from "next/server";
import type { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { countShipped, listOpenStickerRequests } from "@lib/stickers";

/** The single place a postal address is readable, and only while unshipped. */
export async function GET() {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  try {
    // connectToDatabase's cache is untyped (lib/mongodb.ts), so `db` needs an
    // explicit annotation here to let the generic collection<...>() call below
    // typecheck instead of resolving to an implicit-any chain.
    const { db }: { db: Db } = await connectToDatabase();
    const [open, shipped] = await Promise.all([listOpenStickerRequests(db), countShipped(db)]);
    // Emails, looked up by the requesters' person ids, in ONE query — so an admin
    // who is written to can match the message to a row. null means the person no
    // longer exists (the delete-race orphan case), and the admin should see that.
    const ids = open.map((r) => r.personId);
    const people = await db
      .collection<{ _id: ObjectId; email?: string }>("people")
      .find({ _id: { $in: ids } }, { projection: { email: 1 } })
      .toArray();
    const emailByPersonId = new Map(people.map((p) => [String(p._id), p.email ?? null]));
    return NextResponse.json(
      {
        shipped,
        requests: open.map((r) => ({
          id: String(r._id),
          name: r.name,
          email: emailByPersonId.get(String(r.personId)) ?? null,
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
