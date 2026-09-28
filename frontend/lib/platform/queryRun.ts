/** One `GET /v1/{schema}/{table}` through the member-gated /api/platform/query/run
 *  proxy (the Query page's call shape): the rows, or the API's error message. */
export async function apiRows(params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/platform/query/run?${new URLSearchParams(params)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { data: Record<string, unknown>[] }).data;
}
