import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

/** The GitHub organization whose members may manage package entries. */
export const SDV_ORG = "sportsdataverse";

/**
 * How long a cached org-membership decision stays trusted on the JWT before we
 * re-validate against GitHub. Bounds how long a user who was removed from the
 * org keeps write access (instead of only losing it when the JWT expires).
 */
const MEMBERSHIP_TTL_MS = 30 * 60 * 1000; // 30 minutes

type OrgMembership = { state?: string; role?: string };

/**
 * Determine whether the signed-in user is an active member of the SDV org,
 * using the user's *own* OAuth token (scope `read:org`). This endpoint returns
 * the caller's membership — including private memberships — so no separate
 * server PAT is required.
 *
 * Fails closed: any non-200 / network error yields `{ isMember: false }`.
 */
async function fetchOrgMembership(
  accessToken: string
): Promise<{ isMember: boolean; role: "admin" | "member" | null }> {
  try {
    const res = await fetch(
      `https://api.github.com/user/memberships/orgs/${SDV_ORG}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return { isMember: false, role: null };
    const data = (await res.json()) as OrgMembership;
    const isMember = data.state === "active";
    const role =
      data.role === "admin" ? "admin" : data.role === "member" ? "member" : null;
    return { isMember, role: isMember ? role : null };
  } catch {
    return { isMember: false, role: null };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      // `read:org` lets us read the caller's org membership; `read:user`
      // gives us the profile (login).
      authorization: { params: { scope: "read:user read:org" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // `account` is only present on the initial sign-in, when the freshly
      // issued access token is available — capture it (and the login) then.
      if (account?.access_token) {
        token.accessToken = account.access_token;
        const login = (profile as { login?: string } | null)?.login;
        if (login) token.login = login;
      }
      // Resolve membership on sign-in and re-validate periodically thereafter,
      // so revoking a user's org membership revokes their write access within
      // MEMBERSHIP_TTL_MS rather than only at JWT expiry.
      const isInitialSignIn = Boolean(account?.access_token);
      const isStale =
        typeof token.membershipCheckedAt !== "number" ||
        Date.now() - token.membershipCheckedAt > MEMBERSHIP_TTL_MS;
      if (token.accessToken && (isInitialSignIn || isStale)) {
        const { isMember, role } = await fetchOrgMembership(token.accessToken);
        token.isOrgMember = isMember;
        token.role = role;
        token.membershipCheckedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      session.login = token.login;
      session.isOrgMember = token.isOrgMember ?? false;
      session.role = token.role ?? null;
      // Deliberately NOT exposing token.accessToken to the client session.
      return session;
    },
  },
};
