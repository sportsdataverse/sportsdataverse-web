import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPreset, bases, basesFor, familyOrder, groupStarts, headerLabel, headerLabels, nativeBasis, presetsFor, rebase, validOrder } from '../lib/platform/gridRegistry.ts';
import { compareCells } from '../lib/platform/viewState.ts';
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

test('validOrder: non-empty, distinct, in-range indices, any length up to the column count', () => {
  assert.equal(validOrder([0, 1, 2], 3), true);
  assert.equal(validOrder([2, 0], 3), true); // shorter: a preset's subset
  assert.equal(validOrder([1], 3), true);
  assert.equal(validOrder([], 3), false);
  assert.equal(validOrder([0, 0], 3), false); // a duplicate
  assert.equal(validOrder([0, 3], 3), false); // out of range
  assert.equal(validOrder([0, -1], 3), false);
  assert.equal(validOrder([0, 1, 2, 3], 3), false); // longer than the result (the last result's order)
  assert.equal(validOrder([0.5], 3), false);
});

// --- a registry with variants: yards (V) total / per_play / per_game, plays (W) total / per_game, comp (W) none
const VSTUB: Record<string, { family: string; short: string; label: string; variants: Record<string, string> }> = {
  yards: { family: 'V', short: 'Yds', label: 'Yards', variants: { total: 'yards', per_play: 'yardsplay', per_game: 'yardsgame' } },
  yardsplay: { family: 'V', short: 'Yds/Play', label: 'Yards per play', variants: { total: 'yards', per_play: 'yardsplay', per_game: 'yardsgame' } },
  yardsgame: { family: 'V', short: 'Yds/Game', label: 'Yards per game', variants: { total: 'yards', per_play: 'yardsplay', per_game: 'yardsgame' } },
  plays: { family: 'W', short: 'Plays', label: 'Plays', variants: { total: 'plays', per_game: 'playsgame' } },
  playsgame: { family: 'W', short: 'Plays/Game', label: 'Plays per game', variants: { total: 'plays', per_game: 'playsgame' } },
  comp: { family: 'W', short: 'Comp', label: 'Completions', variants: {} },
};
const vstub = (c: string) => {
  const m = /^(\w+?)(?:_(off|def|margin))?(?:_(pct|rank|n))?$/.exec(c);
  const e = m && VSTUB[m[1]];
  if (!e) return null;
  return { ...e, key: m[1], ...(m[2] ? { side: m[2] } : {}), ...(m[3] ? { suffix: `_${m[3]}` } : {}) };
};
const VBASES = ['total', 'per_play', 'per_game'];

test('bases: the union of variant names in first-appearance order', () => {
  assert.deepEqual(bases(), ['total', 'per_play', 'per_game', 'per_drive']);
  assert.deepEqual(bases(VSTUB), VBASES);
  assert.deepEqual(bases({ a: { variants: { per_game: 'ag', total: 'a' } }, b: { variants: { per_play: 'bp', total: 'b' } }, c: { variants: {} } }), ['per_game', 'total', 'per_play']);
});

test('nativeBasis: the basis an entry lists itself under; null without one, or unresolved', () => {
  assert.equal(nativeBasis('EPAplay'), 'per_play');
  assert.equal(nativeBasis('TEPA'), 'total');
  assert.equal(nativeBasis('plays'), 'total');
  assert.equal(nativeBasis('EPAdrive_off_pass'), 'per_drive');
  assert.equal(nativeBasis('success'), null);
  assert.equal(nativeBasis('team'), null);
  assert.equal(nativeBasis('yardsgame_def', vstub), 'per_game');
  assert.equal(nativeBasis('comp', vstub), null);
});

test('rebase: a sourced column keeps its name and place but shows its sibling; a native one is left alone', () => {
  const cols = ['id', 'yards', 'yardsplay', 'plays', 'comp', 'yards_pct'];
  const rows = [
    ['a', '100', '5.5', '20', '7', '80'],
    ['b', '30', '2.0', '15', '3', '20'],
    ['c', null, '9.9', '1', null, null],
  ];
  const got = rebase(cols, rows, 'per_play', vstub);
  assert.deepEqual(got.columns, cols);
  assert.deepEqual(got.rows.map((r) => r[1]), rows.map((r) => r[2])); // yards shows yardsplay
  assert.equal(got.sourced.get('yards'), 'yardsplay');
  assert.deepEqual(got.rows.map((r) => r[2]), rows.map((r) => r[2])); // yardsplay is native per_play: untouched
  assert.equal(got.sourced.has('yardsplay'), false);
  assert.equal(got.blanked.has('yardsplay'), false);
  // the ids and a suffixed column pass through untouched
  assert.deepEqual(got.rows.map((r) => r[0]), ['a', 'b', 'c']);
  assert.deepEqual(got.rows.map((r) => r[5]), ['80', '20', null]);
  assert.equal(got.sourced.has('yards_pct'), false);
  assert.equal(got.blanked.has('yards_pct'), false);
  assert.deepEqual([...got.sourced.keys()], ['yards']);
});

test('rebase: no variant under the basis (comp), or the variant without its sibling (plays, per_play), blanks the column', () => {
  const cols = ['id', 'yards', 'yardsplay', 'plays', 'comp'];
  const rows = [['a', '100', '5.5', '20', '7'], ['b', '30', '2.0', '15', '3']];
  const got = rebase(cols, rows, 'per_play', vstub);
  assert.deepEqual(got.rows.map((r) => r[4]), [null, null]); // comp has no variants: never silently its total
  assert.ok(got.blanked.has('comp'));
  assert.deepEqual(got.rows.map((r) => r[3]), [null, null]); // plays has variants, not per_play
  assert.ok(got.blanked.has('plays'));
  assert.deepEqual([...got.blanked], ['plays', 'comp']);
  // per_game: yards and yardsplay want yardsgame, which the result lacks; plays wants playsgame, also absent
  const game = rebase(cols, rows, 'per_game', vstub);
  assert.deepEqual([...game.blanked], ['yards', 'yardsplay', 'plays', 'comp']);
  assert.equal(game.sourced.size, 0);
  // with playsgame present, plays is sourced under per_game
  const withGame = rebase([...cols, 'playsgame'], rows.map((r) => [...r, '9']), 'per_game', vstub);
  assert.equal(withGame.sourced.get('plays'), 'playsgame');
  assert.deepEqual(withGame.rows.map((r) => r[3]), ['9', '9']);
});

test('rebase over the real registry: a sided column takes its sided sibling and never the other side (or the unsided one)', () => {
  const rows = [['A', '10', '0.2', '0.3', '0.25', '50'], ['B', '-4', '-0.1', '0.05', '0.0', '20']];
  const sided = rebase(['team', 'TEPA_off', 'EPAplay_off', 'EPAplay_def', 'EPAplay', 'EPAplay_pct'], rows, 'per_play');
  assert.equal(sided.sourced.get('TEPA_off'), 'EPAplay_off');
  assert.deepEqual(sided.rows.map((r) => r[1]), ['0.2', '-0.1']);
  assert.equal(sided.blanked.size, 0);
  const unsided = rebase(['team', 'TEPA_off', 'EPAplay', 'EPAplay_def'], rows, 'per_play');
  assert.ok(unsided.blanked.has('TEPA_off'), 'TEPA_off must not take EPAplay or EPAplay_def');
  assert.equal(unsided.sourced.has('TEPA_off'), false);
  assert.deepEqual(unsided.rows.map((r) => r[1]), [null, null]);
  // the phased form too: TEPA_off_pass <- EPAplay_off_pass
  assert.equal(rebase(['TEPA_off_pass', 'EPAplay_off_pass'], [], 'per_play').sourced.get('TEPA_off_pass'), 'EPAplay_off_pass');
  assert.ok(rebase(['TEPA_off_pass', 'EPAplay_off'], [], 'per_play').blanked.has('TEPA_off_pass'));
});

test('rebase: a suffixed column (X_pct, X_rank, X_n) passes through under every basis', () => {
  const cols = ['team', 'EPAplay_pct', 'TEPA_off_rank', 'EPAplay_off_n', 'EPAplay'];
  const rows = [['A', '90', '3', '400', '0.2']];
  for (const b of bases()) {
    const got = rebase(cols, rows, b);
    assert.deepEqual(got.rows[0].slice(1, 4), ['90', '3', '400'], b);
    for (const c of cols.slice(1, 4)) {
      assert.equal(got.sourced.has(c), false, `${c} under ${b}`);
      assert.equal(got.blanked.has(c), false, `${c} under ${b}`);
    }
  }
});

test("rebase: sorting the rebased rows with the grid's comparator orders by the displayed (sibling) values", () => {
  const cols = ['id', 'yards', 'yardsplay'];
  const rows = [['a', '300', '2.0'], ['b', '100', '9.0'], ['c', '200', '5.0']];
  const shown = rebase(cols, rows, 'per_play', vstub).rows;
  const byYards = [...shown].sort((x, y) => compareCells(x[1], y[1], 'desc'));
  assert.deepEqual(byYards.map((r) => r[0]), ['b', 'c', 'a']); // by yardsplay 9 > 5 > 2, not yards 300 > 200 > 100
  const native = [...rows].sort((x, y) => compareCells(x[1], y[1], 'desc'));
  assert.deepEqual(native.map((r) => r[0]), ['a', 'c', 'b']);
});

test('rebase: the native view (basis null) returns the input unchanged, same references', () => {
  const cols = ['id', 'yards', 'yardsplay'];
  const rows = [['a', '300', '2.0']];
  const got = rebase(cols, rows, null, vstub);
  assert.equal(got.rows, rows);
  assert.equal(got.columns, cols);
  assert.equal(got.sourced.size, 0);
  assert.equal(got.blanked.size, 0);
});

test('basesFor: the bases under which at least one column is sourced, in registry order', () => {
  assert.deepEqual(basesFor(['id', 'yards', 'yardsplay', 'plays', 'comp'], vstub, VBASES), ['total', 'per_play']);
  assert.deepEqual(basesFor(['id', 'yardsgame', 'plays', 'playsgame'], vstub, VBASES), ['total', 'per_game']);
  assert.deepEqual(basesFor(['id', 'yardsplay'], vstub, VBASES), []); // its only sibling-less column is native per_play
  assert.deepEqual(basesFor(['id', 'name'], vstub, VBASES), []);
  assert.deepEqual(basesFor(TEAM_SUMMARIES), ['total', 'per_play', 'per_game', 'per_drive']);
  assert.deepEqual(basesFor(['TEPA', 'EPAplay', 'EPAplay_pct']), ['total', 'per_play']);
  assert.deepEqual(basesFor(['season', 'level', 'entity', 'category', 'metric', 'mean', 'median', 'sd', 'n', 'qualifier_min']), []);
});
