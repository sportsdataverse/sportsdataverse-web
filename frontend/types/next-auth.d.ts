import "next-auth";
import "next-auth/jwt";

/**
 * Module augmentation so the SportsDataverse org-membership signals we attach
 * in the NextAuth callbacks are visible on `Session` (client + server) and the
 * `JWT` (server only).
 *
 * NOTE: this file lives under `types/` (not the repo root) on purpose — with
 * `baseUrl: "."`, a root file named `next-auth.d.ts` would be resolved as the
 * `next-auth` package itself and the augmentation would silently fail to merge.
 */
declare module "next-auth" {
  interface Session {
    /** GitHub login (handle) of the signed-in user. */
    login?: string;
    /** True when the user is an active member of the sportsdataverse org. */
    isOrgMember?: boolean;
    /** Org role, when a member: "admin" | "member". */
    role?: "admin" | "member" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    login?: string;
    isOrgMember?: boolean;
    role?: "admin" | "member" | null;
    /** GitHub OAuth access token — kept on the JWT only, never on the client session. */
    accessToken?: string;
  }
}
