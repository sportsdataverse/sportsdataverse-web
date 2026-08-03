import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";

const BASE = process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";

/** Forwards platform beacon batches to the Data API ingest (fail-open). */
export async function POST(req: Request) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;

  const key = process.env.SDV_INGEST_KEY;
  if (!key) return NextResponse.json({ success: false }, { status: 503 });

  try {
    const body = await req.text();
    await fetch(`${BASE}/v1/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-SDV-Ingest-Key": key,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* fail-open: never surface ingest failures to the client */
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
