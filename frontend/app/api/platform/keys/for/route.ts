import { forward } from "@lib/platform/orch";
import { keysApi, requireKeyDelegation } from "@lib/platform/keys-server";

/**
 * Delegated API keys: a sportsdataverse GitHub **org owner** acting on someone
 * else's key. `requireKeyDelegation` is the gate — GitHub reports the owner
 * role as `role: "admin"` on the org membership, which `lib/auth.ts` folds onto
 * the session — and it also enforces that the target is never the caller
 * themselves. Issuing or rotating your own key is `/api/platform/keys`.
 *
 * The recipient does NOT have to be an org member — that's the point: the org
 * front door is members-only, but Data API keys are how outside collaborators
 * get access.
 *
 * GET  ?login=<login>  -> that person's key metadata (never a secret)
 * POST { login }       -> mint them a read key; 409 upstream if they hold one
 *
 * Rotate and revoke live in ./rotate and ./revoke.
 */

export async function GET(req: Request) {
  const { owner, deny } = await requireKeyDelegation(
    new URL(req.url).searchParams.get("login")
  );
  if (deny) return deny;
  return forward(await keysApi(`/v1/keys/owner/${encodeURIComponent(owner)}`));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { owner, actor, deny } = await requireKeyDelegation(body.login);
  if (deny) return deny;
  return forward(
    await keysApi("/v1/keys/issue", {
      method: "POST",
      body: JSON.stringify({ owner, scopes: ["read"], issued_by: actor }),
    })
  );
}
