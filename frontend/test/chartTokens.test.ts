import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORICAL, DIVERGING, SEQUENTIAL, ALL_PAIRS_CAP, chartVar, categoricalSlot, divergingSlot, sequentialSlot,
} from '../lib/platform/chartTokens.ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(frontendRoot, 'styles/globals.css'), 'utf8');
const design = fs.readFileSync(path.join(frontendRoot, '..', 'DESIGN.md'), 'utf8');

/** The body of the first `selector {` block in globals.css. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block missing`);
  return css.slice(start, css.indexOf('\n}', start));
}

test('every chart slot is a Tailwind colour token in a STATIC theme block', () => {
  // `static`: charts build these names at runtime (chartVar), which Tailwind's
  // source scan cannot see, so a plain @theme would drop the unused variables.
  const theme = block('@theme static inline');
  for (const slot of [...CATEGORICAL, ...DIVERGING, ...SEQUENTIAL]) {
    assert.match(theme, new RegExp(`--color-chart-${slot}:`), slot);
  }
});

test('hex-valued slots are declared for BOTH themes (light :root and .dark)', () => {
  for (const sel of [':root', '.dark']) {
    const b = block(sel);
    for (const slot of [...CATEGORICAL, 'div-mid']) {
      assert.match(b, new RegExp(`--chart-${slot}: #[0-9a-f]{6};`), `${sel} ${slot}`);
    }
  }
});

test('DESIGN.md lists every chart slot (extend the table first)', () => {
  for (const slot of [...CATEGORICAL, ...DIVERGING, ...SEQUENTIAL]) {
    assert.ok(design.includes(`chart-${slot}`), `DESIGN.md is missing chart-${slot}`);
  }
});

/**
 * Parses DESIGN.md's `| \`chart-cat-N\` | light | dark | role |` table rows
 * and returns the hex it declares for each theme, so doc and CSS can't drift.
 */
function designMdHex(slot: string): { light: string; dark: string } | null {
  const row = design.split('\n').find((l) => l.includes(`\`chart-${slot}\``));
  if (!row) return null;
  const hexes = [...row.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase());
  return hexes.length >= 2 ? { light: hexes[0], dark: hexes[1] } : null;
}

test("DESIGN.md's hex-valued chart slots match globals.css exactly (both themes)", () => {
  for (const sel of [':root', '.dark'] as const) {
    const b = block(sel);
    for (const slot of CATEGORICAL) {
      const fromDesign = designMdHex(slot);
      assert.ok(fromDesign, `DESIGN.md has no hex row for chart-${slot}`);
      const fromCss = b.match(new RegExp(`--chart-${slot}: (#[0-9a-f]{6});`))?.[1];
      const theme = sel === ':root' ? 'light' : 'dark';
      assert.equal(fromDesign![theme], fromCss, `chart-${slot} ${theme}: DESIGN.md vs globals.css`);
    }
  }
});

test('chartVar names the Tailwind token', () => {
  assert.equal(chartVar('cat-1'), 'var(--color-chart-cat-1)');
});

test('categorical slots are assigned in fixed order and never cycle', () => {
  assert.deepEqual([0, 1, 5].map((i) => categoricalSlot(i)), ['cat-1', 'cat-2', 'cat-6']);
  assert.equal(categoricalSlot(6), null); // a 7th series folds into Other / facets
  assert.equal(ALL_PAIRS_CAP, 3);
  assert.equal(categoricalSlot(3, ALL_PAIRS_CAP), null); // scatter: first three only
});

test('diverging steps are symmetric, cut at the given thresholds, and polarity flips the side', () => {
  const cuts = [0.03, 0.06, 0.09] as const; // e.g. FG% vs league at that distance
  assert.equal(divergingSlot(0.01, cuts), 'div-mid');
  assert.equal(divergingSlot(0.03, cuts), 'div-pos-1');
  assert.equal(divergingSlot(0.07, cuts), 'div-pos-2');
  assert.equal(divergingSlot(0.2, cuts), 'div-pos-3');
  assert.equal(divergingSlot(-0.07, cuts), 'div-neg-2');
  assert.equal(divergingSlot(0.07, cuts, -1), 'div-neg-2'); // lower-is-better metric
  assert.equal(divergingSlot(Number.NaN, cuts), null); // null stays null
});

test('sequential steps clamp t into five bins', () => {
  assert.deepEqual([-1, 0, 0.19, 0.2, 0.5, 0.99, 1, 7].map(sequentialSlot), ['seq-1', 'seq-1', 'seq-1', 'seq-2', 'seq-3', 'seq-5', 'seq-5', 'seq-5']);
  assert.equal(sequentialSlot(Number.NaN), null);
});
