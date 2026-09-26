import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireMemberApp } from "@lib/platform/auth";
import { listPeople, listUnsyncedNewsletter } from "@lib/people";
import { peopleViewFilter, personRow } from "@lib/peopleRow";

// Same cap every view uses to fetch, and the same filter each view's query
// applies — kept alongside listPeople/listUnsyncedNewsletter (lib/people.ts)
// so `total` always describes the same population the rows come from.
const FETCH_CAP = 200;

export async function GET(req: Request) {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  // Same admin check the /platform/admin layout uses (lib/platform/auth.ts's
  // requireAdminApp). C1: a non-admin's "all" view is narrowed to Discord
  // requesters — see peopleViewFilter.
  const isAdmin = session.role === "admin";
  const view = new URL(req.url).searchParams.get("view") ?? "queue";
  const { db } = await connectToDatabase();
  const [people, total] = await Promise.all([
    view === "unsynced"
      ? listUnsyncedNewsletter(db, FETCH_CAP)
      : view === "all"
        ? listPeople(db, { wantsDiscord: isAdmin ? undefined : true, limit: FETCH_CAP })
        : listPeople(db, { status: "pending", wantsDiscord: true, limit: FETCH_CAP }),
    db.collection("people").countDocuments(peopleViewFilter(view, isAdmin)),
  ]);
  return NextResponse.json({ people: people.map(personRow), total });
}
