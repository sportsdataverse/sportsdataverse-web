import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { upsertJoin, recordDiscordInvite, findPersonById } from '../lib/people.ts';
import { approve, decline, requeue, resendInvite, retrySync, removePerson } from '../lib/review.ts';

const T0 = new Date('2026-09-24T12:00:00Z');
const PROFILE = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'email' } as const;

async function queued(db: ReturnType<typeof fakeDb>['db'], wants = { newsletter: false, discord: true }) {
  const { personId } = await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE as never, wants }, T0);
  return personId;
}
function fakeNet(discordStatus = 200, emailStatus = 200, contactUnsubscribed = false) {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); calls.push(u);
    bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
    if (u.includes('discord.com')) return new Response(JSON.stringify({ code: 'inv123' }), { status: discordStatus, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/emails')) return new Response(JSON.stringify({ id: 'em-1' }), { status: emailStatus, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1', unsubscribed: contactUnsubscribed }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls, bodies };
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

test('approve leaves a person the invite failed for in the queue, not approved holding nothing', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet(403);
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /Discord 403/);
  assert.match(r.message, /queue/i, 'the admin is told where the person went');
  // spec -> Errors: never mark approved without a stored invite code. The Queue
  // view is status:"pending", so 'approved' here would hide them from every
  // admin while they hold no invite at all.
  assert.equal(dump('people')[0].status, 'pending', 'still in the queue a human works');
  assert.equal(dump('people')[0].discord, undefined);
  assert.equal(dump('people')[0].reviewedAt, undefined, 'and no review was stamped');
});

test('approve with Discord unconfigured — the configuration this branch ships in — keeps the person in the queue', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await approve({ db, ...env, discordBotToken: undefined, discordChannelId: undefined, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /DISCORD_BOT_TOKEN is not set/);
  assert.equal(dump('people')[0].status, 'pending');
  assert.equal(net.calls.length, 0);
});

test('resendInvite refuses someone whose latest answer is "no Discord"', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const setup = fakeNet();
  await approve({ db, ...env, fetchImpl: setup.fetchImpl }, id); // -> auto/approved with a live invite
  // they re-submit /join answering no: upsertJoin rewrites wants.discord and never touches status
  await upsertJoin(db, { email: 'a@b.co', answers: {}, profile: PROFILE as never, wants: { newsletter: false, discord: false } }, T0);
  assert.equal(dump('people')[0].status, 'approved');
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /didn.t ask for discord/i);
  assert.equal(net.calls.length, 0, 'no invite is minted against a current "no"');
});

test('retrySync refuses a reserved-domain address instead of pushing it to the real list', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { skipped: 'reserved-domain' };
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /reserved domain/i);
  assert.equal(net.calls.length, 0, 'a CI walkthrough address never becomes a real contact');
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' }, 'and the marker is not overwritten');
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

test('a Discord invite that mints but fails to save is reported as unrecorded, not as a Discord failure', async () => {
  const { db, failNextUpdateWith } = fakeDb();
  const id = await queued(db);
  const setup = fakeNet();
  await approve({ db, ...env, fetchImpl: setup.fetchImpl }, id); // -> approved, eligible for resend below
  await recordDiscordInvite(db, id, { code: 'stale', expiresAt: new Date(T0.getTime() - 1000) }, T0); // force a re-mint
  const net = fakeNet();
  failNextUpdateWith({ code: 91 }); // the next write is recordDiscordInvite, inside mintAndSend
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123', 'the admin still gets the code Discord already issued');
  assert.match(r.message, /couldn.t save|record this code/i);
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1, 'Discord was asked for exactly one invite, not re-minted');
});

test('an expired stored invite is replaced on resend', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  const setup = fakeNet();
  await approve({ db, ...env, fetchImpl: setup.fetchImpl }, id); // resend is gated on approved/auto status
  await recordDiscordInvite(db, id, { code: 'old', expiresAt: new Date(T0.getTime() - 1000) }, T0);
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.inviteUrl, 'https://discord.gg/inv123');
  assert.equal(net.calls.filter((u) => u.includes('discord.com')).length, 1);
});

test('approve refuses a newsletter-only signup instead of minting them a Discord invite they never asked for', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /didn.t ask for discord/i);
  assert.equal(dump('people')[0].status, 'pending', 'no decision is recorded either');
  assert.equal(net.calls.length, 0, 'never touches Discord for someone who did not ask for it');
});

test('resendInvite refuses a declined person instead of minting them a live invite', async () => {
  const { db } = fakeDb();
  const id = await queued(db);
  await decline({ db, ...env }, id, 'no vouch', false);
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /declined/i);
  assert.equal(net.calls.length, 0, 'never touches Discord for a declined person');
});

test('resendInvite refuses a person who was never approved, and says to approve them', async () => {
  const { db } = fakeDb();
  const id = await queued(db); // status stays 'pending' — never reviewed
  const net = fakeNet();
  const r = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /approve/i);
  assert.equal(net.calls.length, 0, 'never touches Discord for an unreviewed person');
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

test('decline with notify but no configured sender still just declines — no crash, no email', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();
  const r = await decline({ db, ...env, fetchImpl: net.fetchImpl }, id, 'no vouch', true); // notify:true, no resendFrom
  assert.equal(r.ok, true);
  assert.equal(r.message, 'Declined.');
  assert.equal(dump('people')[0].status, 'declined');
  assert.equal(net.calls.filter((u) => u.endsWith('/emails')).length, 0);
});

test('decline with notify and a configured sender but no email on file still just declines — no crash, no email', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  delete (dump('people')[0] as { email?: string }).email;
  const net = fakeNet();
  const r = await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: net.fetchImpl }, id, 'no vouch', true);
  assert.equal(r.ok, true);
  assert.equal(r.message, 'Declined.');
  assert.equal(net.calls.filter((u) => u.endsWith('/emails')).length, 0);
});

test('decline refuses a newsletter-only row instead of stamping a Discord decision on it', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  const r = await decline({ db, ...env, resendFrom: 'SDV <news@sportsdataverse.org>', fetchImpl: net.fetchImpl }, id, 'tidying up', true);
  assert.equal(r.ok, false);
  assert.match(r.message, /didn.t ask for discord/i);
  assert.equal(dump('people')[0].status, 'pending', 'a footer subscriber is not locked out by a tidy-up click');
  assert.equal(net.calls.length, 0, 'and is never mailed a Discord refusal');
});

test('requeue is the way back out of declined, and only out of declined', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db);
  await decline({ db, ...env }, id, 'no vouch', false);
  assert.equal(dump('people')[0].status, 'declined');

  const back = await requeue({ db, ...env }, id);
  assert.equal(back.ok, true);
  assert.equal(dump('people')[0].status, 'pending', 'listed by the Queue view again');
  assert.equal(dump('people')[0].reviewedBy, 'saiemgilani');

  const again = await requeue({ db, ...env }, id);
  assert.equal(again.ok, false, 'requeue is not a way to demote an approval');
  assert.match(again.message, /declined/i);
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

test('retrySync sends the profile through as Resend contact properties', async () => {
  const { db } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  const contactBody = net.bodies.find((b) => b && typeof b === 'object' && 'email' in (b as object)) as
    | { properties?: Record<string, string> }
    | undefined;
  assert.deepEqual(contactBody?.properties, {
    role: 'developer', languages: 'R', sports: 'CFB', discovered_via: 'github', updates_via: 'github', news_channel: 'email',
  });
});

test('retrySync refuses someone who never clicked their confirmation link', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { pending: { sentAt: T0 } };
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /confirmed/i);
  assert.equal(net.calls.length, 0, 'never hands Resend an unconfirmed address');
});

test('retrySync carries an existing confirmedAt forward instead of losing it', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const confirmedAt = new Date('2026-09-01T00:00:00Z');
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { pending: { sentAt: T0 }, confirmedAt };
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  const nl = dump('people')[0].newsletter as { confirmedAt?: Date };
  assert.equal(nl.confirmedAt?.getTime(), confirmedAt.getTime());
});

test('retrySync reports when Resend already has the contact marked unsubscribed', async () => {
  const { db } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet(200, 200, true);
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, true);
  assert.match(r.message, /unsubscribed in Resend/);
});

test('retrySync reports an orphaned Resend contact instead of blaming the sync when only the write fails', async () => {
  const { db, dump, failNextUpdateWith } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  const net = fakeNet();
  failNextUpdateWith({ code: 91 }); // the next write is markNewsletterSynced, after subscribeToResend already succeeded
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /couldn.t record it here/i);
  assert.doesNotMatch(r.message, /Simulated error/, 'the driver error must not leak through as the cause');
  assert.equal(dump('people')[0].newsletter, undefined, 'the write never landed, so the person is still unsynced');
  assert.equal(net.calls.length, 1, 'Resend was called exactly once, not retried inside this call');
});

test('retrySync refuses someone who never opted into the newsletter', async () => {
  const { db } = fakeDb();
  const id = await queued(db, { newsletter: false, discord: true });
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /didn.t ask for the newsletter/i);
  assert.equal(net.calls.length, 0, 'never touches Resend for someone who did not opt in');
});

test('retrySync refuses someone who already unsubscribed instead of re-syncing them', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { resendContactId: 'c-1', syncedAt: T0, unsubscribed: true };
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /unsubscribed/i);
  assert.equal(net.calls.length, 0, 'never touches Resend for someone who already unsubscribed');
});

test('retrySync on a person with no email says so, not "No such person"', async () => {
  const { db, dump } = fakeDb();
  const id = await queued(db, { newsletter: true, discord: false });
  delete (dump('people')[0] as { email?: string }).email;
  const net = fakeNet();
  const r = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.match(r.message, /no email/i);
  assert.doesNotMatch(r.message, /No such person/);
});

test('every function reports "No such person." for an id that does not exist, instead of throwing', async () => {
  const { db } = fakeDb();
  const bogus = 'id-does-not-exist';
  const net = fakeNet();
  const results = await Promise.all([
    approve({ db, ...env, fetchImpl: net.fetchImpl }, bogus as never),
    resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, bogus as never),
    decline({ db, ...env, fetchImpl: net.fetchImpl }, bogus as never, 'no vouch', false),
    retrySync({ db, ...env, fetchImpl: net.fetchImpl }, bogus as never),
    removePerson({ db, ...env, fetchImpl: net.fetchImpl }, bogus as never),
  ]);
  for (const r of results) {
    assert.equal(r.ok, false);
    assert.equal(r.message, 'No such person.');
  }
});

test('a database read failure resolves to a result object, not a throw', async () => {
  const { db, failNextReadWith } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();

  failNextReadWith({ code: 91 });
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.equal(r.emailed, false);

  failNextReadWith({ code: 91 });
  const r2 = await resendInvite({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r2.ok, false);

  failNextReadWith({ code: 91 });
  const r3 = await decline({ db, ...env, fetchImpl: net.fetchImpl }, id, 'no vouch', false);
  assert.equal(r3.ok, false);

  failNextReadWith({ code: 91 });
  const r4 = await retrySync({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r4.ok, false);
});

test('a database write failure resolves to a result object without recording a decision that did not happen', async () => {
  const { db, dump, failNextUpdateWith } = fakeDb();
  const id = await queued(db);
  const net = fakeNet();

  failNextUpdateWith({ code: 91 });
  const r = await approve({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r.ok, false);
  assert.equal(dump('people')[0].status, 'pending', 'a failed write must not be reported as a recorded decision');

  failNextUpdateWith({ code: 91 });
  const r2 = await decline({ db, ...env, fetchImpl: net.fetchImpl }, id, 'no vouch', false);
  assert.equal(r2.ok, false);
  assert.equal(dump('people')[0].status, 'pending');

  failNextUpdateWith({ code: 91 });
  const r3 = await removePerson({ db, ...env, fetchImpl: net.fetchImpl }, id);
  assert.equal(r3.ok, false);
  assert.equal(dump('people').length, 1, 'a failed delete must not remove the record');
});
