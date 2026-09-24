import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { approve, decline, removePerson, resendInvite, retrySync, type ReviewDeps } from "@lib/review";

const ACTIONS = new Set(["approve", "decline", "resend", "retry-sync", "delete"]);
type Ctx = { params: Promise<{ id: string; action: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  const { id, action } = await ctx.params;
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400 });

  const { db } = await connectToDatabase();
  const deps: ReviewDeps = {
    db,
    reviewer: session?.login ?? "admin",
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_INVITE_CHANNEL_ID,
    log: (m) => console.warn(m),
  };
  const personId = new ObjectId(id);
  const body = (await req.json().catch(() => ({}))) as { reason?: string; notify?: boolean };

  const result =
    action === "approve" ? await approve(deps, personId)
    : action === "resend" ? await resendInvite(deps, personId)
    : action === "decline" ? await decline(deps, personId, (body.reason ?? "").slice(0, 300) || "No reason given", Boolean(body.notify))
    : action === "retry-sync" ? await retrySync(deps, personId)
    : await removePerson(deps, personId);

  return NextResponse.json({ success: result.ok, message: result.message, ...("inviteUrl" in result ? { inviteUrl: result.inviteUrl } : {}) });
}
