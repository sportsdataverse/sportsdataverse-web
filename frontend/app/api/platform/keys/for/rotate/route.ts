import { forward } from "@lib/platform/orch";
import { keysApi, requireKeyDelegation } from "@lib/platform/keys-server";

/**
 * Rotate someone else's key: every active key they hold is revoked and one
 * fresh secret is minted, returned here exactly once.
 *
 * This is the "they lost their key and can't sign in to rotate it themselves"
 * path, so it hands the plaintext to the *org owner*, who has to pass it on —
 * which is why the reveal UI tells them to send it privately and keep no copy.
 * The recipient's old credential stops working the moment this returns.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { owner, actor, deny } = await requireKeyDelegation(body.login);
  if (deny) return deny;
  return forward(
    await keysApi("/v1/keys/rotate", {
      method: "POST",
      body: JSON.stringify({ owner, scopes: ["read"], issued_by: actor }),
    })
  );
}
