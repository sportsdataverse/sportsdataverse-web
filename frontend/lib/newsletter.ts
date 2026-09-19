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

async function contactFrom(res: Response): Promise<{ contactId: string; unsubscribed: boolean }> {
  const body = (await res.json()) as { id?: unknown; unsubscribed?: unknown };
  if (typeof body.id !== "string" || !body.id) throw new Error("Resend response had no contact id");
  return { contactId: body.id, unsubscribed: body.unsubscribed === true };
}

/**
 * Create the contact, or on 409 read the existing one. An existing contact's
 * `unsubscribed` flag is reported, never reset: this form is anonymous, so
 * re-subscribing an address that opted out would let anyone undo someone
 * else's unsubscribe. The confirmed double opt-in (PR 2) is the way back in.
 */
export async function subscribeToResend(
  email: string,
  deps: ResendDeps,
  properties?: Record<string, string>
): Promise<{ contactId: string; unsubscribed: boolean }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const created = await call(deps, "/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false, ...(properties ? { properties } : {}) }),
  });
  if (created.ok) return contactFrom(created);
  if (created.status === 409) {
    const path = `/contacts/${encodeURIComponent(email)}`;
    const existing = await call(deps, path, { method: "GET" });
    if (!existing.ok) throw new Error(`Resend ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
    const contact = await contactFrom(existing);
    if (properties) {
      // a fresher profile: update properties only — never the unsubscribed flag (see above)
      const patched = await call(deps, path, { method: "PATCH", body: JSON.stringify({ properties }) });
      if (!patched.ok) throw new Error(`Resend ${patched.status}: ${(await patched.text()).slice(0, 200)}`);
    }
    return contact;
  }
  throw new Error(`Resend ${created.status}: ${(await created.text()).slice(0, 200)}`);
}
