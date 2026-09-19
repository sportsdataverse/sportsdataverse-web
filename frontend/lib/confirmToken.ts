import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Double opt-in link token: `base64url(personId.expiresAtMs)` + "." + HMAC-SHA256.
 * Stateless — nothing to store or revoke; confirming twice is harmless.
 */
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signConfirmToken(personId: string, secret: string, now: Date = new Date(), ttlSec = 7 * 86400): string {
  const payload = b64(`${personId}.${now.getTime() + ttlSec * 1000}`);
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyConfirmToken(
  token: string,
  secret: string,
  now: Date = new Date()
): { ok: true; personId: string } | { ok: false; reason: "malformed" | "expired" | "bad-signature" } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed" };
  const expected = mac(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  const [personId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!personId || !/^\d+$/.test(exp ?? "")) return { ok: false, reason: "malformed" };
  if (now.getTime() > Number(exp)) return { ok: false, reason: "expired" };
  return { ok: true, personId };
}
