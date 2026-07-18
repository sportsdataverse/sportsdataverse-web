import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { forward } from "@lib/platform/orch";
import { ghOwner, keysApi } from "@lib/platform/keys-server";

/**
 * Self-service API keys for the signed-in org member. The owner is ALWAYS
 * `gh:<session login>` — request input never chooses whose key is touched.
 *
 * GET  -> key metadata for the member (never includes the secret)
 * POST -> issue a first key (409 from upstream if one is already active)
 */

export async function GET() {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  if (!session.login) {
    return NextResponse.json({ message: "session has no login" }, { status: 400 });
  }
  return forward(
    await keysApi(`/v1/keys/owner/${encodeURIComponent(ghOwner(session.login))}`)
  );
}

export async function POST() {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  if (!session.login) {
    return NextResponse.json({ message: "session has no login" }, { status: 400 });
  }
  return forward(
    await keysApi("/v1/keys/issue", {
      method: "POST",
      body: JSON.stringify({ owner: ghOwner(session.login), scopes: ["read"] }),
    })
  );
}
