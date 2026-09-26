import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD, contrast, deltaE, normalizeHex, pickTeamColors } from '../lib/platform/teamColor.ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(frontendRoot, 'styles/globals.css'), 'utf8');

test('CARD mirrors the --card token of each theme', () => {
  const root = css.slice(css.indexOf(':root {'));
  const dark = css.slice(css.indexOf('.dark {'));
  assert.equal(root.match(/--card: (#[0-9a-f]{6});/)?.[1], CARD.light);
  assert.equal(dark.match(/--card: (#[0-9a-f]{6});/)?.[1], CARD.dark);
});

test('ESPN colours arrive without the hash and in any case', () => {
  assert.equal(normalizeHex('BA0C2F'), '#ba0c2f');
  assert.equal(normalizeHex('#fff'), null); // short form is not a team colour we trust
  assert.equal(normalizeHex(null), null);
  assert.equal(normalizeHex('zzzzzz'), null);
});

test('contrast and deltaE agree with known values', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(deltaE('#2a78d6', '#2a78d6'), 0);
  assert.ok(deltaE('#000000', '#ffffff') > 99);
});

test('both team colours survive when they are legible and distinct', () => {
  // Georgia red vs Alabama crimson would collide; Georgia red vs Michigan navy does not.
  const r = pickTeamColors({ color: 'BA0C2F', alt: '000000' }, { color: '00274C', alt: 'FFCB05' }, 'light');
  assert.deepEqual(r, { home: '#ba0c2f', away: '#00274c' });
});

test('a colour too faint for the surface falls to the alternate, then to a slot', () => {
  // white primary on the light card fails 3:1 → the alternate navy is used
  assert.equal(pickTeamColors({ color: 'ffffff', alt: '0c2340' }, { color: 'ba0c2f' }, 'light').home, '#0c2340');
  // both unusable → categorical slot 1
  assert.equal(pickTeamColors({ color: 'ffffff', alt: 'fafafa' }, { color: 'ba0c2f' }, 'light').home, 'var(--color-chart-cat-1)');
});

test('two near-identical team colours: the away team steps aside', () => {
  // crimson vs crimson: away tries its alternate, then slot 2
  const alt = pickTeamColors({ color: '9e1b32' }, { color: '9d2235', alt: '00205b' }, 'light');
  assert.equal(alt.away, '#00205b');
  const slot = pickTeamColors({ color: '9e1b32' }, { color: '9d2235' }, 'light');
  assert.equal(slot.away, 'var(--color-chart-cat-2)');
});

test('the dark card is judged on its own surface', () => {
  // navy is fine on white, illegible on the dark card → falls to its alternate
  assert.equal(pickTeamColors({ color: '00274c', alt: 'ffcb05' }, { color: 'ba0c2f' }, 'dark').home, '#ffcb05');
});
