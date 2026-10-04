/** Statuses that must not carry a body: `Response.json()` throws for them. */
const NULL_BODY = new Set([204, 205, 304]);

/**
 * Map what Supabase reported for a view write onto a reply the runtime will accept.
 * Supabase answers a successful write with 204, and reports a failed request as status 0;
 * anything that is not a 2xx-5xx HTTP status becomes a 500.
 */
export function viewsReply(status: unknown): { status: number; hasBody: boolean } {
  const http = typeof status === "number" && status >= 200 && status <= 599 ? status : 500;
  return { status: http, hasBody: !NULL_BODY.has(http) };
}
