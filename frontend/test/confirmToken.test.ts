import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signConfirmToken, verifyConfirmToken } from '../lib/confirmToken.ts';

const T0 = new Date('2026-09-19T12:00:00Z');
const SECRET = 's3cret';

test('round-trips a person id and rejects tampering, wrong secret, and expiry', () => {
  const t = signConfirmToken('66f0aaaaaaaaaaaaaaaaaaaa', SECRET, T0);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // base64url payload . base64url mac
  assert.deepEqual(verifyConfirmToken(t, SECRET, T0), { ok: true, personId: '66f0aaaaaaaaaaaaaaaaaaaa' });
  assert.deepEqual(verifyConfirmToken(t, 'other', T0), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(verifyConfirmToken(t + 'x', SECRET, T0), { ok: false, reason: 'bad-signature' });
  assert.deepEqual(verifyConfirmToken('nope', SECRET, T0), { ok: false, reason: 'malformed' });
  const later = new Date(T0.getTime() + 8 * 86400 * 1000);
  assert.deepEqual(verifyConfirmToken(t, SECRET, later), { ok: false, reason: 'expired' });
});
