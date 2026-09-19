import { NextResponse } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { handleSurvey } from "@lib/join";
import { ensurePeopleIndexes } from "@lib/people";
import { ensureRateLimitIndex } from "@lib/rateLimit";

let indexesReady: Promise<void> | null = null;

/** Anonymous questionnaire: no auth, no email, rate-limited per IP inside handleSurvey. */
export async function POST(req: Request) {
  const { db } = await connectToDatabase();
  indexesReady ??= Promise.all([ensurePeopleIndexes(db), ensureRateLimitIndex(db)])
    .then(() => undefined)
    .catch((e) => { indexesReady = null; throw e; });
  await indexesReady;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const raw = await req.json().catch(() => ({}));
  const result = await handleSurvey(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    siteUrl: process.env.NEXTAUTH_URL ?? "https://www.sportsdataverse.org",
    log: (m) => console.warn(m),
  });
  return NextResponse.json(result.body, { status: result.status });
}
