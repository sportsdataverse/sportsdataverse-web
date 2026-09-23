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
  log?: (msg: string) => void;
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
 * `unsubscribed` flag is reported, never reset — UNLESS `opts.resubscribe` is
 * set: only the confirm step of double opt-in passes that, since a confirmed
 * click is proof of ownership; the anonymous form itself must not let anyone
 * undo someone else's unsubscribe.
 *
 * If Resend rejects the create because of the `properties` themselves (the
 * error names a property — e.g. a key that was never registered), retry once
 * without them so a config gap never loses the subscriber. Other 4xx answers
 * (auth, rate limit, a bad address) are NOT retried: a second attempt would
 * fail the same way, or worse succeed while silently dropping the profile.
 */
export async function subscribeToResend(
  email: string,
  deps: ResendDeps,
  properties?: Record<string, string>,
  opts?: { resubscribe?: boolean }
): Promise<{ contactId: string; unsubscribed: boolean }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const created = await call(deps, "/contacts", {
    method: "POST",
    body: JSON.stringify({ email, unsubscribed: false, ...(properties ? { properties } : {}) }),
  });
  if (created.ok) return contactFrom(created);
  // a Response body can only be read once; everything below needs it
  const failed = await created.text();
  if (created.status === 409) {
    const path = `/contacts/${encodeURIComponent(email)}`;
    const existing = await call(deps, path, { method: "GET" });
    if (!existing.ok) throw new Error(`Resend ${existing.status}: ${(await existing.text()).slice(0, 200)}`);
    const contact = await contactFrom(existing);
    if (opts?.resubscribe) {
      const patched = await call(deps, path, {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed: false, ...(properties ? { properties } : {}) }),
      });
      if (!patched.ok) throw new Error(`Resend ${patched.status}: ${(await patched.text()).slice(0, 200)}`);
      return { contactId: contact.contactId, unsubscribed: false };
    }
    if (properties) {
      // a fresher profile: update properties only — never the unsubscribed flag (see above)
      const patched = await call(deps, path, { method: "PATCH", body: JSON.stringify({ properties }) });
      if (!patched.ok) throw new Error(`Resend ${patched.status}: ${(await patched.text()).slice(0, 200)}`);
    }
    return contact;
  }
  if (created.status >= 400 && created.status < 500 && properties && /propert/i.test(failed)) {
    const retry = await call(deps, "/contacts", { method: "POST", body: JSON.stringify({ email, unsubscribed: false }) });
    if (retry.ok) {
      // no address in the log line: server logs outlive their usefulness and this is personal data
      deps.log?.(`Resend rejected contact properties (${created.status}); retried without them`);
      return contactFrom(retry);
    }
  }
  throw new Error(`Resend ${created.status}: ${failed.slice(0, 200)}`);
}
