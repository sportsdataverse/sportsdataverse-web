import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import { aggregatePopulation, loadPopulation } from '../lib/population.ts';
import { fetchMemberCount } from '../lib/discord.ts';
import { SPORTS, type Channel, type Role, type Language } from '../content/survey.ts';

const ROLES: Role[] = ['student', 'researcher', 'developer', 'hobbyist', 'industry', 'other'];
const LANGUAGES: Language[] = ['R', 'Python', 'JS', 'other'];
const CHANNELS: Channel[] = [
  'search', 'github', 'twitter', 'bluesky', 'discord', 'email', 'rss', 'conference', 'referral', 'youtube', 'other',
];
const STATUSES = ['pending', 'approved', 'declined', 'auto', 'survey'];

const profile = (o: Record<string, unknown> = {}) => ({
  role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['twitter'], newsChannel: 'email', ...o,
});
const person = (o: Record<string, unknown> = {}) => ({
  status: 'pending', wants: { discord: true, newsletter: true, package: false, stickers: false }, profile: profile(), ...o,
});

test('an empty database aggregates to zeroes and never throws', () => {
  const p = aggregatePopulation([]);
  assert.equal(p.totals.people, 0);
  assert.deepEqual(p.byRole, []);
  assert.deepEqual(p.funnel.discoveredVia, []);
  assert.equal(p.wants.discord, 0);
});

test('people without a profile are counted in the total but not the breakdowns', () => {
  const footerSignup = { status: 'pending', wants: { discord: false, newsletter: true, package: false, stickers: false } };
  const p = aggregatePopulation([footerSignup, person()] as never);
  assert.equal(p.totals.people, 2);
  assert.equal(p.totals.withProfile, 1);
  assert.deepEqual(p.byRole, [{ key: 'developer', count: 1 }]);
});

test('multi-answer questions count every answer, and results sort by count', () => {
  const p = aggregatePopulation([
    person({ profile: profile({ languages: ['R', 'Python'] }) }),
    person({ profile: profile({ languages: ['Python'] }) }),
  ] as never);
  assert.deepEqual(p.byLanguage, [{ key: 'Python', count: 2 }, { key: 'R', count: 1 }]);
});

test('the channel funnel is counted', () => {
  const p = aggregatePopulation([person(), person({ profile: profile({ discoveredVia: 'twitter' }) })] as never);
  assert.deepEqual(p.funnel.discoveredVia.map((c) => c.key).sort(), ['github', 'twitter']);
});

test('no identifying field ever appears in the output', () => {
  const p = aggregatePopulation([person({ email: 'secret@b.co', name: 'Secret Name', githubLogin: 'secretlogin' })] as never);
  const s = JSON.stringify(p);
  for (const leak of ['secret@b.co', 'Secret Name', 'secretlogin']) assert.equal(s.includes(leak), false);
});

test('a newsletter contact id and a skip reason never leave the aggregation either', () => {
  const p = aggregatePopulation([
    person({ newsletter: { resendContactId: 're_secret_contact', syncedAt: new Date() } }),
    person({ newsletter: { skipped: 'reserved-domain-secret' } }),
  ] as never);
  const s = JSON.stringify(p);
  assert.equal(s.includes('re_secret_contact'), false);
  assert.equal(s.includes('reserved-domain-secret'), false);
});

test('every category key belongs to the closed survey vocabulary, never free text', () => {
  const p = aggregatePopulation([
    person(),
    person({
      profile: profile({
        role: 'industry', languages: ['Python', 'JS'], sports: ['NBA'],
        discoveredVia: 'twitter', updatesVia: ['discord'], newsChannel: 'rss',
      }),
    }),
  ] as never);
  const keysOf = (counts: { key: string }[]) => counts.map((c) => c.key);
  for (const key of keysOf(p.byRole)) assert.ok((ROLES as string[]).includes(key), key);
  for (const key of keysOf(p.byLanguage)) assert.ok((LANGUAGES as string[]).includes(key), key);
  for (const key of keysOf(p.bySport)) assert.ok(SPORTS.includes(key), key);
  for (const key of keysOf(p.byStatus)) assert.ok(STATUSES.includes(key), key);
  for (const key of keysOf(p.funnel.discoveredVia)) assert.ok((CHANNELS as string[]).includes(key), key);
  for (const key of keysOf(p.funnel.updatesVia)) assert.ok((CHANNELS as string[]).includes(key), key);
  for (const key of keysOf(p.funnel.newsChannel)) assert.ok((CHANNELS as string[]).includes(key), key);
});

test('loadPopulation projects only status, wants, profile and newsletter, and reaches no real network', async () => {
  let capturedCollection: string | undefined;
  let capturedProjection: unknown;
  const stubDb = {
    collection(name: string) {
      capturedCollection = name;
      return {
        find(_filter: unknown, options?: { projection?: unknown }) {
          capturedProjection = options?.projection;
          return { async toArray() { return []; } };
        },
      };
    },
  } as unknown as Db;
  const noNetwork = (async () => {
    throw new Error('loadPopulation must not reach the network in a unit test');
  }) as unknown as typeof fetch;
  await loadPopulation(stubDb, { fetchImpl: noNetwork });
  assert.equal(capturedCollection, 'people');
  assert.deepEqual(capturedProjection, { status: 1, wants: 1, profile: 1, newsletter: 1 });
});

test('a non-object newsletter is skipped rather than thrown on, and an out-of-union shape counts in no bucket', () => {
  assert.doesNotThrow(() => aggregatePopulation([person({ newsletter: true })] as never));
  assert.doesNotThrow(() => aggregatePopulation([person({ newsletter: 'pending' })] as never));
  const p = aggregatePopulation([person({ newsletter: { confirmedAt: new Date() } })] as never);
  assert.equal(p.newsletter.synced + p.newsletter.pending + p.newsletter.skipped + p.newsletter.unsubscribed, 0);
});

test('newsletter states, sport, and package/sticker wants are counted exactly, not swapped', () => {
  // every count below is distinct from every other count in its group, so a
  // swap between two buckets (e.g. synced<->unsubscribed) changes the totals
  // instead of hiding behind two equal counts
  const now = new Date();
  const people = [
    person({ newsletter: { resendContactId: 'a', syncedAt: now } }), // synced
    person({ newsletter: { resendContactId: 'b', syncedAt: now } }), // synced
    person({ newsletter: { resendContactId: 'c', syncedAt: now, unsubscribed: true } }), // unsubscribed
    person({ newsletter: { pending: { sentAt: now } } }), // pending
    person({ newsletter: { pending: { sentAt: now } } }), // pending
    person({ newsletter: { pending: { sentAt: now } } }), // pending
    person({ newsletter: { skipped: 'reserved-domain' } }), // skipped
    person({ wants: { discord: false, newsletter: false, package: true, stickers: false } }),
    person({ wants: { discord: false, newsletter: false, package: true, stickers: false } }),
    person({ wants: { discord: false, newsletter: false, package: false, stickers: true } }),
    person({ profile: profile({ sports: ['MLB'] }) }),
    person({ profile: profile({ sports: ['MLB', 'NBA'] }) }),
  ] as never;
  const p = aggregatePopulation(people);
  assert.deepEqual(p.newsletter, { synced: 2, unsubscribed: 1, pending: 3, skipped: 1 });
  assert.equal(p.wants.package, 2);
  assert.equal(p.wants.stickers, 1);
  assert.deepEqual(p.bySport, [
    { key: 'CFB', count: 10 },
    { key: 'MLB', count: 2 },
    { key: 'NBA', count: 1 },
  ]);
});

test('byStatus is the Discord review funnel, not every pending signup', () => {
  const footer = () => ({ status: 'pending', wants: { discord: false, newsletter: true, package: false, stickers: false } });
  const discordReq = () => person({ status: 'pending' });
  const p = aggregatePopulation([footer(), footer(), footer(), discordReq(), discordReq()] as never);
  assert.deepEqual(p.byStatus, [{ key: 'pending', count: 2 }]);
});

test('the Discord member count is null when unconfigured or failing, never an error', async () => {
  // unconfigured means NO request: a recording fetch proves it, and keeps a unit
  // test from ever reaching Discord if the guard regresses
  const calls: string[] = [];
  const recording = (async (url: string | URL | Request) => { calls.push(String(url)); return new Response('{}', { status: 200 }); }) as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: undefined, guildId: undefined, fetchImpl: recording }), null);
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: undefined, fetchImpl: recording }), null);
  assert.equal(await fetchMemberCount({ botToken: undefined, guildId: 'g', fetchImpl: recording }), null);
  assert.equal(calls.length, 0, 'no request is made without both a token and a guild id');
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: boom }), null);
  const ok = (async () => new Response(JSON.stringify({ approximate_member_count: 412 }), { status: 200 })) as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: ok }), 412);
});
