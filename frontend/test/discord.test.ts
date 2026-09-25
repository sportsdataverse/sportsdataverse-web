import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvite, inviteUrl, INVITE_MAX_AGE_SEC, INVITE_MAX_USES } from '../lib/discord.ts';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('mints a 3-use, 7-day invite on the configured channel', async () => {
  const expires = new Date(Date.now() + INVITE_MAX_AGE_SEC * 1000).toISOString();
  const { fetchImpl, calls } = fakeFetch(200, { code: 'abc123', expires_at: expires });
  const r = await createInvite({ botToken: 'tok', channelId: '42', fetchImpl });
  assert.equal(r.code, 'abc123');
  assert.equal(r.expiresAt.toISOString(), expires);
  assert.equal(calls[0].url, 'https://discord.com/api/v10/channels/42/invites');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bot tok');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { max_uses: INVITE_MAX_USES, max_age: INVITE_MAX_AGE_SEC, unique: true });
});

test('falls back to a computed expiry when Discord omits expires_at', async () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const { fetchImpl } = fakeFetch(200, { code: 'abc123' });
  const r = await createInvite({ botToken: 'tok', channelId: '42', fetchImpl, now: () => now });
  assert.equal(r.expiresAt.getTime(), now.getTime() + INVITE_MAX_AGE_SEC * 1000);
});

test('missing configuration and Discord errors throw with a usable message', async () => {
  await assert.rejects(createInvite({ botToken: undefined, channelId: '42' }), /DISCORD_BOT_TOKEN/);
  await assert.rejects(createInvite({ botToken: 'tok', channelId: undefined }), /DISCORD_INVITE_CHANNEL_ID/);
  const denied = fakeFetch(403, { message: 'Missing Permissions', code: 50013 });
  await assert.rejects(createInvite({ botToken: 'tok', channelId: '42', fetchImpl: denied.fetchImpl }), /Discord 403/);
  const empty = fakeFetch(200, {});
  await assert.rejects(createInvite({ botToken: 'tok', channelId: '42', fetchImpl: empty.fetchImpl }), /no invite code/);
});

test('a timeout or network failure throws a labelled error like every other path', async () => {
  const boom = (async () => { throw new Error('The operation was aborted'); }) as unknown as typeof fetch;
  await assert.rejects(createInvite({ botToken: 'tok', channelId: '42', fetchImpl: boom }), /Discord request failed: The operation was aborted/);
});

test('inviteUrl builds the public join link', () => {
  assert.equal(inviteUrl('abc123'), 'https://discord.gg/abc123');
});
