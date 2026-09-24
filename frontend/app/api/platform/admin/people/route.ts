import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { listPeople, listUnsyncedNewsletter, type PersonDoc } from "@lib/people";

/** The review queue. Admin-only: the admin layout gates the page the same way. */
function row(p: PersonDoc) {
  const n = p.newsletter;
  const newsletterState = !n ? "none" : "resendContactId" in n ? "synced" : "pending" in n ? "pending" : "skipped";
  return {
    id: String(p._id),
    email: p.email ?? null,
    name: p.name ?? null,
    githubLogin: p.githubLogin ?? null,
    status: p.status,
    wantsDiscord: Boolean(p.wants?.discord),
    wantsNewsletter: Boolean(p.wants?.newsletter),
    newsletterState,
    discordCode: p.discord?.code ?? null,
    createdAt: p.createdAt,
    reviewedBy: p.reviewedBy ?? null,
    declineReason: p.declineReason ?? null,
  };
}

export async function GET(req: Request) {
  const { deny } = await requireAdminApp();
  if (deny) return deny;
  const view = new URL(req.url).searchParams.get("view") ?? "queue";
  const { db } = await connectToDatabase();
  const people =
    view === "unsynced"
      ? await listUnsyncedNewsletter(db)
      : view === "all"
        ? await listPeople(db, { limit: 200 })
        : await listPeople(db, { status: "pending", wantsDiscord: true });
  return NextResponse.json({ people: people.map(row) });
}
