import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleJoin } from "@lib/join";
import { ensurePeopleIndexes } from "@lib/people";
import { ensureRateLimitIndex } from "@lib/rateLimit";

// Public write endpoint: no auth, rate-limited per IP inside handleJoin.
// Indexes are ensured once per process (idempotent on the server).
let indexesReady: Promise<void> | null = null;

export async function POST(req: Request) {
  const { db } = await connectToDatabase();
  indexesReady ??= Promise.all([ensurePeopleIndexes(db), ensureRateLimitIndex(db)]).then(() => undefined);
  await indexesReady;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const raw = await req.json().catch(() => ({}));
  const result = await handleJoin(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    log: (m) => console.warn(m),
  });
  return NextResponse.json(result.body, { status: result.status });
}
