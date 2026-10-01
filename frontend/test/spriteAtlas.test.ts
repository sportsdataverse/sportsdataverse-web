import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NFL_LOGO_ABBR, buildAtlas, headshotSrc, packFrames, teamLogoSrc } from '../lib/platform/spriteAtlas.ts';

test('packFrames lays ids out row-major in cell-sized squares', () => {
  assert.deepEqual(packFrames(['61', '333', '251'], 64, 2), {
    61: { x: 0, y: 0, w: 64, h: 64 },
    333: { x: 64, y: 0, w: 64, h: 64 },
    251: { x: 0, y: 64, w: 64, h: 64 },
  });
});

test('packFrames keeps the first slot for a duplicate id', () => {
  assert.deepEqual(packFrames(['61', '61'], 64, 4), { 61: { x: 0, y: 0, w: 64, h: 64 } });
});

test('packFrames stores "__proto__" as an own frame, not as the prototype', () => {
  const frames = packFrames(['__proto__', '61'], 64, 2);
  assert.ok(Object.hasOwn(frames, '__proto__'));
  // integer-like keys enumerate first, so compare as a set
  assert.deepEqual(Object.keys(frames).sort(), ['61', '__proto__']);
  assert.deepEqual(frames['61'], { x: 64, y: 0, w: 64, h: 64 });
});

test('packFrames refuses a grid narrower than one column', () => {
  assert.throws(() => packFrames(['61'], 64, 0), RangeError);
  assert.throws(() => packFrames(['61'], 64, Number.NaN), RangeError);
});

test('teamLogoSrc sizes through the combiner; NFL dark logos use the abbreviation path', () => {
  assert.equal(
    teamLogoSrc('cfb', '333', false, 64),
    'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/333.png&w=64&h=64',
  );
  assert.equal(
    teamLogoSrc('nfl', '8', true, 64),
    'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/det.png&w=64&h=64',
  );
  // no size: the plain CDN path; an NFL id outside the map falls back to light, never a dead dark URL
  assert.equal(teamLogoSrc('cfb', 251, true), 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/251.png');
  assert.equal(teamLogoSrc('nfl', 999, true), 'https://a.espncdn.com/i/teamlogos/nfl/500/999.png');
});

test('the NFL abbreviation map covers all 32 teams with distinct abbreviations', () => {
  assert.equal(Object.keys(NFL_LOGO_ABBR).length, 32);
  assert.equal(new Set(Object.values(NFL_LOGO_ABBR)).size, 32);
});

test('headshotSrc builds the combiner URL over the league headshot path', () => {
  assert.equal(
    headshotSrc('cfb', '4430870', { w: 96, h: 70 }),
    'https://a.espncdn.com/combiner/i?img=/i/headshots/college-football/players/full/4430870.png&w=96&h=70',
  );
  assert.equal(
    headshotSrc('nfl', '3139477', { w: 96, h: 70 }),
    'https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/3139477.png&w=96&h=70',
  );
});

test('buildAtlas is exported (browser-only; importing the module needs no DOM)', () => {
  assert.equal(typeof buildAtlas, 'function');
});

test('headshotSrc and teamLogoSrc cover the platform scatter sources: college hoops, NBA and WNBA', () => {
  const at = (dir: string, id: string) => `https://a.espncdn.com/combiner/i?img=/i/headshots/${dir}/players/full/${id}.png&w=48&h=48`;
  assert.equal(headshotSrc('mbb', '4917149', { w: 48, h: 48 }), at('mens-college-basketball', '4917149'));
  assert.equal(headshotSrc('wbb', '5318437', { w: 48, h: 48 }), at('womens-college-basketball', '5318437'));
  assert.equal(headshotSrc('nba', 1966, { w: 48, h: 48 }), at('nba', '1966'));
  assert.equal(headshotSrc('wnba', '869', { w: 48, h: 48 }), at('wnba', '869'));
  // MBB team ids share the NCAA logo path with CFB
  assert.equal(teamLogoSrc('mbb', '130', true, 48), 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500-dark/130.png&w=48&h=48');
});
