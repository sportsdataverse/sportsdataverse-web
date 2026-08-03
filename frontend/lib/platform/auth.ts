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
 * Route-handler gate: `const { session, deny } = await requireMemberApp();
 * if (deny) return deny;` — deny is a ready 401 JSON response.
 */
export async function requireMemberApp(): Promise<
  | { session: Session; deny: null }
  | { session: null; deny: NextResponse }
> {
  const session = await auth();
  if (!session?.isOrgMember) {
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
export function checkIngestToken(header: string | null | undefined): boolean {
  const expected = process.env.PLATFORM_INGEST_TOKEN;
  if (!expected) return false;
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
