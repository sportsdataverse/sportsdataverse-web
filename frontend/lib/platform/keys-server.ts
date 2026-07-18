/**
 * Server-side client for the Data API's self-service key routes. Uses the
 * admin-scoped key (SDV_KEYS_ADMIN_KEY) — a bigger hammer than the trigger
 * key, so it gets its own helper and is only ever called with an owner
 * derived from the caller's session (`gh:<login>`), never from request input.
 */

const BASE = process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";

export function ghOwner(login: string): string {
  return `gh:${login}`;
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
