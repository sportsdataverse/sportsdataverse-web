import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePopulation } from '../lib/population.ts';
import { fetchMemberCount } from '../lib/discord.ts';

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

test('the Discord member count is null when unconfigured or failing, never an error', async () => {
  assert.equal(await fetchMemberCount({ botToken: undefined, guildId: undefined }), null);
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: boom }), null);
  const ok = (async () => new Response(JSON.stringify({ approximate_member_count: 412 }), { status: 200 })) as typeof fetch;
  assert.equal(await fetchMemberCount({ botToken: 't', guildId: 'g', fetchImpl: ok }), 412);
});
