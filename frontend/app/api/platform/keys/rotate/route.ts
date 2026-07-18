import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { forward } from "@lib/platform/orch";
import { ghOwner, keysApi } from "@lib/platform/keys-server";

/** Rotate the member's key: every active key is revoked, a new one is minted
 *  and its plaintext returned exactly once. */
export async function POST() {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  if (!session.login) {
    return NextResponse.json({ message: "session has no login" }, { status: 400 });
  }
  return forward(
    await keysApi("/v1/keys/rotate", {
      method: "POST",
      body: JSON.stringify({ owner: ghOwner(session.login), scopes: ["read"] }),
    })
  );
}
