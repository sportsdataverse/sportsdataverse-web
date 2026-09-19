/**
 * Resend Contacts client — the newsletter SENDER. The list of record is the
 * Mongo `people` collection (lib/people.ts); this only mirrors an email into
 * Resend so Broadcasts can reach it. Resend puts no badge in the mail at any
 * tier, which is why it was picked. Docs:
 * https://resend.com/docs/api-reference/contacts/create-contact
 */
const RESEND = "https://api.resend.com";

export type ResendDeps = {
  apiKey: string | undefined; // process.env.RESEND_API_KEY (server-only)
  fetchImpl?: typeof fetch; // injected in tests
};

async function call(deps: ResendDeps, path: string, init: RequestInit): Promise<Response> {
  return (deps.fetchImpl ?? fetch)(`${RESEND}${path}`, {
    ...init,
    headers: { "content-type": "application/json", Authorization: `Bearer ${deps.apiKey}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
}

async function idFrom(res: Response): Promise<string> {
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) throw new Error("Resend response had no contact id");
  return body.id;
}

export async function subscribeToResend(
  email: string,
  deps: ResendDeps
): Promise<{ contactId: string }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const created = await call(deps, "/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  if (created.ok) return { contactId: await idFrom(created) };
  if (created.status === 409) {
    // already a contact: fetch it so the person record can hold the id
    const existing = await call(deps, `/contacts/${encodeURIComponent(email)}`, { method: "GET" });
    if (!existing.ok) throw new Error(`Resend ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
    return { contactId: await idFrom(existing) };
  }
  throw new Error(`Resend ${created.status}: ${(await created.text()).slice(0, 200)}`);
}
