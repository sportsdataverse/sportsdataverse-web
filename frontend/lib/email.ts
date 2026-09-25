/**
 * Resend transactional send (`POST /emails`) and the one template PR 2a needs.
 * `from` must be on a domain verified in Resend — that is what RESEND_FROM gates.
 */
export type EmailDeps = { apiKey: string | undefined; fetchImpl?: typeof fetch };

export async function sendEmail(
  msg: { from: string; to: string; subject: string; html: string; text: string },
  deps: EmailDeps
): Promise<{ id: string }> {
  if (!deps.apiKey) throw new Error("RESEND_API_KEY is not set");
  const res = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("Resend response had no email id");
  return { id: body.id };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function confirmEmail(confirmUrl: string): { subject: string; html: string; text: string } {
  const url = esc(confirmUrl);
  return {
    subject: "Confirm your SportsDataverse newsletter subscription",
    html: `<p>Thanks for signing up. Confirm your email to start receiving the newsletter — new data, methods posts, and package releases.</p>
<p><a href="${url}">Confirm subscription</a></p>
<p>If you didn't sign up, ignore this email and nothing happens. The link expires in 7 days.</p>
<p>— SportsDataverse</p>`,
    text: `Thanks for signing up. Confirm your email to start receiving the newsletter:\n\n${confirmUrl}\n\nIf you didn't sign up, ignore this email and nothing happens. The link expires in 7 days.\n\n— SportsDataverse`,
  };
}

export function discordInviteEmail(url: string): { subject: string; html: string; text: string } {
  const safe = esc(url);
  return {
    subject: "Your SportsDataverse Discord invite",
    html: `<p>You're in. This link adds you to the SportsDataverse Discord:</p>
<p><a href="${safe}">${safe}</a></p>
<p>It works for 7 days and a few uses, so don't share it around — ask us for another if someone else needs one.</p>
<p>— SportsDataverse</p>`,
    text: `You're in. This link adds you to the SportsDataverse Discord:\n\n${url}\n\nIt works for 7 days and a few uses, so don't share it around — ask us for another if someone else needs one.\n\n— SportsDataverse`,
  };
}

/** Confirms a sticker request. Deliberately does NOT repeat the address: the
 *  typed email is not verified, so echoing it would send one person's postal
 *  address to whatever inbox was typed. */
export function stickerRequestEmail(): { subject: string; html: string; text: string } {
  const body = "Got it — your sticker request is in. We mail them in batches, so it may be a few weeks. If your address changes before they ship, reply to this email and we'll update it.";
  return {
    subject: "Your SportsDataverse sticker request",
    html: `<p>${body}</p>\n<p>— SportsDataverse</p>`,
    text: `${body}\n\n— SportsDataverse`,
  };
}
