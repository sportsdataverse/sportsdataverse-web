import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  DIMENSIONS, parseCommunityQuery, matches, paginate, aggregate, crossTab, labelOf, dimension, freeValueOptions, countryName, PAGE_SIZE,
  type CommunityPerson,
} from '../lib/community.ts';

const T = (d: string) => new Date(`${d}T12:00:00Z`);
const person = (over: Partial<CommunityPerson> = {}): CommunityPerson => ({
  _id: new ObjectId(), email: 'a@b.co', name: 'Pat Doe', status: 'pending',
  wants: { discord: true, newsletter: false, stickers: false, package: false },
  answers: { role: 'developer', languages: ['R', 'Python'], sports: ['NBA'] },
  location: { country: 'US', region: 'TX', city: 'Austin' },
  affiliations: [{ type: 'media', org: 'The Ringer' }],
  socials: { github: 'octocat' },
  createdAt: T('2026-09-01'), updatedAt: T('2026-09-01'), lastSubmittedAt: T('2026-09-20'),
  latestSource: 'join', identityChanged: false,
  ...over,
} as CommunityPerson);
const q = (s: string) => parseCommunityQuery(new URLSearchParams(s));

test('every closed-list question is a dimension, plus the identity and state dimensions', () => {
  const keys = DIMENSIONS.map((d) => d.key);
  for (const k of ['q.role', 'q.languages', 'q.sports', 'q.discoveredVia', 'q.wants_discord', 'affiliation', 'country', 'region', 'source', 'wants', 'discordStatus', 'identified', 'test', 'dnc']) {
    assert.ok(keys.includes(k), k);
  }
});

test('the query parser keeps only allowlisted keys and known option values', () => {
  const r = q('f.q.role=developer&f.q.role=nope&f.bogus=1&f.country=US&q=%20ringer%20&page=2&x=q.role&y=hax&from=2026-09-01&to=bad');
  assert.deepEqual(r.filters, { 'q.role': ['developer'], country: ['US'] });
  assert.equal(r.q, 'ringer');
  assert.equal(r.page, 2);
  assert.equal(r.x, 'q.role');
  assert.equal(r.y, undefined);
  assert.equal(r.from, '2026-09-01');
  assert.equal(r.to, undefined);
  assert.equal(q('page=-3').page, 1);
  assert.equal(q('page=abc').page, 1);
});

test('filters: OR within a dimension, AND across dimensions', () => {
  const p = person();
  assert.equal(matches(p, q('f.q.languages=Python&f.q.languages=JS')), true, 'multi-choice includes any');
  assert.equal(matches(p, q('f.q.languages=JS')), false);
  assert.equal(matches(p, q('f.q.role=developer&f.country=GB')), false, 'AND across');
  assert.equal(matches(p, q('f.region=US:TX')), true);
  assert.equal(matches(p, q('f.affiliation=media')), true);
  assert.equal(matches(p, q('f.wants=discord')), true);
  assert.equal(matches(p, q('f.discordStatus=pending')), true);
  assert.equal(matches(p, q('f.dnc=no')), true);
  assert.equal(matches(person({ doNotContact: { at: T('2026-09-21'), by: 'admin' } }), q('f.dnc=no')), false);
});

test('search is case-insensitive over name, email, city, organization and handles — and treats null as absent', () => {
  assert.equal(matches(person(), q('q=RINGER')), true);
  assert.equal(matches(person(), q('q=octo')), true);
  assert.equal(matches(person(), q('q=austin')), true);
  assert.equal(matches(person(), q('q=nobody')), false);
  const nulls = person({ name: null as never, socials: null as never, location: { country: 'GB', city: null } as never, affiliations: null as never });
  assert.equal(matches(nulls, q('q=null')), false, 'a null field never matches the text "null"');
  assert.equal(matches(nulls, q('q=a@b')), true);
});

test('date range filters on the latest submission day, falling back to createdAt', () => {
  assert.equal(matches(person(), q('from=2026-09-20')), true);
  assert.equal(matches(person(), q('from=2026-09-21')), false);
  assert.equal(matches(person({ lastSubmittedAt: undefined }), q('to=2026-09-01')), true);
});

test('a legacy anonymous row matches only the dimensions it has', () => {
  const legacy = person({ email: undefined, name: undefined, location: undefined, affiliations: undefined, socials: undefined,
    status: 'survey', wants: { discord: false, newsletter: false, stickers: false, package: false }, latestSource: 'survey' });
  assert.equal(matches(legacy, q('f.identified=anonymous')), true);
  assert.equal(matches(legacy, q('f.country=US')), false);
  assert.equal(matches(legacy, q('f.discordStatus=pending')), false, 'no Discord request, no Discord status');
});

test('paginate: newest submission first, 50 per page, clamps the page', () => {
  const many = Array.from({ length: 120 }, (_, i) => person({ lastSubmittedAt: new Date(Date.UTC(2026, 0, 1 + i)) }));
  const p1 = paginate(many, 1);
  assert.equal(p1.total, 120);
  assert.equal(p1.pages, 3);
  assert.equal(p1.rows.length, PAGE_SIZE);
  assert.ok(p1.rows[0].lastSubmittedAt! > p1.rows[1].lastSubmittedAt!);
  assert.equal(paginate(many, 99).page, 3);
  assert.equal(paginate([], 1).pages, 1);
});

test('aggregate counts a multi-choice answer once per option and skips people without it', () => {
  const agg = aggregate([person(), person({ answers: { role: 'student', languages: ['R'] } }), person({ answers: {} })]);
  const langs = agg.find((a) => a.key === 'q.languages')!.counts;
  assert.deepEqual(langs.map((c) => [c.value, c.count]), [['R', 2], ['Python', 1]]);
  const role = agg.find((a) => a.key === 'q.role')!.counts;
  assert.equal(role.reduce((s, c) => s + c.count, 0), 2, 'the person with no role is not counted');
  assert.equal(role.find((c) => c.value === 'developer')!.label, 'Developer / engineer');
});

test('labels: options, then regions by name, then the raw value', () => {
  assert.equal(labelOf(dimension('region')!, 'US:TX'), 'Texas');
  assert.equal(labelOf(dimension('affiliation')!, 'media'), 'Media or journalism');
  assert.equal(labelOf(dimension('country')!, 'GB'), 'GB');
});

test('source dimension has a newsletter option, so a newsletter-only signup labels correctly (M5)', () => {
  assert.equal(labelOf(dimension('source')!, 'newsletter'), 'Newsletter sign-up');
});

test('countryName resolves an ISO code to its display name — the one implementation every Community view shares', () => {
  assert.equal(countryName('US'), 'United States');
  assert.equal(countryName('GB'), 'United Kingdom');
});

test('freeValueOptions: only the option-less dimensions, and unaffected by which people are passed in', () => {
  const a = person();
  const b = person({ location: { country: 'GB', region: undefined, city: undefined } as never, answers: {} });
  const optsBoth = freeValueOptions([a, b]);
  assert.deepEqual(Object.keys(optsBoth).sort(), ['country', 'q.packages_python', 'q.packages_r', 'region']);
  assert.deepEqual(optsBoth.country.map((c) => c.value).sort(), ['GB', 'US']);
  // computed from everyone passed in — the caller decides "everyone" vs "the filtered hits" (I1)
  const optsOneOnly = freeValueOptions([a]);
  assert.deepEqual(optsOneOnly.country.map((c) => c.value), ['US']);
});

test('crossTab counts pairs, and refuses unknown or identical dimensions', () => {
  const t = crossTab([person(), person({ answers: { role: 'student', sports: ['NBA', 'CFB'] } })], 'q.role', 'q.sports')!;
  assert.deepEqual(t.cells.developer, { NBA: 1 });
  assert.deepEqual(t.cells.student, { NBA: 1, CFB: 1 });
  assert.equal(crossTab([person()], 'q.role', 'nope'), null);
  assert.equal(crossTab([person()], 'q.role', 'q.role'), null);
});
