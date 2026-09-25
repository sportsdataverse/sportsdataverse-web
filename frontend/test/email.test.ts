import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, confirmEmail, stickerRequestEmail } from '../lib/email.ts';
import { FOLLOW_LINKS, KOFI_URL, PAYPAL_URL, DO_REFERRAL_URL, CONTACT_EMAIL } from '../content/links.ts';

test('sendEmail posts to Resend /emails with the bearer key and returns the id', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await sendEmail({ from: 'SDV <news@sportsdataverse.org>', to: 'a@b.co', subject: 'Hi', html: '<p>x</p>', text: 'x' }, { apiKey: 're', fetchImpl });
  assert.deepEqual(r, { id: 'em-1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { from: 'SDV <news@sportsdataverse.org>', to: ['a@b.co'], subject: 'Hi', html: '<p>x</p>', text: 'x' });
});

test('sendEmail throws on a missing key or a non-2xx', async () => {
  await assert.rejects(sendEmail({ from: 'a', to: 'b', subject: 's', html: 'h', text: 't' }, { apiKey: undefined }), /RESEND_API_KEY/);
  const f = (async () => new Response('{"message":"nope"}', { status: 403 })) as typeof fetch;
  await assert.rejects(sendEmail({ from: 'a', to: 'b', subject: 's', html: 'h', text: 't' }, { apiKey: 'k', fetchImpl: f }), /Resend 403/);
});

test('confirmEmail carries the link in both bodies', () => {
  const e = confirmEmail('https://www.sportsdataverse.org/api/join/confirm?t=abc.def');
  assert.match(e.subject, /confirm/i);
  assert.ok(e.html.includes('https://www.sportsdataverse.org/api/join/confirm?t=abc.def'));
  assert.ok(e.text.includes('https://www.sportsdataverse.org/api/join/confirm?t=abc.def'));
});

test('stickerRequestEmail warns a stranger who never asked, and links follow + support from one source', () => {
  const e = stickerRequestEmail();
  // There is no reply-to on this email (sendEmail sets none); every instruction
  // points at CONTACT_EMAIL instead — a mailto link in html, the bare address in text.
  assert.match(e.html, new RegExp(`Write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we'll cancel the request`), 'html carries the unrequested-stranger warning as a mailto link');
  assert.match(e.text, new RegExp(`Write to ${CONTACT_EMAIL} and we'll cancel the request`), 'text carries the unrequested-stranger warning as the bare address');
  assert.doesNotMatch(e.html, /[Rr]eply/, 'no "reply" instruction remains — sendEmail sets no reply_to');
  assert.doesNotMatch(e.text, /[Rr]eply/, 'no "reply" instruction remains — sendEmail sets no reply_to');
  for (const l of FOLLOW_LINKS) {
    assert.ok(e.html.includes(l.href), `html missing follow link ${l.href}`);
    assert.ok(e.text.includes(l.href), `text missing follow link ${l.href}`);
  }
  for (const url of [KOFI_URL, DO_REFERRAL_URL, PAYPAL_URL]) {
    assert.ok(e.html.includes(url), `html missing support link ${url}`);
    assert.ok(e.text.includes(url), `text missing support link ${url}`);
  }
});
