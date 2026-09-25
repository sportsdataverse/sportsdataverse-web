import { NextResponse, after } from "next/server";
import { connectToDatabase } from "@lib/mongodb";
import { auth } from "@lib/auth";
import { handleJoin } from "@lib/join";
import { ensurePeopleIndexes } from "@lib/people";
import { ensureRateLimitIndex } from "@lib/rateLimit";
import { ensurePackageIndexes } from "@lib/packageSubmission";
import { ensureStickerIndexes } from "@lib/stickers";

// Public write endpoint: no auth required to submit, rate-limited per IP inside
// handleJoin. A signed-in session is read best-effort (see the auth() call below)
// only to vouch a visitor for Discord auto-admit — it never gates the request.
// Indexes are ensured once per process; a failed attempt is retried on the next request.
let indexesReady: Promise<void> | null = null;

export async function POST(req: Request) {
  const { db } = await connectToDatabase();
  indexesReady ??= Promise.all([ensurePeopleIndexes(db), ensureRateLimitIndex(db), ensurePackageIndexes(db), ensureStickerIndexes(db)])
    .then(() => undefined)
    .catch((e) => {
      indexesReady = null;
      throw e;
    });
  await indexesReady;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const raw = await req.json().catch(() => ({}));
  // this endpoint stays public even when auth is broken or slow: a viewer we
  // can't resolve is just no viewer, never a failed join
  const session = await auth().catch(() => null);
  const viewer = session?.login
    ? { login: session.login, isOrgMember: Boolean(session.isOrgMember), isContributor: Boolean(session.isContributor) }
    : null;
  const result = await handleJoin(raw, ip, {
    db,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    tokenSecret: process.env.JOIN_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET,
    siteUrl: process.env.NEXTAUTH_URL ?? "https://www.sportsdataverse.org",
    log: (m) => console.warn(m),
    viewer,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_INVITE_CHANNEL_ID,
    // Resend calls run after the response is sent (see JoinDeps.defer's doc
    // comment in lib/join.ts): whether they fire depends on stored state, and
    // awaiting them here would leak that state through response timing.
    defer: (task) => after(task),
  });
  return NextResponse.json(result.body, { status: result.status });
}
