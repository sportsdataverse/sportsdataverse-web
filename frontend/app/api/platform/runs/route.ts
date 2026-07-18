import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { checkIngestToken, requireMemberApp } from "@lib/platform/auth";
import { insertRun, listRuns } from "@lib/platform/runs";
import { modelRunSchema } from "@lib/platform/schemas";

/**
 * Model-run telemetry. FROZEN external contract — model-publish CI POSTs here
 * with the ingest bearer token; 201 + {id} on success.
 *
 * GET  -> run list, filters: ?model_id=&sport=&status=&limit= (org member).
 * POST -> ingest one run (org member session OR CI bearer token).
 */

export async function GET(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) ?? undefined;
  try {
    const runs = await listRuns({
      model_id: q("model_id"),
      sport: q("sport"),
      status: q("status"),
      limit: q("limit") ? Number(q("limit")) || undefined : undefined,
    });
    return NextResponse.json({ message: runs, success: true });
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
  // CI token first (no session round trip); fall back to member session.
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
  const parsed = modelRunSchema.safeParse(body ?? {});
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
    const id = await insertRun(parsed.data, actor);
    return NextResponse.json(
      { message: "Run recorded", id, success: true },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Insert failed",
        success: false,
      },
      { status: 500 }
    );
  }
}
