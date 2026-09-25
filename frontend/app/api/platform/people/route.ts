import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { requireMemberApp } from "@lib/platform/auth";
import { listPeople, listUnsyncedNewsletter } from "@lib/people";
import { personRow } from "@lib/peopleRow";

// Same cap every view uses to fetch, and the same filter each view's query
// applies — kept alongside listPeople/listUnsyncedNewsletter (lib/people.ts)
// so `total` always describes the same population the rows come from.
const FETCH_CAP = 200;

function filterFor(view: string): Record<string, unknown> {
  if (view === "unsynced") return { "wants.newsletter": true, "newsletter.resendContactId": { $exists: false } };
  if (view === "all") return {};
  return { status: "pending", "wants.discord": true };
}

export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const view = new URL(req.url).searchParams.get("view") ?? "queue";
  const { db } = await connectToDatabase();
  const [people, total] = await Promise.all([
    view === "unsynced"
      ? listUnsyncedNewsletter(db, FETCH_CAP)
      : view === "all"
        ? listPeople(db, { limit: FETCH_CAP })
        : listPeople(db, { status: "pending", wantsDiscord: true, limit: FETCH_CAP }),
    db.collection("people").countDocuments(filterFor(view)),
  ]);
  return NextResponse.json({ people: people.map(personRow), total });
}
