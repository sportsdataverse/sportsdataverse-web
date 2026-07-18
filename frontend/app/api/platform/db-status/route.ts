import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { checkIngestToken, requireMemberApp } from "@lib/platform/auth";
import { listDbStatuses, upsertDbStatus } from "@lib/platform/dbStatus";
import { dbStatusSchema } from "@lib/platform/schemas";

/**
 * sdv-data droplet Postgres heartbeat. FROZEN external contract — the droplet
 * cron POSTs here with the ingest bearer token; paths/status codes must not
 * change.
 *
 * GET  -> latest snapshot per source (org member).
 * POST -> upsert a snapshot (CI bearer token or org member).
 */

export async function GET() {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  try {
    const statuses = await listDbStatuses();
    return NextResponse.json({ message: statuses, success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Query failed",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let actor: string | null = null;
  if (checkIngestToken(req.headers.get("authorization"))) {
    actor = "ci";
  } else {
    const session = await auth();
    if (session?.isOrgMember) actor = session.login ?? "unknown";
  }
  if (!actor) {
    return NextResponse.json(
      {
        message:
          "Unauthorized: provide the platform ingest bearer token or sign in as a sportsdataverse org member.",
        success: false,
      },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = dbStatusSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: parsed.error.flatten(),
        success: false,
      },
      { status: 400 }
    );
  }
  try {
    await upsertDbStatus(parsed.data, actor);
    return NextResponse.json({ message: "Status recorded", success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Upsert failed",
        success: false,
      },
      { status: 500 }
    );
  }
}
