import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { CONTACT_EMAIL } from '../content/links.ts';
import { handleJoin, handleSurvey, handleConfirm } from '../lib/join.ts';
import { signConfirmToken } from '../lib/confirmToken.ts';
import { setReviewStatus, recordDiscordInvite, listPeople } from '../lib/people.ts';
import { approve, retrySync } from '../lib/review.ts';

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

test('survey: identified row stored, no Resend call, 400 on an incomplete profile', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: FULL }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(k.calls(), 0);
  assert.equal(dump('people')[0].status, 'survey');
  assert.equal((dump('people')[0].profile as { role: string }).role, 'developer');
  const bad = await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: { role: 'developer' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
  assert.equal(bad.status, 400);
});

test('join with a profile, single opt-in (no RESEND_FROM): contact created with properties', async () => {
  const { db, dump } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', identity: { ...IDENTITY, name: 'Ann' }, answers: { ...FULL, wants_newsletter: 'yes', wants_discord: 'no', wants_package: 'no', wants_stickers: 'no' }, placement: 'join' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl, ...site });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].body).properties.languages, 'R');
  const [p] = dump('people');
  assert.equal(p.name, 'Ann');
  assert.deepEqual(p.wants, { discord: false, newsletter: true, stickers: false, package: false }); // wants_stickers 'no' → stickers false
  assert.equal((p.newsletter as { resendContactId: string }).resendContactId, 'c-1');
});

test('join with wants_newsletter=no stores the profile and never calls Resend', async () => {
  const { db, dump } = fakeDb();
  const k = okResend();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...FULL, wants_newsletter: 'no', wants_discord: 'yes', wants_package: 'no', wants_stickers: 'no' } }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: k.fetchImpl, ...site });
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
  assert.match(second.body.message, /check your inbox/i, 'the same sentence an unknown address gets');
  assert.ok(!calls.some((c) => c.url.endsWith('/emails')));
  assert.equal((dump('people')[0].newsletter as { resendContactId: string }).resendContactId, 'c-479e');
});

test('with double opt-in live, a subscribed address and an unknown one get the same answer', async () => {
  const { db } = fakeDb();
  const fetchImpl = (async (url: string | URL | Request) => {
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const single = { db, resendApiKey: 'k', fetchImpl, ...site };
  const double = { ...single, resendFrom: 'SDV <news@sportsdataverse.org>' };
  await handleJoin({ email: 'known@b.co' }, '1.1.1.1', single); // synced contact on file

  const known = await handleJoin({ email: 'known@b.co' }, '2.2.2.2', double);
  const unknown = await handleJoin({ email: 'stranger@b.co' }, '3.3.3.3', double);
  assert.equal(known.body.message, unknown.body.message, 'no subscriber oracle on the newsletter half either');
  assert.match(known.body.message, /submit again/i, 'the recovery hint is state-independent, so it is on both replies');
  assert.equal(known.status, unknown.status);
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

test('double opt-in: a failed confirmation-email send still gets PENDING_MSG, and leaves the person unsynced', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async () => new Response('boom', { status: 500 })) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', log: (m: string) => logs.push(m) };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.match(r.body.message, /check your inbox/i, 'the reply no longer depends on whether the deferred send succeeds');
  assert.equal((dump('people')[0].newsletter as { resendContactId?: string }).resendContactId, undefined, 'never synced');
  assert.match(logs[0], /confirmation email failed/);
});

test('a resubmission after a failed confirmation send re-sends the link', async () => {
  const { db } = fakeDb();
  let attempt = 0;
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    attempt += 1;
    if (attempt === 1) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ id: 'em-2' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const r1 = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.match(r1.body.message, /check your inbox/i);
  const r2 = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.match(r2.body.message, /check your inbox/i);
  assert.equal(calls.filter((u) => u.endsWith('/emails')).length, 2, 'each submission re-sends the confirmation link');
});

test('a confirmation that never went out still records the pending marker, so Retry sync refuses it', async () => {
  const { db, dump } = fakeDb();
  const fetchImpl = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.match(r.body.message, /check your inbox/i);
  assert.deepEqual(Object.keys(dump('people')[0].newsletter as object), ['pending'], 'the promise we made is on the record');

  // the admin sees them in Unsynced and clicks Retry sync: the existing consent
  // gate has to be able to see that this address was never confirmed
  const contacts = { calls: 0 };
  const retryFetch = (async () => {
    contacts.calls += 1;
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const id = (dump('people')[0] as { _id: unknown })._id;
  const sync = await retrySync({ db, reviewer: 'saiemgilani', resendApiKey: 'k', fetchImpl: retryFetch }, id as never);
  assert.equal(sync.ok, false);
  assert.match(sync.message, /confirmed/i);
  assert.equal(contacts.calls, 0, 'an address whose owner never clicked the link never reaches Resend');
});

test('a re-signup never erases proof that this address already opted in', async () => {
  const { db, dump } = fakeDb();
  const confirmedAt = new Date('2026-01-01T00:00:00Z');
  await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { resendContactId: 'c-1', syncedAt: confirmedAt, confirmedAt, unsubscribed: true };

  // double opt-in now live, and Resend is down: the send fails
  const deps = { db, resendApiKey: 'k', fetchImpl: (async () => new Response('boom', { status: 500 })) as typeof fetch, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.match(r.body.message, /check your inbox/i);
  const nl = dump('people')[0].newsletter as { resendContactId?: string; confirmedAt?: Date; unsubscribed?: true };
  assert.equal(nl.resendContactId, 'c-1', 'the contact id survives');
  assert.equal(nl.confirmedAt?.getTime(), confirmedAt.getTime(), 'and so does the proof of a completed double opt-in');
  assert.equal(nl.unsubscribed, true, 'and the unsubscribe flag');
});

test('an unsubscribed address that re-signs up and clicks the new link is resubscribed', async () => {
  const { db, dump } = fakeDb();
  const confirmedAt = new Date('2026-01-01T00:00:00Z');
  await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { resendContactId: 'c-1', syncedAt: confirmedAt, confirmedAt, unsubscribed: true };
  const personId = String((dump('people')[0] as { _id: unknown })._id);
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>' };
  await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);

  const c = await handleConfirm(signConfirmToken(personId, 's3cret'), deps);
  assert.equal(c.redirect, '/join/confirmed');
  assert.ok(calls.some((u) => u.includes('/contacts')), 'the click is not swallowed as "already confirmed"');
  assert.equal((dump('people')[0].newsletter as { unsubscribed?: true }).unsubscribed, undefined);
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

  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...ANSWERS, wants_newsletter: 'yes', wants_discord: 'no', wants_package: 'no', wants_stickers: 'no' } }, '1.1.1.1', deps);
  const personId = String((dump('people')[0] as { _id: unknown })._id);
  assert.deepEqual(Object.keys(dump('people')[0].newsletter as object), ['pending']);
  const token = signConfirmToken(personId, 's3cret');

  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...ANSWERS, wants_newsletter: 'no', wants_discord: 'no', wants_package: 'no', wants_stickers: 'no' } }, '1.1.1.1', deps);
  assert.equal(dump('people')[0].newsletter, undefined, 'the unused invite is gone');

  const r = await handleConfirm(token, deps);
  assert.equal(r.redirect, '/join/confirmed?state=invalid');
  assert.equal(dump('people')[0].newsletter, undefined, 'an opted-out person is never subscribed');
});

const D_ANSWERS = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord',
  dataTypes: ['pbp'], packages_r: ['cfbfastR'],
  wants_newsletter: 'no', wants_discord: 'yes', wants_package: 'no', wants_stickers: 'no',
};

const IDENTITY = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };

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
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/);
  const [p] = dump('people');
  assert.equal(p.status, 'auto');
  assert.equal(p.githubLogin, 'octocat');
  assert.equal((p.discord as { code: string }).code, 'inv123');
  assert.equal(p.reviewedBy, 'octocat', 'the audit trail records who this admission was vouched by');
});

test('a non-member contributor (a merged PR, no org membership) is admitted on the spot', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'contribber', isOrgMember: false, isContributor: true },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/);
  const [p] = dump('people');
  assert.equal(p.status, 'auto');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('a stranger asking for Discord is queued, and no invite is minted', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null,
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /on file/i);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 0);
  const [p] = dump('people');
  assert.equal(p.status, 'pending');
  assert.equal(p.discord, undefined);
  assert.equal(p.reviewedAt, undefined, 'never reviewed — the audit column must stay untouched');
});

test('a signed-in visitor with no org membership and no merged PR is queued, not admitted', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'rando', isOrgMember: false, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /on file/i);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 0, 'being signed in is not enough to mint an invite');
  const [p] = dump('people');
  assert.equal(p.status, 'pending');
  assert.equal(p.discord, undefined);
  assert.equal(p.reviewedAt, undefined);
});

test('re-submitting while unvouched never stamps a review that never happened', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(dump('people')[0].reviewedAt, undefined);
  assert.equal(dump('people')[0].reviewedBy, undefined);
});

test('a second email for the same GitHub login is queued, not admitted a second time', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  const r1 = await handleJoin({ email: 'first@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  assert.match(r1.body.message, /discord\.gg\/inv123/);
  const r2 = await handleJoin({ email: 'second@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer });
  assert.equal(r2.status, 200, 'the second address must not 500 on the unique login index');
  assert.match(r2.body.message, /on file/i, 'the same GitHub identity does not get a second invite under a new email');
  assert.equal(dump('people').length, 2);
  assert.equal(dump('people').filter((p) => p.githubLogin === 'octocat').length, 1);
  const second = dump('people').find((p) => p.email === 'second@b.co')!;
  assert.equal(second.status, 'pending');
  assert.equal(second.discord, undefined);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 1, 'only the first submission minted an invite');
});

test('a recent decline is not re-opened by re-submitting', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  const personId = (dump('people')[0] as { _id: unknown })._id;
  await setReviewStatus(db, personId as never, 'declined', 'saiemgilani', new Date(), 'no vouch');
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'declined', 'still declined, not back in the queue');
  assert.match(r.body.message, /on file/i, 'a declined applicant is never told they are on the list');
  assert.doesNotMatch(r.body.message, /already on the list/i);
  assert.doesNotMatch(r.body.message, /will review/i, 'and is never promised a review no queue will surface');
});

test('an approved person re-submitting without a session keeps their approval', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  const personId = (dump('people')[0] as { _id: unknown })._id;
  await setReviewStatus(db, personId as never, 'approved', 'saiemgilani', new Date());
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.equal(dump('people')[0].status, 'approved', 'a human decision is not silently demoted by a re-submit');
});

test('an anonymous caller who knows an admitted address is never handed that person\'s invite', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const owner = { login: 'octocat', isOrgMember: true, isContributor: false };
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv }; // no resendFrom: the live configuration
  const admitted = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: owner });
  assert.match(admitted.body.message, /discord\.gg\/inv123/, 'the owner got their invite');

  // different IP, no session at all, only the address — which is public in commit metadata
  const attacker = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '9.9.9.9', { ...base, viewer: null });
  assert.equal(attacker.status, 200);
  assert.doesNotMatch(attacker.body.message, /discord\.gg/, 'no invite URL reaches an unidentified caller');
  assert.doesNotMatch(attacker.body.message, /inv123/, 'and neither does the bare code');
  assert.match(attacker.body.message, /on file/i);
  assert.equal(dump('people')[0].status, 'auto', 'the victim keeps their admission');
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 1, 'and no second invite is minted');
});

test('a signed-in visitor is not handed the invite of a record that belongs to someone else', async () => {
  const { db } = fakeDb();
  const d = discordFake();
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    ...base, viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  // vouched in their own right, but not the person this record is about
  const r = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '2.2.2.2', {
    ...base, viewer: { login: 'someoneelse', isOrgMember: true, isContributor: false },
  });
  assert.doesNotMatch(r.body.message, /discord\.gg/, 'a session vouches for its owner, not for every address they can type');
  assert.match(r.body.message, /on file/i);
});

test('an unvouched caller cannot tell an admitted address from a declined or an unknown one', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'admitted@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    ...base, viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  await handleJoin({ email: 'declined@b.co', identity: IDENTITY, answers: D_ANSWERS }, '2.2.2.2', { ...base, viewer: null });
  const declinedId = dump('people').find((p) => p.email === 'declined@b.co')!._id;
  await setReviewStatus(db, declinedId as never, 'declined', 'saiemgilani', new Date(), 'no vouch');

  const probes = await Promise.all(
    ['admitted@b.co', 'declined@b.co', 'stranger@b.co'].map((email, i) =>
      handleJoin({ email, identity: IDENTITY, answers: D_ANSWERS }, `10.0.0.${i}`, { ...base, viewer: null })
    )
  );
  assert.equal(new Set(probes.map((r) => r.body.message)).size, 1, 'one sentence for all three, or the response is a membership oracle');
  assert.equal(new Set(probes.map((r) => r.status)).size, 1);
});

test('a signed-in stranger cannot stamp their handle on someone else\'s queued record', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: null }); // victim joined signed out
  const r = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '9.9.9.9', {
    ...base, viewer: { login: 'attacker', isOrgMember: false, isContributor: false },
  });
  assert.match(r.body.message, /on file/i);
  assert.equal(dump('people')[0].githubLogin, undefined, 'the ownership key is only ever written by a vouched session');
  assert.equal(dump('people')[0].status, 'pending');
});

test('the claim chain: a claimed record, an admin approval, and still no invite for the claimant', async () => {
  const { db, dump } = fakeDb();
  // the victim is a vouched contributor whose own mint failed, so their record
  // is back in the queue still carrying their handle — the one state where a
  // second caller reaches linkGithubLogin on an already-bound record
  const deadDiscord = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) return new Response('{"message":"Missing Permissions"}', { status: 403 });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: deadDiscord, ...discordEnv,
    viewer: { login: 'victimlogin', isOrgMember: true, isContributor: false },
  });
  assert.equal(dump('people')[0].status, 'pending');
  assert.equal(dump('people')[0].githubLogin, 'victimlogin');

  // an attacker — vouched in their own right, so they get all the way to the link
  const d = discordFake();
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  const claim = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '2.2.2.2', {
    ...base, viewer: { login: 'attacker', isOrgMember: true, isContributor: false },
  });
  assert.match(claim.body.message, /on file/i);
  assert.equal(dump('people')[0].githubLogin, 'victimlogin', "the rightful owner's handle survives");

  // the admin works the queue and approves that row
  const approved = await approve({ db, reviewer: 'saiemgilani', ...discordEnv, resendApiKey: 'k', fetchImpl: d.fetchImpl }, dump('people')[0]._id as never);
  assert.equal(approved.ok, true);
  assert.equal((dump('people')[0].discord as { code: string }).code, 'inv123');

  const steal = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '3.3.3.3', {
    ...base, viewer: { login: 'attacker', isOrgMember: true, isContributor: false },
  });
  assert.doesNotMatch(steal.body.message, /discord\.gg/, 'an approval an admin made is not a key the claimant can turn');
  assert.doesNotMatch(steal.body.message, /inv123/);
  assert.match(steal.body.message, /on file/i);
});

test('a handle bound before the decision is not a key to the invite an admin later mints', async () => {
  const { db, dump } = fakeDb();
  const deadDiscord = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) return new Response('{"message":"Missing Permissions"}', { status: 403 });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: deadDiscord, ...discordEnv, viewer: null,
  }); // the victim joined signed out: nothing bound

  // a vouched caller submits someone else's address while Discord is down, so the
  // record keeps their handle and falls back into the queue
  const attacker = { login: 'attacker', isOrgMember: true, isContributor: false };
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '2.2.2.2', {
    db, resendApiKey: 'k', fetchImpl: deadDiscord, ...discordEnv, viewer: attacker,
  });
  assert.equal(dump('people')[0].status, 'pending');
  assert.equal(dump('people')[0].githubLogin, 'attacker', 'the handle is bound — which is exactly why it cannot be the key');

  const d = discordFake();
  await approve({ db, reviewer: 'saiemgilani', ...discordEnv, resendApiKey: 'k', fetchImpl: d.fetchImpl }, dump('people')[0]._id as never);
  assert.equal((dump('people')[0].discord as { code: string }).code, 'inv123');

  const r = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '3.3.3.3', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: attacker,
  });
  assert.doesNotMatch(r.body.message, /discord\.gg/, 'only a self-admission is echoed — an admin decision is relayed by hand');
  assert.doesNotMatch(r.body.message, /inv123/);
  assert.match(r.body.message, /on file/i);
});

test('an admin approval is never echoed as an invite — only a self-admission is', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const viewer = { login: 'octocat', isOrgMember: false, isContributor: false };
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer }); // unvouched -> queued
  const id = dump('people')[0]._id;
  await approve({ db, reviewer: 'saiemgilani', ...discordEnv, resendApiKey: 'k', fetchImpl: d.fetchImpl }, id as never);
  assert.equal((dump('people')[0].discord as { code: string }).code, 'inv123');

  // the same human, signed in as themselves, re-submitting: the admin relays the
  // link by hand (SETUP-community.md), the endpoint never hands it out
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer });
  assert.doesNotMatch(r.body.message, /discord\.gg/);
  assert.match(r.body.message, /on file/i);
});

test('a handle that differs only in case is the same person', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    ...base, viewer: { login: 'OctoCat', isOrgMember: true, isContributor: false },
  });
  assert.equal(dump('people')[0].githubLogin, 'octocat', 'stored folded, so the unique index can do its job');
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    ...base, viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.match(r.body.message, /discord\.gg\/inv123/, 'GitHub handles are case-insensitive; the owner keeps their own invite');
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 1, 'and no second invite is minted');
});

test('Discord failing does not fail the request, and the person falls back into the review queue', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) return new Response('{"message":"Missing Permissions"}', { status: 403 });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl, ...discordEnv, log: (m) => logs.push(m),
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /review/i, 'a stalled invite falls back to the same queued message, not a broken promise');
  assert.equal(dump('people')[0].status, 'pending', 'queued for a human, not stuck at auto with no invite and no queue listing it');
  assert.equal(dump('people')[0].discord, undefined);
  assert.match(logs.join(' '), /discord invite failed/);
});

test('a re-submission with no verified sender hands back the invite instead of promising an email', async () => {
  const { db } = fakeDb();
  const d = discordFake();
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  const deps = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer }; // no resendFrom configured
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/, 'no sender configured — the code is handed back directly');
  assert.doesNotMatch(r.body.message, /check your email/i);
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 1, 'no second invite is minted on re-submit');
});

test('with a verified sender, the invite is emailed on admission and a re-submission points at the inbox', async () => {
  const { db } = fakeDb();
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (String(url).includes('discord.com')) {
      return new Response(JSON.stringify({ code: 'inv123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  const deps = { db, resendApiKey: 'k', fetchImpl, ...discordEnv, viewer, resendFrom: 'SDV <news@sportsdataverse.org>' };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  const emailCall = calls.find((c) => c.url.endsWith('/emails'));
  assert.ok(emailCall, 'the invite email was sent — this is the only coverage discordInviteEmail has');
  const sent = JSON.parse(emailCall!.body);
  assert.deepEqual(sent.to, ['a@b.co']);
  assert.match(sent.text, /discord\.gg\/inv123/);

  const r2 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', deps);
  assert.equal(r2.status, 200);
  assert.match(r2.body.message, /check your email/i);
});

test('a stale invite left on the row by a failed rollback is never echoed', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const owner = { login: 'octocat', isOrgMember: true, isContributor: false };
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: owner });
  // the shape a failed rollback leaves: this admission, someone else's older code
  const row = dump('people')[0] as { discord: { invitedAt: Date }; reviewedAt: Date };
  row.discord.invitedAt = new Date(row.reviewedAt.getTime() - 60_000);
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: owner });
  assert.doesNotMatch(r.body.message, /discord\.gg/, 'an invite predating this admission is not ours to hand over');
  assert.doesNotMatch(r.body.message, /inv123/);
});

test('an expired invite is not handed back as if it still worked', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const owner = { login: 'octocat', isOrgMember: true, isContributor: false };
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: owner });
  (dump('people')[0] as { discord: { expiresAt: Date } }).discord.expiresAt = new Date(Date.now() - 1000);
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: owner });
  assert.doesNotMatch(r.body.message, /discord\.gg/, 'a dead link is worse than no link');
});

test('a re-signup never erases proof that this address completed double opt-in', async () => {
  const { db, dump } = fakeDb();
  const confirmedAt = new Date('2026-09-01T00:00:00Z');
  const body = { email: 'a@b.co', wants: { newsletter: true, discord: false } } as never;
  const deps = { db, resendApiKey: 'k', resendFrom: 'SDV <news@sportsdataverse.org>', tokenSecret: 's', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin(body, '1.1.1.1', deps);
  (dump('people')[0] as { newsletter?: unknown }).newsletter = { pending: { sentAt: new Date() }, confirmedAt };
  await handleJoin(body, '1.1.1.1', deps);
  const nl = dump('people')[0].newsletter as { confirmedAt?: Date };
  assert.equal(nl.confirmedAt?.getTime(), confirmedAt.getTime(), 'the confirmation they already gave survives');
});

test('a signed-in visitor we cannot vouch for has their handle recorded as a claim, not as the ownership key', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const stranger = { login: 'Drifter', isOrgMember: false, isContributor: false };
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: stranger,
  });
  const row = dump('people')[0];
  assert.equal(row.status, 'pending', 'no vouch, so no admission');
  assert.equal(row.githubLogin, undefined, 'the ownership key stays unwritten');
  assert.equal(row.claimedGithubLogin, 'drifter', 'but the member working the queue can see who asked');
  assert.equal(d.calls.filter((u) => u.includes('discord.com')).length, 0, 'and no invite is minted');
  assert.doesNotMatch(r.body.message, /discord\.gg/);
});

test('a claimed handle never becomes a key to an invite an admin later mints', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const claimant = { login: 'Drifter', isOrgMember: false, isContributor: false };
  const base = { db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv };
  await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: claimant });
  const personId = (dump('people')[0] as { _id: unknown })._id;
  // an admin approves the row and an invite is recorded against it
  await setReviewStatus(db, personId as never, 'approved', 'saiemgilani', new Date());
  await recordDiscordInvite(db, personId as never, { code: 'SECRET9', expiresAt: new Date(Date.now() + 86_400_000) }, new Date());
  const again = await handleJoin({ email: 'victim@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', { ...base, viewer: claimant });
  assert.doesNotMatch(again.body.message, /discord\.gg/, 'a claim is not ownership');
  assert.doesNotMatch(again.body.message, /SECRET9/);
});

const PKG = { title: 'hoopR', repoType: 'R', sports: 'MBB', content: 'PBP and box scores.', sourceHref: 'https://github.com/sportsdataverse/hoopR' };

test('a package submitted through /join is stored hidden and linked to the person', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: { ...PKG, orgTier: true } } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  const person = dump('people')[0];
  const pkg = dump('packages')[0];
  assert.equal((person.wants as { package: boolean }).package, true);
  assert.equal(String(pkg.submittedBy), String(person._id));
  assert.equal(pkg.orgTierRequested, true);
  assert.equal(pkg.published, false);
  assert.match(r.body.message, /queue/i, 'the response mentions the queued package');
});

test('a re-submission updates wants.package without a Mongo path conflict', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'no' } } as never, '1.1.1.1', deps);
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never, '1.1.1.1', deps
  );
  assert.equal(r.status, 200);
  assert.equal((dump('people')[0].wants as { package: boolean }).package, true, 'the second answer is recorded');
  assert.equal(dump('packages')[0].orgTierRequested, false, 'orgTier defaults false when absent from the payload');
});

test('the package flag and payload must agree', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  const r0 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'no' }, pkg: PKG } as never, '1.1.1.1', deps);
  assert.equal(r0.status, 200, 'a payload the flag disowns is dropped, not rejected');
  assert.equal(dump('packages').length, 0, 'a payload with the flag off is not a submission');
  const r = await handleJoin({ email: 'c@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' } } as never, '2.2.2.2', deps);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /package/i);
});

test('no package is stored when the person could not be written', async () => {
  const { db, dump } = fakeDb();
  db.failNextWriteTo('people', new Error('mongo down'));
  await assert.rejects(handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  ));
  assert.equal(dump('packages').length, 0, 'never a submission pointing at nobody');
});

test('a reserved-domain submission stores the person and wants.package but inserts no package (the PR-evidence walkthrough must not queue a fake one)', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'walkthrough@example.com', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  assert.equal((dump('people')[0].wants as { package: boolean }).package, true);
  assert.equal(dump('packages').length, 0);
});

test('a failed package write still returns 200, keeps the person, and logs a category with no email or response body', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  db.failNextWriteTo('packages', new Error('mongo down'));
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' }, pkg: PKG } as never,
    '5.5.5.5', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null, log: (m: string) => logs.push(m) }
  );
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1, 'the person is stored');
  assert.match(r.body.message, /could not/i, 'the message says the package was not recorded');
  assert.ok(logs.some((m) => /package submission failed/.test(m)), 'the failure is logged');
  assert.ok(!logs.some((m) => m.includes('a@b.co')), 'the log never carries the email');
});

test('a malformed package request never spends the join rate limit', async () => {
  const { db } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  for (let i = 0; i < 5; i++) {
    const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'yes' } } as never, '6.6.6.6', deps);
    assert.equal(r.status, 400);
  }
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_package: 'no' } } as never, '6.6.6.6', deps);
  assert.equal(r.status, 200, 'the sixth, valid request from the same IP still has a slot');
});

const STICKER = { name: 'Sam Envelope', address: { line1: '1 Main St', line2: 'Unit 4B', city: 'Durham', region: 'NC', postal: '27701', country: 'Canada' } };

test('a sticker request is stored apart from the person, never on it', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  const person = dump('people')[0];
  assert.equal((person.wants as { stickers: boolean }).stickers, true);
  const personJson = JSON.stringify(person);
  assert.equal(personJson.includes(STICKER.name), false, `no envelope name "${STICKER.name}" on the person record`);
  for (const v of Object.values(STICKER.address)) {
    assert.equal(personJson.includes(v), false, `no "${v}" on the person record`);
  }
  const req = dump('sticker_requests')[0];
  assert.equal(String(req.personId), String(person._id));
  assert.equal((req.address as { line1: string }).line1, '1 Main St');

  // the /join reply itself must never echo the envelope name or address either
  const replyJson = JSON.stringify(r.body);
  assert.equal(replyJson.includes(STICKER.name), false, 'the /join reply never echoes the envelope name');
  for (const v of Object.values(STICKER.address)) {
    assert.equal(replyJson.includes(v), false, `the /join reply never echoes "${v}"`);
  }
});

test('the sticker flag and payload must agree', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'no' }, sticker: STICKER } as never, '1.1.1.1', deps);
  assert.equal(dump('sticker_requests').length, 0, 'an address with the flag off is never stored');
  const r = await handleJoin({ email: 'c@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' } } as never, '2.2.2.2', deps);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /address|sticker/i);
});

test('the got-it email never carries the address, and no log line does either', async () => {
  const { db } = fakeDb();
  const sent: string[] = [];
  const logs: string[] = [];
  const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
    sent.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  }) as typeof fetch;
  await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1',
    { db, resendApiKey: 'k', resendFrom: 'SDV <n@sportsdataverse.org>', tokenSecret: 's', fetchImpl, viewer: null, log: (m) => logs.push(m) }
  );
  for (const blob of [...sent, ...logs]) {
    for (const v of Object.values(STICKER.address)) {
      assert.equal(blob.includes(v), false, `no "${v}" in a sent request body or log line`);
    }
  }
});

test('no sticker request is stored when the person could not be written', async () => {
  const { db, dump } = fakeDb();
  db.failNextWriteTo('people', new Error('mongo down'));
  await assert.rejects(handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  ));
  assert.equal(dump('sticker_requests').length, 0);
});

test('a reserved-domain address records wants.stickers but creates no sticker request', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin(
    { email: 'walkthrough@example.com', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null }
  );
  assert.equal(r.status, 200);
  assert.equal((dump('people')[0].wants as { stickers: boolean }).stickers, true);
  assert.equal(dump('sticker_requests').length, 0);
  // the reply is the one every sticker request gets, so the evidence walkthrough shows it
  assert.match((r.body as { message: string }).message, /Stickers are on the list\./);
});

test('a second submission keeps the first address, replies identically, and mails once', async () => {
  const { db, dump } = fakeDb();
  const sent: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    sent.push(String(url));
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const deps = { db, resendApiKey: 'k', resendFrom: 'SDV <news@sportsdataverse.org>', tokenSecret: 's3cret', fetchImpl, viewer: null };
  const ALT = { name: 'Pat Doe', address: { ...STICKER.address, line1: '2 Other Ave' } };
  const r1 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', deps);
  const r2 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: ALT } as never, '1.1.1.1', deps);
  assert.equal(dump('sticker_requests').length, 1, 'one open request');
  assert.equal((dump('sticker_requests')[0].address as { line1: string }).line1, '1 Main St', 'the first address wins');
  assert.equal(r1.body.message, r2.body.message, 'created vs. already-open must read identically');
  assert.equal(sent.filter((u) => u.endsWith('/emails')).length, 1, 'a repeat submission is not mailed again');
});

test('a failed sticker write returns 200, keeps the person, logs a category, and never logs the address', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  db.failNextWriteTo('sticker_requests', new Error('mongo down'));
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never,
    '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null, log: (m: string) => logs.push(m) }
  );
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1, 'the person is stored');
  assert.match(r.body.message, /couldn't record the sticker request/i);
  assert.equal(dump('sticker_requests').length, 0, 'no request row on a failed write');
  assert.ok(logs.length > 0, 'the failure is logged');
  for (const v of Object.values(STICKER.address)) {
    assert.ok(!logs.some((m) => m.includes(v)), `log never carries "${v}"`);
  }
});

test('a failed got-it email still returns the same success reply and keeps the stored request', async () => {
  const { db: db1, dump: dump1 } = fakeDb();
  const logs: string[] = [];
  const failingFetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith('/emails')) throw new Error('resend down');
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const failDeps = { db: db1, resendApiKey: 'k', resendFrom: 'SDV <n@sportsdataverse.org>', tokenSecret: 's', fetchImpl: failingFetch, viewer: null, log: (m: string) => logs.push(m) };
  const rFail = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', failDeps);
  assert.equal(rFail.status, 200);
  assert.equal(dump1('sticker_requests').length, 1, 'the request is stored regardless of the email failing');
  assert.ok(logs.length > 0, 'the email failure is logged');
  for (const v of Object.values(STICKER.address)) {
    assert.ok(!logs.some((m) => m.includes(v)), `log never carries "${v}"`);
  }

  const { db: db2 } = fakeDb();
  const okDeps = { db: db2, resendApiKey: 'k', resendFrom: 'SDV <n@sportsdataverse.org>', tokenSecret: 's', fetchImpl: okResend().fetchImpl, viewer: null };
  const rOk = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', okDeps);
  assert.equal(rFail.body.message, rOk.body.message, 'membership-oracle rule: the reply never differs by whether the email sent');
});

test('a resubmission with a changed answer updates wants.stickers', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'no' } } as never, '1.1.1.1', deps);
  assert.equal((dump('people')[0].wants as { stickers: boolean }).stickers, false);
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', deps);
  assert.equal((dump('people')[0].wants as { stickers: boolean }).stickers, true, 'the second, changed answer is recorded');
});

test('the sticker write runs only after the rate limit: a rate-limited request creates no sticker row', async () => {
  const { db, dump } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  for (let i = 0; i < 5; i++) {
    const r = await handleJoin({ email: `u${i}@b.co`, identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'no' } } as never, '7.7.7.7', deps);
    assert.equal(r.status, 200);
  }
  const r = await handleJoin(
    { email: 'u5@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '7.7.7.7', deps
  );
  assert.equal(r.status, 429, 'the sixth request from this IP is rate-limited');
  assert.equal(dump('sticker_requests').length, 0, 'a rate-limited request never reaches the sticker write');
});

test('a created sticker request and an already-open one both get the sticker success sentence', async () => {
  const { db } = fakeDb();
  const deps = { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null };
  const r1 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', deps);
  const r2 = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1', deps);
  const note = `Stickers are on the list. If you'd already asked, we'll use the first address you gave — to change it, write to ${CONTACT_EMAIL}.`;
  assert.ok(r1.body.message.includes(note), 'the created-request reply carries the self-explaining success sentence');
  assert.ok(r2.body.message.includes(note), 'the already-open reply carries the identical sentence — the membership-oracle rule');
});

// --- defer: Resend/Discord calls run after the reply, never before it -----

/** Collects tasks handed to JoinDeps.defer instead of running them, so a test
 *  can assert nothing reached the network before handleJoin returned. */
function collectDefer() {
  const tasks: Array<() => Promise<void>> = [];
  return { defer: (task: () => Promise<void>) => { tasks.push(task); }, tasks };
}

test('with defer supplied, a new address under double opt-in makes zero Resend calls before the reply', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const isEmail = String(url).endsWith('/emails');
    return new Response(JSON.stringify(isEmail ? { id: 'em-1' } : { object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', defer };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0, 'no Resend call reached the network before the reply');
  assert.equal(tasks.length, 1);
  for (const t of tasks) await t();
  assert.equal(calls.length, 1, 'the deferred confirmation email ran once released');
  assert.ok(calls[0].endsWith('/emails'));
});

test('with defer supplied, an already-synced address makes zero Resend calls before the reply', async () => {
  const { db } = fakeDb();
  await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl });
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', defer };
  const r = await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '2.2.2.2', deps);
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0, 'no Resend call reached the network before the reply');
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(calls.length, 1, 'the deferred sync ran once released');
});

test('with defer supplied, single opt-in (no RESEND_FROM) makes zero Resend calls before the reply', async () => {
  const { db, dump } = fakeDb();
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const r = await handleJoin({ email: 'a@b.co' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl, defer });
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0, 'no Resend call reached the network before the reply');
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(calls.length, 1);
  assert.equal((dump('people')[0].newsletter as { resendContactId: string }).resendContactId, 'c-1');
});

test('with defer supplied, a created sticker request makes zero Resend calls before the reply', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const r = await handleJoin(
    { email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, wants_stickers: 'yes' }, sticker: STICKER } as never, '1.1.1.1',
    { db, resendApiKey: 'k', resendFrom: 'SDV <n@sportsdataverse.org>', tokenSecret: 's', fetchImpl, viewer: null, defer }
  );
  assert.equal(r.status, 200);
  assert.equal(calls.length, 0, 'no Resend call reached the network before the reply');
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(calls.length, 1, 'the got-it email ran once released');
});

test('with defer supplied, a vouched Discord admission records the Discord call immediately but defers the invite email', async () => {
  const { db } = fakeDb();
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).includes('discord.com')) return new Response(JSON.stringify({ code: 'inv123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: 'em-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl, ...discordEnv, resendFrom: 'SDV <news@sportsdataverse.org>',
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
    defer,
  });
  assert.equal(r.status, 200);
  assert.equal(calls.filter((u) => u.includes('discord.com')).length, 1, 'the Discord mint is not deferred — the reply carries its URL');
  assert.equal(calls.filter((u) => u.endsWith('/emails')).length, 0, 'no Resend call reached the network before the reply');
  assert.equal(tasks.length, 1);
  await tasks[0]();
  assert.equal(calls.filter((u) => u.endsWith('/emails')).length, 1, 'the deferred invite email ran once released');
});

test('oracle property: a reserved address and a brand-new address both make zero Resend calls before the reply', async () => {
  const { db } = fakeDb();
  const callsReserved: string[] = [];
  const fetchImplReserved = (async (url: string | URL | Request) => {
    callsReserved.push(String(url));
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer: deferA, tasks: tasksA } = collectDefer();
  const rReserved = await handleJoin({ email: 'walkthrough@example.com' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: fetchImplReserved, defer: deferA });

  const callsNew: string[] = [];
  const fetchImplNew = (async (url: string | URL | Request) => {
    callsNew.push(String(url));
    return new Response(JSON.stringify({ object: 'contact', id: 'c-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const { defer: deferB, tasks: tasksB } = collectDefer();
  const rNew = await handleJoin({ email: 'stranger@b.co' }, '2.2.2.2', { db, resendApiKey: 'k', fetchImpl: fetchImplNew, defer: deferB });

  assert.equal(rReserved.status, 200);
  assert.equal(rNew.status, 200);
  assert.equal(callsReserved.length, 0);
  assert.equal(callsNew.length, callsReserved.length, 'a reserved address and a brand-new one make the same zero Resend calls before the reply — no timing oracle');
  assert.equal(tasksA.length, 0, 'reserved: no side effect is even scheduled');
  assert.equal(tasksB.length, 1, 'new address: one sync is scheduled, but not run yet');
});

test('a deferred send that fails logs no email or address, and the task itself resolves rather than rejecting', async () => {
  const { db } = fakeDb();
  const logs: string[] = [];
  const { defer, tasks } = collectDefer();
  const fetchImpl = (async () => new Response('boom', { status: 500 })) as typeof fetch;
  const deps = { db, resendApiKey: 'k', fetchImpl, ...site, resendFrom: 'SDV <news@sportsdataverse.org>', log: (m: string) => logs.push(m), defer };
  await handleJoin({ email: 'a@b.co', wants: { newsletter: true } }, '1.1.1.1', deps);
  assert.equal(tasks.length, 1);
  await assert.doesNotReject(tasks[0]());
  assert.match(logs[0], /confirmation email failed/);
  assert.ok(!logs.some((m) => m.includes('a@b.co')), 'the log never carries the email or address');
});

test('a failing Discord invite email still returns the invite URL and keeps the person admitted', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    if (String(url).includes('discord.com')) {
      return new Response(JSON.stringify({ code: 'inv123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('resend down');
  }) as typeof fetch;
  const { defer, tasks } = collectDefer();
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl, ...discordEnv, resendFrom: 'SDV <news@sportsdataverse.org>',
    viewer, log: (m: string) => logs.push(m), defer,
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/, 'the reply still carries the invite URL — the mint succeeded and is not rolled back by an email failure');
  assert.equal(dump('people')[0].status, 'auto', 'the person stays admitted even though the deferred email fails');
  assert.equal(tasks.length, 1);
  await assert.doesNotReject(tasks[0](), 'the deferred invite-email task resolves, it does not reject, even when the send fails');
  assert.match(logs.join(' '), /discord invite email failed/);
});

test('a defer that throws synchronously is logged, and the minted invite still reaches the reply', async () => {
  const { db, dump } = fakeDb();
  const d = discordFake();
  const logs: string[] = [];
  const viewer = { login: 'octocat', isOrgMember: true, isContributor: false };
  const throwingDefer = () => { throw new Error('after() is unavailable'); };
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.1', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, resendFrom: 'SDV <news@sportsdataverse.org>',
    viewer, defer: throwingDefer, log: (m) => logs.push(m),
  });
  assert.equal(r.status, 200);
  const code = (dump('people')[0].discord as { code: string } | undefined)?.code;
  assert.ok(code, 'the invite stays on the record');
  assert.match((r.body as { message: string }).message, new RegExp(code!), 'the visitor still gets the invite URL');
  assert.equal(dump('people')[0].status, 'auto', 'the mint already committed; a broken defer must not roll it back to pending');
  assert.match(logs.join(' '), /could not schedule/);
  assert.equal(d.calls.filter((u) => u.includes('api.resend.com')).length, 0, 'the email is not sent inline as a fallback');
});

test('a questionnaire /join without identity is refused, naming what is missing', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 400);
  assert.match((r.body as { message: string }).message, /name and where you're based/i);
  assert.equal(dump('people').length, 0);
});

test('the footer newsletter signup (email only, no answers) still needs no identity', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', placement: 'footer' }, '1.1.1.1', { db, resendApiKey: 'k', fetchImpl: okResend().fetchImpl, viewer: null });
  assert.equal(r.status, 200);
  assert.equal(dump('people').length, 1);
  assert.equal(dump('responses').length, 0, 'a footer signup is not a questionnaire submission');
});

test('/join stores the identity on the person and appends a response', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', identity: { ...IDENTITY, socials: { github: '@octocat' } }, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 200);
  const p = dump('people')[0];
  assert.equal(p.name, 'Pat Doe');
  assert.deepEqual(p.socials, { github: 'octocat' });
  const resp = dump('responses');
  assert.equal(resp.length, 1);
  assert.equal(resp[0].source, 'join');
  assert.equal(String(resp[0].personId), String(p._id));
});

test('an industry or researcher role without an affiliation is refused', async () => {
  const { db, dump } = fakeDb();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: { ...D_ANSWERS, role: 'industry' } } as never, '1.1.1.1', { db, viewer: null });
  assert.equal(r.status, 400);
  assert.match((r.body as { message: string }).message, /^Affiliation: /);
  assert.equal(dump('people').length, 0);
});

test('a failed response insert keeps the person and the reply unchanged', async () => {
  const { db, dump } = fakeDb();
  const logs: string[] = [];
  const ok = await handleJoin({ email: 'b@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.2', { db, viewer: null });
  db.failNextWriteTo('responses', new Error('mongo down'));
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null, log: (m) => logs.push(m) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, ok.body);
  assert.ok(dump('people').some((p) => p.email === 'a@b.co'));
  assert.match(logs.join(' '), /response insert failed for person/);
  assert.ok(!logs.join(' ').includes('a@b.co'), 'log lines carry the person id, never the email');
});

const S_ANSWERS = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord', dataTypes: ['pbp'], packages_r: ['cfbfastR'] };

test('/survey now requires an email and identity', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(r.status, 400);
  assert.equal(dump('people').length, 0);
});

test('/survey stores an identified person and a survey response', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ email: 'S@B.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(r.status, 200);
  const p = dump('people')[0];
  assert.equal(p.email, 's@b.co');
  assert.equal(p.status, 'survey');
  assert.equal(dump('responses')[0].source, 'survey');
});

// M6(b): the response doc was only ever checked for `source` — pin the rest too,
// so a future change that stores the wrong personId or drops/mangles the
// submitted identity/answers on the way into `responses` is caught here.
test('/survey response document carries the submitted identity, answers and personId', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(r.status, 200);
  const p = dump('people')[0];
  const resp = dump('responses')[0];
  assert.equal(resp.source, 'survey');
  assert.equal(String(resp.personId), String(p._id));
  assert.deepEqual(resp.identity, IDENTITY);
  assert.deepEqual(resp.answers, S_ANSWERS);
});

test('/survey replies identically for a new and a known email', async () => {
  const { db } = fakeDb();
  const first = await handleSurvey({ email: 's@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  const again = await handleSurvey({ email: 's@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.2', { db });
  const other = await handleSurvey({ email: 't@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.3', { db });
  assert.deepEqual(again, first);
  assert.deepEqual(other, first);
});

test('/survey for a /join person keeps their Discord request', async () => {
  const { db, dump } = fakeDb();
  await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.1', { db, viewer: null });
  await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.2', { db });
  const p = dump('people')[0];
  assert.equal(dump('people').length, 1);
  assert.equal((p.wants as { discord: boolean }).discord, true);
  assert.equal(p.status, 'pending');
  assert.equal(dump('responses').length, 2);
});

// --- I1: /survey then an unvouched /join asking for Discord must reach the queue ---

test('a /survey respondent who later asks for Discord on /join is queued, not stuck as "survey"', async () => {
  const { db, dump } = fakeDb();
  await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(dump('people')[0].status, 'survey');

  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.2', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv, viewer: null,
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /on file/i);
  assert.equal(dump('people')[0].status, 'pending', 'no longer stuck at "survey" — the queue can see them');
  const queue = await listPeople(db, { status: 'pending', wantsDiscord: true });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].email, 'a@b.co');
});

test('a /survey respondent who is then a VOUCHED /join is admitted on the spot, not left at "survey"', async () => {
  const { db, dump } = fakeDb();
  await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db });
  assert.equal(dump('people')[0].status, 'survey');

  const d = discordFake();
  const r = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.2', {
    db, resendApiKey: 'k', fetchImpl: d.fetchImpl, ...discordEnv,
    viewer: { login: 'octocat', isOrgMember: true, isContributor: false },
  });
  assert.equal(r.status, 200);
  assert.match(r.body.message, /discord\.gg\/inv123/);
  const [p] = dump('people');
  assert.equal(p.status, 'auto', 'the vouch still wins — never left at "survey"');
  assert.equal((p.discord as { code: string }).code, 'inv123');
});

test('the queued reply for a promoted survey respondent is identical to a brand-new unvouched /join (oracle rule)', async () => {
  const { db: db1 } = fakeDb();
  await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db: db1 });
  const promoted = await handleJoin({ email: 'a@b.co', identity: IDENTITY, answers: D_ANSWERS }, '1.1.1.2', {
    db: db1, resendApiKey: 'k', fetchImpl: discordFake().fetchImpl, ...discordEnv, viewer: null,
  });

  const { db: db2 } = fakeDb();
  const fresh = await handleJoin({ email: 'z@b.co', identity: IDENTITY, answers: D_ANSWERS }, '2.2.2.2', {
    db: db2, resendApiKey: 'k', fetchImpl: discordFake().fetchImpl, ...discordEnv, viewer: null,
  });
  assert.equal(promoted.body.message, fresh.body.message);
  assert.equal(promoted.status, fresh.status);
});

// T3-M1: the only server-side guard for this spec rule on /survey had no test —
// deleting the `affiliationError` check in handleSurvey stayed green before this.
test('/survey: an industry or researcher role without an affiliation is refused', async () => {
  const { db, dump } = fakeDb();
  const r = await handleSurvey({ email: 'a@b.co', identity: IDENTITY, answers: { ...S_ANSWERS, role: 'industry' } }, '1.1.1.1', { db });
  assert.equal(r.status, 400);
  assert.match((r.body as { message: string }).message, /^Affiliation: /);
  assert.equal(dump('people').length, 0);
  assert.equal(dump('responses').length, 0);
});

// M6(a): promoteSurveyRespondent is issued unconditionally on every /join —
// refactoring it to run only `if (existing?.status === "survey")` is a no-op
// for behavior (the filter in the update already makes it a no-op for anyone
// else) but brings back a round-trip-count timing tell. Pin the write count
// on `people` instead of the visible outcome, since the outcome is identical
// either way.
test('promoteSurveyRespondent write count is the same for a brand-new /join and one that finds an existing survey row', async () => {
  const { db: freshDb } = fakeDb();
  const fresh = await handleJoin({ email: 'fresh@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.1', { db: freshDb, viewer: null });
  assert.equal(fresh.status, 200);
  const freshWrites = freshDb.writes('people');

  const { db: surveyDb } = fakeDb();
  await handleSurvey({ email: 'was-survey@b.co', identity: IDENTITY, answers: S_ANSWERS }, '1.1.1.1', { db: surveyDb });
  const before = surveyDb.writes('people');
  const promoted = await handleJoin({ email: 'was-survey@b.co', identity: IDENTITY, answers: D_ANSWERS } as never, '1.1.1.2', { db: surveyDb, viewer: null });
  assert.equal(promoted.status, 200);
  const promotedWrites = surveyDb.writes('people') - before;

  assert.equal(promotedWrites, freshWrites, 'the same number of `people` writes whatever status was stored before /join');
});
