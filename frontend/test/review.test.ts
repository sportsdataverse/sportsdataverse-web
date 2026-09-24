import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertJoin, recordDiscordInvite, findPersonById } from '../lib/people.ts';
import { approve, decline, resendInvite, retrySync, removePerson } from '../lib/review.ts';

const T0 = new Date('2026-09-24T12:00:00Z');
const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'email' } as const;

async function queued(db: ReturnType<typeof fakeDb>['db'], wants = { newsletter: false, discord: true }) {
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE as never, wants }, T0);
  return personId;
}
function fakeNet(discordStatus = 200, emailStatus = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url); calls.push(u);
    if (u.includes('discord.com')) return new Response(JSON.stringify({ code: 'inv123' }), { status: discordStatus, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/emails')) return new Response(JSON.stringify({ id: 'em-1' }), { status: emailStatus, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const env = { discordBotToken: 'tok', discordChannelId: '42', resendApiKey: 'k', reviewer: 'saiemgilani', now: () => T0 };

test('approve mints an invite, stores it, emails it, and stamps the reviewer', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await approve({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(r.emailed, true);
  const [p] = dump('people');
  assert.equal(p.status, 'approved');
  assert.equal(p.reviewedBy, 'saiemgilani');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('no sender configured still mints and stores the invite', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal(r.emailed, false);
  assert.match(r.message, /send it yourself/i);
  assert.equal((dump('people')[0].discord as { code: string }).code, 'inv123');
  assert.equal(net.calls.filter((u) => u.endsWith('/emails')).length, 0);
});

test('approve survives a Discord failure: the decision stands, the invite does not', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet(403);
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /Discord 403/);
  assert.equal(dump('people')[0].status, 'approved', 'the reviewer decision is recorded regardless');
  assert.equal(dump('people')[0].discord, undefined);
});

test('approving twice reuses the stored invite instead of minting another', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  const again = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(again.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1, 'only one mint');
});

test('an expired stored invite is replaced on resend', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  await recordDiscordInvite(db, id, { code: 'old', expiresAt: new Date(T0.getTime() - 1000) }, T0);
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1);
});

test('decline records the reason and only emails when asked', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const quiet = fakeNet();
  await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: quiet.fetchImpl }, id, 'no vouch', false);
  assert.equal(dump('people')[0].status, 'declined');
  assert.equal(dump('people')[0].declineReason, 'no vouch');
  assert.equal(quiet.calls.filter((u) => u.endsWith('/emails')).length, 0);
  const loud = fakeNet();
  await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: loud.fetchImpl }, id, 'no vouch', true);
  assert.equal(loud.calls.filter((u) => u.endsWith('/emails')).length, 1);
});

test('retrySync creates the missing Resend contact; removePerson erases the record', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.equal((dump('people')[0].newsletter as { resendContactId: string }).resendContactId, 'c-1');
  assert.equal((await removePerson({ db, ...env, fetchImpl: net.fetchImpl }, id)).ok, true);
  assert.equal(dump('people').length, 0);
  assert.equal(await findPersonById(db, String(id)), null);
});
