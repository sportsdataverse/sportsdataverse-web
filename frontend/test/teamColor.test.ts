import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD, CHART_FALLBACK, contrast, deltaE, normalizeHex, pickTeamColors } from '../lib/platform/teamColor.ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(frontendRoot, 'styles/globals.css'), 'utf8');

test('CARD mirrors the --card token of each theme', () => {
  const root = css.slice(css.indexOf(':root {'));
  const dark = css.slice(css.indexOf('.dark {'));
  assert.equal(root.match(/--card: (#[0-9a-f]{6});/)?.[1], CARD.light);
  assert.equal(dark.match(/--card: (#[0-9a-f]{6});/)?.[1], CARD.dark);
});

test('CHART_FALLBACK mirrors --chart-cat-1/2/3 of each theme', () => {
  const root = css.slice(css.indexOf(':root {'));
  const dark = css.slice(css.indexOf('.dark {'));
  for (const [sel, body] of [['light', root], ['dark', dark]] as const) {
    for (const [i, slot] of ['cat-1', 'cat-2', 'cat-3'].entries()) {
      const hex = body.match(new RegExp(`--chart-${slot}: (#[0-9a-f]{6});`))?.[1];
      assert.equal(CHART_FALLBACK[sel][i], hex, `${sel} ${slot}`);
    }
  }
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
  // both unusable → categorical slot 1, returned as a hex, never a token reference
  assert.equal(pickTeamColors({ color: 'ffffff', alt: 'fafafa' }, { color: 'ba0c2f' }, 'light').home, '#2a78d6');
});

test('two near-identical team colours: the away team steps aside', () => {
  // crimson vs crimson: away tries its alternate, then the fallback walk
  const alt = pickTeamColors({ color: '9e1b32' }, { color: '9d2235', alt: '00205b' }, 'light');
  assert.equal(alt.away, '#00205b');
  // no alt: away walks cat-1/cat-2/cat-3 same as home would, first that
  // clears contrast + 15 dE from home's crimson is cat-1 (dE 31.0)
  const slot = pickTeamColors({ color: '9e1b32' }, { color: '9d2235' }, 'light');
  assert.equal(slot.away, '#2a78d6');
});

test('the dark card is judged on its own surface', () => {
  // navy is fine on white, illegible on the dark card → falls to its alternate
  assert.equal(pickTeamColors({ color: '00274c', alt: 'ffcb05' }, { color: 'ba0c2f' }, 'dark').home, '#ffcb05');
});

// --- Finding 1 repro cases (each fails on the pre-fix pickTeamColors) ---

test('repro: a fallback slot is checked for separation like any other candidate', () => {
  // home unusable -> falls to cat-1 (#2a78d6). Away's own colour (#2a70d0) is
  // only 2.2 dE from that cat-1 -- too close to keep, even though the OLD
  // code never checked a fallback's dE at all. Away must step past it to the
  // next candidate that clears 15 dE (cat-2, dE 34.2).
  const r = pickTeamColors({ color: 'ffffff', alt: 'fafafa' }, { color: '2a70d0' }, 'light');
  assert.equal(r.home, '#2a78d6');
  assert.notEqual(r.away, '#2a70d0');
  assert.ok(deltaE(r.away, r.home) >= 15, `away ${r.away} too close to home ${r.home}`);
  assert.equal(r.away, '#eb6834');
});

test('repro: an unusable away does not default straight to cat-2 regardless of home', () => {
  // Illinois orange home (#e84a27, legible, no fallback needed) + away
  // unusable. The OLD code always fell back to a bare cat-2 (#eb6834), which
  // is only 5.4 dE from Illinois orange. The fallback walk must reject that
  // and land on cat-1 (dE 34.3) instead.
  const r = pickTeamColors({ color: 'e84a27' }, { color: 'ffffff', alt: 'fafafa' }, 'light');
  assert.equal(r.home, '#e84a27');
  assert.notEqual(r.away, '#eb6834');
  assert.ok(deltaE(r.away, r.home) >= 15, `away ${r.away} too close to home ${r.home}`);
  assert.equal(r.away, '#2a78d6');
});

test('repro: Texas burnt orange home also rejects the cat-2 default (9.8 dE)', () => {
  const r = pickTeamColors({ color: 'bf5700' }, { color: 'ffffff', alt: 'fafafa' }, 'light');
  assert.equal(r.home, '#bf5700');
  assert.notEqual(r.away, '#eb6834');
  assert.ok(deltaE(r.away, r.home) >= 15, `away ${r.away} too close to home ${r.home}`);
  assert.equal(r.away, '#2a78d6');
});
