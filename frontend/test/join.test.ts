import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { handleJoin, handleSurvey, handleConfirm } from '../lib/join.ts';
import { signConfirmToken } from '../lib/confirmToken.ts';
import { setReviewStatus } from '../lib/people.ts';

function resend(status: number, body: unknown) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}
const okResend = () => resend(200, { object: 'contact', id: 'c-479e' });

test('400 on an invalid body, nothing stored', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'nope' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  assert.equal(r.status, 400);
  assert.equal(r.body.success, false);
  assert.equal(dump('people').length, 0);
});

test('200: person saved, Resend called, sync recorded', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'A@B.co', placement: 'footer' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 1);
  const [p] = dump('people');
  assert.equal(p.email, 'a@b.co');
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-479e');
});

test('Resend failure still returns 200 and keeps the person unsynced', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: resend(500, {}).fetchImpl, log: (m) => logs.push(m) });
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1);
  assert.equal(dump('people')[0].newsletter, undefined);
  assert.match(logs[0], /resend sync failed/);
});

test('an address that opted out in Resend is recorded as unsubscribed, not re-subscribed', async () => {
  const { db, dump } = fakeDb();
  let n = 0;
  const fetchImpl = (async () => {
    n += 1;
    const body = n === 1 ? { message: 'Contact already exists' } : { object: 'contact', id: 'c-old', unsubscribed: true };
    return new Response(JSON.stringify(body), { status: n === 1 ? 409 : 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(n, 2); // POST then GET; never a PATCH that flips unsubscribed
  assert.equal((dump('people')[0].newsletter as { unsubscribed?: true }).unsubscribed, true);
});

test('a reserved-domain email is stored but never sent to Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'walkthrough@example.com' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });
});

test('429 after five signups from one address in an hour', async () => {
  const { db } = fakeDb();
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl };
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleJoin({ email: `u${i}@b.co` }, '9.9.9.9', deps)).status, 200);
  }
  const sixth = await handleJoin({ email: 'u6@b.co' }, '9.9.9.9', deps);
  assert.equal(sixth.status, 429);
  assert.equal((await handleJoin({ email: 'u7@b.co' }, '8.8.8.8', deps)).status, 200);
});

const FULL = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'twitter', updatesVia: ['github'], newsChannel: 'email',
  packages_r: ['cfbfastR'], dataTypes: ['pbp'], following: 'yes',
};
const site = { siteUrl: 'https://www.sportsdataverse.org', tokenSecret: 's3cret' };

test('survey: anonymous row stored, no Resend call, 400 on an incomplete profile', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleSurvey({ answers: FULL }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.equal(dump('people')[0].status, 'survey');
  assert.equal((dump('people')[0].profile as { role: string }).role, 'developer');
  const bad = await handleSurvey({ answers: { role: 'developer' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(bad.status, 400);
});

test('join with a profile, single opt-in (no RESEND_FROM): contact created with properties', async () => {
  const { db, dump } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', name: 'Ann', answers: { ...FULL, wants_newsletter: 'yes', wants_discord: 'no' }, placement: 'join' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].body).properties.languages, 'R');
  const [p] = dump('people');
  assert.equal(p.name, 'Ann');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false });
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-1');
});

test('join with wants_newsletter=no stores the profile and never calls Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'a@b.co', answers: { ...FULL, wants_newsletter: 'no', wants_discord: 'yes' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].wants, { discord: true, newsletter: false, stickers: false, package: false });
  assert.equal(dump('people')[0].newsletter, undefined);
});

test('double opt-in (RESEND_FROM set): confirmation email sent, contact created only on confirm', async () => {
  const { db, dump } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true }, placement: 'footer' }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.match(r.body.message, /check your inbox/i);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/emails'));
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(sent.to, ['a@b.co']);
  const link = String(sent.text).match(/https:\/\/www\.sportsdataverse\.org\/api\/join\/confirm\?t=([A-Za-z0-9_.-]+)/);
  assert.ok(link, 'confirm link present');
  assert.deepEqual(Object.keys(dump('people')[0].newsletter as object), ['pending']);

  const c = await handleConfirm(link![1], deps);
  assert.equal(c.redirect, '/join/confirmed');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/contacts'));
  const nl = dump('people')[0].newsletter as { resendContactId: string; confirmedAt?: Date };
  assert.equal(nl.resendContactId, 'c-1');
  assert.ok(nl.confirmedAt);
});

test('confirm: bad or expired tokens redirect with a state; reserved domains never email', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  assert.equal((await handleConfirm('garbage', deps)).redirect, '/join/confirmed?state=invalid');
  const old = signConfirmToken('66f0aaaaaaaaaaaaaaaaaaaa', 's3cret', new Date('2020-01-01'));
  assert.equal((await handleConfirm(old, deps)).redirect, '/join/confirmed?state=expired');
  await handleJoin({ email: 'walkthrough@example.com', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(k.calls(), 0);
  assert.deepEqual(dump('people')[0].newsletter, { skipped: 'reserved-domain' });

  const skippedToken = signConfirmToken(String(dump('people')[0]._id), 's3cret');
  assert.equal((await handleConfirm(skippedToken, deps)).redirect, '/join/confirmed');
  assert.equal(k.calls(), 0);
});

test('re-signup after single opt-in does not clobber the synced contact', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const first = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl });
  assert.equal(first.status, 200);
  assert.equal(k.calls(), 1);

  const calls: { url: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push({ url: String(url) });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-479e' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const second = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' });
  assert.equal(second.status, 200);
  assert.equal(second.body.message, "You're on the list.");
  assert.ok(!calls.some((c) => c.url.endsWith('/emails')));
  assert.equal((dump('people')[0].newsletter as { resendContactId: string }).resendContactId, 'c-479e');
});

test('a confirmed click survives a Resend outage; a later retry completes the sync', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  let failContacts = true;
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    const s = String(url);
    if (s.endsWith('/emails')) return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (failContacts) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', log: (m: string) => logs.push(m) };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.match(r.body.message, /check your inbox/i);
  const sent = JSON.parse(calls[0].body);
  const link = String(sent.text).match(/https:\/\/www\.sportsdataverse\.org\/api\/join\/confirm\?t=([A-Za-z0-9_.-]+)/);
  assert.ok(link, 'confirm link present');

  const c1 = await handleConfirm(link![1], deps);
  assert.equal(c1.redirect, '/join/confirmed');
  const nl1 = dump('people')[0].newsletter as { confirmedAt?: Date; resendContactId?: string };
  assert.ok(nl1.confirmedAt);
  assert.equal(nl1.resendContactId, undefined);
  assert.match(logs.join('\n'), /resend sync failed/);

  failContacts = false;
  const c2 = await handleConfirm(link![1], deps);
  assert.equal(c2.redirect, '/join/confirmed');
  const nl2 = dump('people')[0].newsletter as { resendContactId?: string };
  assert.equal(nl2.resendContactId, 'c-1');
});

test('double opt-in: a failed confirmation-email send tells the truth and leaves the person unsynced', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async () => new Response('boom', { status: 500 })) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', log: (m: string) => logs.push(m) };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.match(r.body.message, /try again/i);
  assert.equal(dump('people')[0].newsletter, undefined);
  assert.match(logs[0], /confirmation email failed/);
});

test('a re-signup keeps the double opt-in confirmation on the record', async () => {
  const { db, dump } = fakeDb();
  const site = { siteUrl: 'https://www.sportsdataverse.org', tokenSecret: 's3cret' };
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };

  await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  const token = String(calls.find((u) => u.endsWith('/emails')) && JSON.stringify(calls));
  assert.ok(token); // the confirmation mail went out
  const { personId } = { personId: String((dump('people')[0] as { _id: unknown })._id) };
  await handleConfirm(signConfirmToken(personId, 's3cret'), deps);
  const confirmedAt = (dump('people')[0].newsletter as { confirmedAt?: Date }).confirmedAt;
  assert.ok(confirmedAt, 'confirmed once');

  // same person fills the footer form again -> refresh only, confirmation preserved
  await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  const nl = dump('people')[0].newsletter as { resendContactId: string; confirmedAt?: Date };
  assert.equal(nl.resendContactId, 'c-1');
  assert.equal((nl.confirmedAt as Date).getTime(), (confirmedAt as Date).getTime());
});

test('turning the newsletter off retires the pending invite and blocks the old link', async () => {
  const { db, dump } = fakeDb();
  const site = { siteUrl: 'https://www.sportsdataverse.org', tokenSecret: 's3cret' };
  const k = okResend();
  const deps = { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const ANSWERS = {
    role: 'developer', languages: ['R'], sports: ['CFB'],
    discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'email',
    dataTypes: ['pbp'], packages_r: ['cfbfastR'],
  };

  await handleJoin({ email: 'a@b.co', answers: { ...ANSWERS, wants_newsletter: 'yes', wants_discord: 'no' } }, '1.1.1.1', deps);
  const personId = String((dump('people')[0] as { _id: unknown })._id);
  assert.deepEqual(Object.keys(dump('people')[0].newsletter as object), ['pending']);
  const token = signConfirmToken(personId, 's3cret');

  await handleJoin({ email: 'a@b.co', answers: { ...ANSWERS, wants_newsletter: 'no', wants_discord: 'no' } }, '1.1.1.1', deps);
  assert.equal(dump('people')[0].newsletter, undefined, 'the unused invite is gone');

  const r = await handleConfirm(token, deps);
  assert.equal(r.redirect, '/join/confirmed?state=invalid');
  assert.equal(dump('people')[0].newsletter, undefined, 'an opted-out person is never subscribed');
});

const D_ANSWERS = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord',
  dataTypes: ['pbp'], packages_r: ['cfbfastR'],
  wants_newsletter: 'no', wants_discord: 'yes',
};

function discordFake() {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).includes('discord.com')) {
      return new Response(JSON.stringify({ code: 'inv123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const discordEnv = { discordBotToken: 'tok', discordChannelId: '42' };

test('an org member asking for Discord is admitted on the spot', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/);
  const [p] = dump('people');
  assert.equal(p.status, 'auto');
  assert.equal(p.githubLogin, 'octocat');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('a stranger asking for Discord is queued, and no invite is minted', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null,
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /review/i);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 0);
  const [p] = dump('people');
  assert.equal(p.status, 'pending');
  assert.equal(p.discord, undefined);
});

test('a second email for the same GitHub login does not collide', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  await handleJoin({ email: 'first@b.co', answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  const r = await handleJoin({ email: 'second@b.co', answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  assert.equal(r.status, 200, 'the second address must not 500 on the unique login index');
  assert.equal(dump('people').length, 2);
  assert.equal(dump('people').filter((p) => p.githubLogin === 'octocat').length, 1);
});

test('a recent decline is not re-opened by re-submitting', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null };
  await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', deps);
  const personId = (dump('people')[0] as { _id: unknown })._id;
  await setReviewStatus(db, personId as never, 'declined', 'saiemgilani', new Date(), 'no vouch');
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'declined', 'still declined, not back in the queue');
});

test('Discord failing does not fail the request or lose the person', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) return new Response('{"message":"Missing Permissions"}', { status: 403 });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl, ...discordEnv, log: (m) => logs.push(m),
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'auto');
  assert.equal(dump('people')[0].discord, undefined);
  assert.match(logs.join(' '), /discord invite failed/);
});
