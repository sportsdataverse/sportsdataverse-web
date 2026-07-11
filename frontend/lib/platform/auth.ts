import { timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@lib/auth";

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

/** Page-side gate: resolve session → props consumed by PlatformShell. */
export async function getPlatformSessionProps(
  ctx: GetServerSidePropsContext
): Promise<PlatformSessionProps> {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  return {
    authorized: Boolean(session?.isOrgMember),
    signedIn: Boolean(session),
    login: session?.login ?? null,
  };
}

/**
 * API-side gate: returns the acting login, or responds 401 and returns null.
 * Callers must `return` immediately when null.
 */
export async function requireMember(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions);
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
 * CI ingest auth: `Authorization: Bearer <PLATFORM_INGEST_TOKEN>`.
 * Fails closed when the env var is unset. Timing-safe comparison.
 */
export function checkIngestToken(req: NextApiRequest): boolean {
  const expected = process.env.PLATFORM_INGEST_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice("Bearer ".length);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
