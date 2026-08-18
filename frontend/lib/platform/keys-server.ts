/**
 * Server-side client for the Data API's self-service key routes. Uses the
 * admin-scoped key (SDV_KEYS_ADMIN_KEY) — a bigger hammer than the trigger
 * key, so it gets its own helper.
 *
 * Two call sites, two identity rules:
 *   - self-service (`/api/platform/keys`) derives the owner from the caller's
 *     own session and never reads it from request input;
 *   - delegated issuance (`/api/platform/keys/for`) takes a login from input,
 *     which is why it is gated on the GitHub org-owner role, validates the
 *     login shape here, and stamps `issued_by` with the acting owner.
 */

const BASE = process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";

export function ghOwner(login: string): string {
  return `gh:${login}`;
}

/**
 * GitHub login rules: 1–39 chars, alphanumeric or single interior hyphens.
 * Accepts the shapes a human is likely to paste (`@login`, `gh:login`,
 * surrounding space) and returns the bare login, or null if it can't be one.
 */
export function normalizeLogin(input: string): string | null {
  const login = input.trim().replace(/^@/, "").replace(/^gh:/i, "").trim();
  const valid = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(login);
  return valid ? login : null;
}

/** Whether two GitHub logins name the same account (logins are case-insensitive). */
export function sameLogin(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function keysApi(path: string, init?: RequestInit): Promise<Response> {
  const key = process.env.SDV_KEYS_ADMIN_KEY;
  if (!key) {
    return Response.json(
      { detail: "SDV_KEYS_ADMIN_KEY is not configured on this deployment" },
      { status: 503 }
    );
  }
  return fetch(new URL(path, BASE), {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}
