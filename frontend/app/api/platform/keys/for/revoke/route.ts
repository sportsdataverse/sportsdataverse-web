import { NextResponse } from "next/server";
import { forward } from "@lib/platform/orch";
import { keysApi, requireKeyDelegation } from "@lib/platform/keys-server";

/**
 * Revoke one of someone else's keys, leaving them with none until they issue a
 * new one themselves. Nothing is minted here, so nothing is revealed.
 *
 * Both the `key_id` and the owner it must belong to go upstream: a bare id is
 * not proof of whose key it is, and `api.api_keys` also holds the platform's
 * own credentials. The Data API rejects a mismatch (404) and refuses
 * `write`/`admin` keys outright (403), so this cannot disable the very key the
 * proxy authenticates with.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { owner, actor, deny } = await requireKeyDelegation(body.login);
  if (deny) return deny;
  const keyId = typeof body.key_id === "string" ? body.key_id.trim() : "";
  if (!keyId) {
    return NextResponse.json(
      { message: "key_id is required", success: false },
      { status: 422 }
    );
  }
  return forward(
    await keysApi("/v1/keys/revoke", {
      method: "POST",
      body: JSON.stringify({ key_id: keyId, owner, revoked_by: actor }),
    })
  );
}
