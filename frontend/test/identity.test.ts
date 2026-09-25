import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identitySchema, affiliationError, withCountry, toIdentityPayload, socialLinks,
  EMPTY_IDENTITY_FORM, AFFILIATION_TYPES,
} from '../lib/identity.ts';
import { COUNTRY_CODES, SUBDIVISIONS } from '../content/geo.ts';

const BASE = { name: 'Pat Doe', location: { country: 'US', region: 'TX' } };
const parse = (x: unknown) => identitySchema.safeParse(x);
const firstMessage = (x: unknown) => { const r = parse(x); return r.success ? null : r.error.issues[0].message; };
const ok = (x: unknown) => { const r = parse(x); assert.ok(r.success, JSON.stringify(r.error?.issues)); return r.data!; };

test('geo lists: 250 countries, the three subdivision lists', () => {
  assert.equal(COUNTRY_CODES.length, 250);
  assert.ok(COUNTRY_CODES.includes('XK'));
  assert.ok(!COUNTRY_CODES.includes('UK'), 'UK is not an ISO code; GB is');
  assert.equal(SUBDIVISIONS.US.length, 52);
  assert.equal(SUBDIVISIONS.CA.length, 13);
  assert.equal(SUBDIVISIONS.AU.length, 8);
});

test('a minimal identity parses; country and region are upper-cased', () => {
  const r = parse({ name: ' Pat Doe ', location: { country: 'us', region: 'tx' } });
  assert.ok(r.success);
  assert.deepEqual(r.data, { name: 'Pat Doe', location: { country: 'US', region: 'TX' } });
});

test('name and country are required, with field-named messages', () => {
  assert.equal(firstMessage({ ...BASE, name: '   ' }), 'Name: required');
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'ZZ' } }), 'Country: pick one from the list');
});

test('region: required from the list for US/CA/AU, free text elsewhere', () => {
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'CA' } }), 'State / province: required for this country');
  assert.equal(firstMessage({ name: 'Pat', location: { country: 'AU', region: 'TX' } }), 'State / province: pick one from the list');
  const gb = parse({ name: 'Pat', location: { country: 'GB', region: 'Greater Manchester', city: 'Salford' } });
  assert.ok(gb.success);
  assert.deepEqual(gb.data.location, { country: 'GB', region: 'Greater Manchester', city: 'Salford' });
  const bare = parse({ name: 'Pat', location: { country: 'FR' } });
  assert.ok(bare.success, 'region optional outside US/CA/AU');
});

test('pasted profile URLs and @handles normalize to bare handles', () => {
  const r = parse({ ...BASE, socials: {
    github: 'https://github.com/OctoCat/', bluesky: '@Pat.bsky.social', x: 'https://twitter.com/SportsDataverse?s=20',
    linkedin: 'https://www.linkedin.com/in/pat-doe-123/?trk=x', website: 'example.com/me',
  } });
  assert.ok(r.success);
  assert.deepEqual(r.data.socials, {
    github: 'OctoCat', bluesky: 'pat.bsky.social', x: 'SportsDataverse', linkedin: 'pat-doe-123', website: 'https://example.com/me',
  });
});

test('junk socials are rejected with the field named', () => {
  assert.match(firstMessage({ ...BASE, socials: { github: 'not a handle!' } })!, /^GitHub: /);
  assert.match(firstMessage({ ...BASE, socials: { x: 'way_too_long_handle_here' } })!, /^X: /);
  assert.match(firstMessage({ ...BASE, socials: { website: 'javascript:alert(1)' } })!, /^Website: /);
  assert.match(firstMessage({ ...BASE, socials: { bluesky: 'nodot' } })!, /^Bluesky: /);
});

test('empty socials disappear rather than store empty strings', () => {
  const r = parse({ ...BASE, socials: { github: '  ', x: '' } });
  assert.ok(r.success);
  assert.equal(r.data.socials, undefined);
});

test('reserved site paths are rejected, not stored as a handle', () => {
  assert.match(firstMessage({ ...BASE, socials: { x: 'x.com/home' } })!, /^X: /);
  assert.match(firstMessage({ ...BASE, socials: { x: 'https://twitter.com/explore' } })!, /^X: /);
  assert.match(firstMessage({ ...BASE, socials: { github: 'github.com/settings/profile' } })!, /^GitHub: /);
  const r = parse({ ...BASE, socials: { x: 'x.com/Home_Team', github: 'github.com/settings-bot' } });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  assert.deepEqual(r.data.socials, { x: 'Home_Team', github: 'settings-bot' });
});

test('affiliations: typed, at most three, org required', () => {
  const ok = parse({ ...BASE, affiliations: [{ type: 'media', org: 'The Athletic', title: 'Writer' }] });
  assert.ok(ok.success);
  assert.equal(firstMessage({ ...BASE, affiliations: [{ type: 'media', org: ' ' }] }), 'Organization: required');
  assert.equal(firstMessage({ ...BASE, affiliations: [{ type: 'nope', org: 'X' }] }), 'Affiliation: pick a type');
  const four = Array.from({ length: 4 }, () => ({ type: 'other', org: 'X' }));
  assert.equal(firstMessage({ ...BASE, affiliations: four }), 'Affiliations: at most 3');
  assert.deepEqual([...AFFILIATION_TYPES], ['pro_team_league', 'college_athletics', 'media', 'academic', 'betting_fantasy', 'sports_tech', 'other']);
});

test('control and bidi characters are refused in free-text identity fields', () => {
  const rlo = String.fromCodePoint(0x202e);
  assert.match(firstMessage({ ...BASE, name: 'Pat' + rlo + 'x' })!, /^Name: /);
  assert.match(firstMessage({ ...BASE, location: { country: 'GB', city: 'a' + String.fromCodePoint(0) + 'b' } })!, /^City: /);
});

test('affiliation is required for industry and researcher roles only', () => {
  assert.match(affiliationError(ok(BASE), { role: 'industry' })!, /^Affiliation: /);
  assert.match(affiliationError(ok(BASE), { role: 'researcher' })!, /^Affiliation: /);
  assert.equal(affiliationError(ok(BASE), { role: 'student' }), null);
  const withAff = ok({ ...BASE, affiliations: [{ type: 'academic', org: 'NC State' }] });
  assert.equal(affiliationError(withAff, { role: 'researcher' }), null);
});

test('changing country clears the region (no stale US state for Canada)', () => {
  const f = { ...EMPTY_IDENTITY_FORM, country: 'US', region: 'TX' };
  assert.deepEqual(withCountry(f, 'CA'), { ...f, country: 'CA', region: '' });
});

test('toIdentityPayload drops blanks and untouched affiliation rows, and the result parses', () => {
  const payload = toIdentityPayload({
    ...EMPTY_IDENTITY_FORM, name: 'Pat', country: 'US', region: 'TX', city: '  ',
    socials: { ...EMPTY_IDENTITY_FORM.socials, github: 'octocat' },
    affiliations: [{ type: '', org: '', title: '' }, { type: 'media', org: 'The Ringer', title: '' }],
  });
  assert.deepEqual(payload, {
    name: 'Pat', location: { country: 'US', region: 'TX', city: undefined },
    socials: { github: 'octocat' }, affiliations: [{ type: 'media', org: 'The Ringer', title: undefined }],
  });
  assert.ok(parse(payload).success);
});

test('socialLinks builds profile URLs in a fixed order', () => {
  assert.deepEqual(socialLinks({ x: 'sdv', github: 'octocat', website: 'https://example.com/' }), [
    { key: 'github', label: 'GitHub', href: 'https://github.com/octocat' },
    { key: 'x', label: 'X', href: 'https://x.com/sdv' },
    { key: 'website', label: 'Website', href: 'https://example.com/' },
  ]);
  assert.deepEqual(socialLinks(undefined), []);
});
