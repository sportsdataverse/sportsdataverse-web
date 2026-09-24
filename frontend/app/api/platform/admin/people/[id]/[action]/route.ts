import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@lib/mongodb";
import { requireAdminApp } from "@lib/platform/auth";
import { approve, decline, removePerson, requeue, resendInvite, retrySync, type ReviewDeps } from "@lib/review";

const ACTIONS = new Set(["approve", "decline", "requeue", "resend", "retry-sync", "delete"]);
type Ctx = { params: Promise<{ id: string; action: string }> };

const actionBodySchema = z.object({
  // nullable as well as optional: a caller sending `reason: null` (the old
  // cast-based code handled this via `?? ""`) must still get a clean decline,
  // not a 400 — only a genuinely wrong type (number, array, object) is rejected
  reason: z.string().trim().max(300).nullable().optional(),
  notify: z.boolean().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { session, deny } = await requireAdminApp();
  if (deny) return deny;
  // an audit trail that refuses is better than one that lies: never fabricate a reviewer identity
  if (!session?.login) {
    return NextResponse.json({ success: false, message: "session has no login" }, { status: 400 });
  }
  const { id, action } = await ctx.params;
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "unknown action" }, { status: 404 });
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "bad id" }, { status: 400 });

  const parsedBody = actionBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) return NextResponse.json({ success: false, message: "bad request body" }, { status: 400 });
  const body = parsedBody.data;

  const { db } = await connectToDatabase();
  const deps: ReviewDeps = {
    db,
    reviewer: session.login,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    discordBotToken: process.env.DISCORD_BOT_TOKEN,
    discordChannelId: process.env.DISCORD_INVITE_CHANNEL_ID,
    log: (m) => console.warn(m),
  };
  const personId = new ObjectId(id);

  // every action gets its own explicit branch — the default is a 400, never a
  // silent delete, so a future action added to ACTIONS without a matching
  // branch here fails loudly instead of destroying the record
  let result: { ok: boolean; message: string; inviteUrl?: string };
  if (action === "approve") result = await approve(deps, personId);
  else if (action === "resend") result = await resendInvite(deps, personId);
  else if (action === "decline") result = await decline(deps, personId, body.reason || "No reason given", Boolean(body.notify));
  else if (action === "requeue") result = await requeue(deps, personId);
  else if (action === "retry-sync") result = await retrySync(deps, personId);
  else if (action === "delete") result = await removePerson(deps, personId);
  else return NextResponse.json({ success: false, message: "unknown action" }, { status: 400 });

  return NextResponse.json({ success: result.ok, message: result.message, ...("inviteUrl" in result ? { inviteUrl: result.inviteUrl } : {}) });
}
