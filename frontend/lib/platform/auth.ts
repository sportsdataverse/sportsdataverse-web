import { timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@lib/auth";

/**
 * Auth helpers for the members-only /platform area.
 *
 * The whole platform (pages AND api routes, including GETs) is private to
 * active sportsdataverse org members — unlike /api/packages where GET is
 * public. The one exception is run ingest, which also accepts the CI bearer
 * token (see `checkIngestToken`).
 */

export type PlatformSessionProps = {
  authorized: boolean;
  signedIn: boolean;
  login: string | null;
};

/** Page-side gate for legacy Pages-Router pages (removed with them). */
export async function getPlatformSessionProps(
  ctx: GetServerSidePropsContext
): Promise<PlatformSessionProps> {
  const session = await auth(ctx);
  return {
    authorized: Boolean(session?.isOrgMember),
    signedIn: Boolean(session),
    login: session?.login ?? null,
  };
}

/**
 * Pages-API gate: returns the acting login, or responds 401 and returns null.
 * Callers must `return` immediately when null. (Legacy — App Router handlers
 * use `requireMemberApp` instead.)
 */
export async function requireMember(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const session = await auth(req, res);
  if (!session?.isOrgMember) {
    res.status(401).json({
      message:
        "Unauthorized: sign in with a sportsdataverse GitHub org account to use the platform.",
      success: false,
    });
    return null;
  }
  return session.login ?? "unknown";
}

/**
 * Server-component gate for /platform pages: the session when the viewer is an
 * active org member (the platform layout's rule), else null.
 *
 * The layout's <SignInGate/> does not stop a page's own server reads: App
 * Router renders a layout and its page in parallel and ships the page's output
 * in the RSC payload even when the layout never displays it. So every async
 * page starts with `if (!(await requireOrgMember())) return null;`, before any
 * read (test/platformPageGuard.test.ts). `generateMetadata` may use only route
 * params; one that reads data is guarded too and returns a generic title signed
 * out (runs/[id]), since link unfurls are always signed out.
 */
export async function requireOrgMember(): Promise<Session | null> {
  const session = await auth();
  return session?.isOrgMember ? session : null;
}

/**
 * Route-handler gate: `const { session, deny } = await requireMemberApp();
 * if (deny) return deny;` — deny is a ready 401 JSON response.
 */
export async function requireMemberApp(): Promise<
  | { session: Session; deny: null }
  | { session: null; deny: NextResponse }
> {
  const session = await requireOrgMember();
  if (!session) {
    return {
      session: null,
      deny: NextResponse.json(
        {
          message:
            "Unauthorized: sign in with a sportsdataverse GitHub org account to use the platform.",
          success: false,
        },
        { status: 401 }
      ),
    };
  }
  return { session, deny: null };
}

/**
 * Route-handler gate for /platform/admin: org member with the admin role.
 * Mirrors `requireMemberApp`'s `{ session, deny }` shape.
 */
export async function requireAdminApp(): Promise<{
  session: (Session & { login?: string | null }) | null;
  deny: NextResponse | null;
}> {
  const { session, deny } = await requireMemberApp();
  if (deny) return { session, deny };
  if (session.role !== "admin") {
    return {
      session,
      deny: NextResponse.json(
        { message: "Admin role required.", success: false },
        { status: 403 }
      ),
    };
  }
  return { session, deny: null };
}

/**
 * CI ingest auth: `Authorization: Bearer <PLATFORM_INGEST_TOKEN>`.
 * Fails closed when the env var is unset. Timing-safe comparison.
 * Accepts the raw Authorization header value so both Pages API routes
 * (`req.headers.authorization`) and route handlers
 * (`req.headers.get("authorization")`) can use it.
 */
/** Guards the admin/ingest proxies against sending a bearer key to a
 *  plaintext endpoint — BASE can come from an env var, so don't trust it. */
export function isHttpsBase(base: string): boolean {
  try {
    return new URL(base).protocol === "https:";
  } catch {
    return false;
  }
}

export function checkIngestToken(header: string | null | undefined): boolean {
  const expected = process.env.PLATFORM_INGEST_TOKEN;
  if (!expected) return false;
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
