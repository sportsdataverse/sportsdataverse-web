/**
 * Server-side client for the SportsDataverse Data API's sdv-orch surface
 * (https://data.sportsdataverse.org /v1/pipelines, /v1/runs, /v1/limits).
 * The trigger-scoped bearer key never leaves the server — browser code goes
 * through the member-gated /api/platform/orch/* proxy handlers.
 */

const BASE = process.env.SDV_DATA_API_URL ?? "https://data.sportsdataverse.org";

export async function dataApi(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string | undefined> }
): Promise<Response> {
  const key = process.env.SDV_TRIGGER_KEY;
  if (!key) {
    return Response.json(
      { detail: "SDV_TRIGGER_KEY is not configured on this deployment" },
      { status: 503 }
    );
  }
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(init?.searchParams ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Forward a data-API response as-is (status + JSON body). */
export async function forward(res: Response): Promise<Response> {
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
