import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineVars } from '../lib/platform/svgExport.ts';

// What getComputedStyle(...).getPropertyValue(name) returns: "" for an unset name.
const vars: Record<string, string> = { '--color-primary': '#4fb6e8', '--card': '#111b2e' };
const resolve = (name: string) => vars[name] ?? '';

test('inlineVars substitutes the resolved value', () => {
  assert.equal(inlineVars('fill: var(--color-primary)', resolve), 'fill: #4fb6e8');
  assert.equal(inlineVars('stroke:var( --card )', resolve), 'stroke:#111b2e');
});

test('inlineVars resolves every var() in a serialized SVG, attributes and styles alike', () => {
  assert.equal(
    inlineVars('<rect fill="var(--color-primary)" style="stroke: var(--card)"/>', resolve),
    '<rect fill="#4fb6e8" style="stroke: #111b2e"/>'
  );
});

test('inlineVars: an unset variable takes its fallback, a set one ignores it', () => {
  assert.equal(inlineVars('fill: var(--missing, #fff)', resolve), 'fill: #fff');
  assert.equal(inlineVars('fill: var(--missing,rgb(1 2 3))', resolve), 'fill: rgb(1 2 3)');
  assert.equal(inlineVars('fill: var(--color-primary, #fff)', resolve), 'fill: #4fb6e8');
});

test('inlineVars: nested fallbacks resolve to any depth', () => {
  assert.equal(inlineVars('fill: var(--a, var(--card))', resolve), 'fill: #111b2e');
  assert.equal(inlineVars('fill: var(--a, var(--b, var(--color-primary)))', resolve), 'fill: #4fb6e8');
  assert.equal(inlineVars('fill: var(--color-primary, var(--card))', resolve), 'fill: #4fb6e8');
});

test('inlineVars leaves an unset variable with no fallback as it was', () => {
  assert.equal(inlineVars('fill: var(--missing)', resolve), 'fill: var(--missing)');
  assert.equal(inlineVars('fill: var(--a, var(--missing))', resolve), 'fill: var(--missing)');
});

test('inlineVars terminates on a resolver that answers with a var()', () => {
  assert.equal(inlineVars('fill: var(--loop)', () => 'var(--loop)'), 'fill: var(--loop)');
  // A growing answer never reaches a fixed point: the pass bound stops it.
  const out = inlineVars('fill: var(--grow)', () => 'x var(--grow)');
  assert.ok(out.startsWith('fill: x x ') && out.endsWith('var(--grow)'), out);
});
