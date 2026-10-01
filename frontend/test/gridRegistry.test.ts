import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPreset, familyOrder, groupStarts, headerLabel, headerLabels, presetsFor } from '../lib/platform/gridRegistry.ts';
import { METRICS, resolveMetric } from '../lib/platform/metricRegistry.ts';
import { columnTip } from '../lib/platform/glossary.ts';

/** cfb.team_summaries 2025 as the Data API serves it (577 columns, captured 2026-10-01). */
const TEAM_SUMMARIES: string[] = JSON.parse(readFileSync(new URL('./fixtures/cfb-team_summaries-2025-columns.json', import.meta.url), 'utf8'));

// --- a 3-family stub registry: a1/a2 (A), b1 (B), c1/c2/c3 (C), each X with X_pct / X_rank siblings
const STUB: Record<string, { family: string; short: string; label: string }> = {
  a1: { family: 'A', short: 'A One', label: 'A one long' },
  a2: { family: 'A', short: 'A Two', label: 'A two long' },
  b1: { family: 'B', short: 'B One', label: 'B one long' },
  c1: { family: 'C', short: 'C One', label: 'C one long' },
  c2: { family: 'C', short: 'C Two', label: 'C two long' },
  c3: { family: 'C', short: 'C Three', label: 'C three long' },
  dup1: { family: 'C', short: 'Same', label: 'Same one' },
  dup2: { family: 'C', short: 'Same', label: 'Same two' },
};
const stub = (c: string) => {
  const m = /^(\w+?)(?:_(off|def|margin))?(?:_(pct|rank|n))?$/.exec(c);
  const e = m && STUB[m[1]];
  if (!e) return null;
  return { ...e, ...(m[2] ? { side: m[2] } : {}), ...(m[3] ? { suffix: `_${m[3]}` } : {}) };
};
const FAMILIES = ['A', 'B', 'C'];

test('familyOrder: first-appearance order of family over the registry values', () => {
  assert.deepEqual(familyOrder({ x: { family: 'q' }, y: { family: 'r' }, z: { family: 'q' } } as never), ['q', 'r']);
  const real = familyOrder();
  assert.equal(real[0], 'efficiency');
  assert.deepEqual(real, [...new Set(Object.values(METRICS).map((m) => m.family))]);
  assert.equal(real.length, 7);
});

test('presetsFor: families with >= 2 BASE columns, in registry order, each base with its siblings right after it', () => {
  // 2 of A, 1 of B (+ its _pct), 3 of C (+ one _pct far from its base)
  const cols = ['id', 'name', 'a1', 'b1', 'c1', 'c2', 'a2', 'c3', 'c1_pct', 'b1_pct'];
  const got = presetsFor(cols, stub, FAMILIES);
  assert.deepEqual(got.map((p) => p.family), ['A', 'C']);
  assert.deepEqual(got[0].columns, ['a1', 'a2']);
  assert.deepEqual(got[1].columns, ['c1', 'c1_pct', 'c2', 'c3']); // result order, the _pct after its base
  // one base plus its suffixed siblings is still one base: not a preset
  assert.deepEqual(presetsFor(['b1', 'b1_pct', 'b1_rank', 'b1_n'], stub, FAMILIES), []);
  // an X_rank whose X is not in the result keeps its place
  assert.deepEqual(presetsFor(['c2_rank', 'c1', 'c3'], stub, FAMILIES)[0].columns, ['c2_rank', 'c1', 'c3']);
  assert.deepEqual(presetsFor(['id', 'name'], stub, FAMILIES), []);
});

test('presetsFor over the live cfb.team_summaries columns: efficiency first, never a family with < 2 bases, siblings after their base', () => {
  const got = presetsFor(TEAM_SUMMARIES);
  assert.equal(got[0].family, 'efficiency');
  assert.ok(got.length >= 2);
  const famOrder = familyOrder();
  assert.deepEqual(got.map((p) => p.family), famOrder.filter((f) => got.some((p) => p.family === f)));
  for (const p of got) {
    const bases = p.columns.filter((c) => {
      const r = resolveMetric(c);
      return r && r.family === p.family && !r.suffix;
    });
    assert.ok(bases.length >= 2, `${p.family}: ${bases.length} bases`);
    for (const c of p.columns) assert.equal(resolveMetric(c)?.family, p.family, c);
    // every result column of the family is in the preset, once
    const all = TEAM_SUMMARIES.filter((c) => resolveMetric(c)?.family === p.family);
    assert.deepEqual([...p.columns].sort(), [...all].sort(), p.family);
  }
  const eff = got[0].columns;
  const at = (c: string) => eff.indexOf(c);
  assert.ok(at('EPAplay_off') >= 0);
  assert.equal(at('EPAplay_off_rank'), at('EPAplay_off') + 1);
  assert.equal(at('EPAplay_off_n'), at('EPAplay_off') + 2);
  assert.ok(at('EPAplay_def') > at('EPAplay_off_n'));
});

test('groupStarts: the first column of each family RUN over the DISPLAYED order; ids, names and text neither start nor break a run', () => {
  const displayed = ['name', 'a1', 'c1', 'team', 'c2', 'a2', 'c1_pct', 'id', 'b1', 'b1_pct'];
  assert.deepEqual([...groupStarts(displayed, stub)], [1, 2, 5, 6, 8]);
  // the same columns in their original order give different starts
  const original = ['id', 'name', 'a1', 'a2', 'b1', 'b1_pct', 'c1', 'c1_pct', 'c2', 'team'];
  assert.deepEqual([...groupStarts(original, stub)], [2, 4, 6]);
  assert.deepEqual([...groupStarts(['id', 'name'], stub)], []);
  assert.deepEqual([...groupStarts(['a1'], stub)], [0]);
});

test('headerLabel: short plus a side tag and the suffix; the title carries the long label and the raw column', () => {
  assert.deepEqual(headerLabel('EPAplay_off'), { text: 'EPA/Play Off', title: 'EPA/Play Off (EPAplay_off)' });
  assert.deepEqual(headerLabel('EPAplay_def'), { text: 'EPA/Play Def', title: 'EPA/Play Def (EPAplay_def)' });
  assert.notEqual(headerLabel('EPAplay_off').text, headerLabel('EPAplay_def').text);
  assert.deepEqual(headerLabel('success_margin_pct'), { text: 'SR% Margin pct', title: 'Success % Margin pct (success_margin_pct)' });
  assert.equal(headerLabel('EPAplay_off_pass_rank').text, 'EPA/DB Off rank');
  assert.equal(headerLabel('EPAplay').text, 'EPA/Play');
  assert.equal(headerLabel('EPAplay_off_n').text, 'EPA/Play Off n');
  // unresolved: the raw name and the glossary tip
  assert.deepEqual(headerLabel('team_games'), { text: 'team_games', title: columnTip('team_games') });
  assert.deepEqual(headerLabel('season'), { text: 'season', title: columnTip('season') });
});

test('headerLabels: two displayed columns with the same text both fall back to the raw name', () => {
  // the real registry: EPAplay_pass phases to "EPA/DB", which is EPAdropback's short
  assert.equal(headerLabel('EPAplay_pass').text, headerLabel('EPAdropback').text);
  const real = headerLabels(['team', 'EPAplay_pass', 'EPAdropback', 'success']);
  assert.deepEqual(real.map((h) => h.text), ['team', 'EPAplay_pass', 'EPAdropback', 'SR%']);
  assert.deepEqual(real[1], { text: 'EPAplay_pass', title: columnTip('EPAplay_pass') });
  // the stub: dup1 and dup2 share a short; the rest keep theirs
  const got = headerLabels(['dup1', 'a1', 'dup2'], stub);
  assert.deepEqual(got.map((h) => h.text), ['dup1', 'A One', 'dup2']);
  // sided twins never collide
  assert.deepEqual(headerLabels(['EPAplay_off', 'EPAplay_def', 'EPAplay_margin']).map((h) => h.text), ['EPA/Play Off', 'EPA/Play Def', 'EPA/Play Margin']);
});

test('applyPreset: the frozen column first (when there is one), then the preset columns by index; the rest hidden', () => {
  const cols = ['id', 'name', 'a1', 'b1', 'c1', 'c2', 'a2', 'c3', 'c1_pct'];
  assert.deepEqual(applyPreset(cols, 1, { columns: ['c1', 'c1_pct', 'c2', 'c3'] }), [1, 4, 8, 5, 7]);
  assert.deepEqual(applyPreset(cols, -1, { columns: ['a1', 'a2'] }), [2, 6]);
  // a preset column the result lacks, or the frozen one named again, is skipped
  assert.deepEqual(applyPreset(cols, 0, { columns: ['a1', 'gone', 'id', 'a2'] }), [0, 2, 6]);
});
