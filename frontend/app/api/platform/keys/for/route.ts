import { NextResponse } from "next/server";
import { requireAdminApp } from "@lib/platform/auth";
import { forward } from "@lib/platform/orch";
import { ghOwner, keysApi, normalizeLogin, sameLogin } from "@lib/platform/keys-server";

/**
 * Delegated API keys: a sportsdataverse GitHub **org owner** issues a Data API
 * key for someone else. `requireAdminApp` is that gate — GitHub reports the
 * owner role as `role: "admin"` on the org membership, which `lib/auth.ts`
 * folds onto the session.
 *
 * Unlike `/api/platform/keys`, the owner here comes from request input, so:
 *   - the login is validated against GitHub's login grammar before it becomes
 *     an owner string, and
 *   - it may never be the caller's own login. Issuing to yourself is the
 *     self-service route's job; keeping the two apart means a delegated mint
 *     always has a second party in it, and the `issued_by` stamped on the row
 *     is always someone other than the key's owner.
 *
 * The recipient does NOT have to be an org member — that's the point: the org
 * front door is members-only, but Data API keys are how outside collaborators
 * get access.
 *
 * GET  ?login=<login>  -> that person's key metadata (never a secret)
 * POST { login }       -> mint them a read key; 409 upstream if they hold one
 */

type Guard =
  | { login: string; owner: string; actor: string; deny: null }
  | { login: null; owner: null; actor: null; deny: NextResponse };

/** Org-owner gate + login validation + the not-yourself rule, in one place. */
async function guard(raw: string | null): Promise<Guard> {
  const denied = (message: string, status: number): Guard => ({
    login: null,
    owner: null,
    actor: null,
    deny: NextResponse.json({ message, success: false }, { status }),
  });

  const { session, deny } = await requireAdminApp();
  if (deny) return { login: null, owner: null, actor: null, deny };
  if (!session?.login) return denied("session has no login", 400);

  const login = normalizeLogin(raw ?? "");
  if (!login) {
    return denied(
      "Give a GitHub login (letters, digits and single hyphens, up to 39 characters).",
      422
    );
  }
  if (sameLogin(login, session.login)) {
    return denied(
      "Owners issue keys for other people here — use your own API key page to issue your own.",
      403
    );
  }
  return { login, owner: ghOwner(login), actor: ghOwner(session.login), deny: null };
}

export async function GET(req: Request) {
  const { owner, deny } = await guard(new URL(req.url).searchParams.get("login"));
  if (deny) return deny;
  return forward(await keysApi(`/v1/keys/owner/${encodeURIComponent(owner)}`));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { owner, actor, deny } = await guard(
    typeof body.login === "string" ? body.login : null
  );
  if (deny) return deny;
  return forward(
    await keysApi("/v1/keys/issue", {
      method: "POST",
      body: JSON.stringify({ owner, scopes: ["read"], issued_by: actor }),
    })
  );
}
