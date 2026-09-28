import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TRENDS_TEAMS, addTeam, spreadLabels } from '../lib/platform/trends.ts';
import { CATEGORICAL } from '../lib/platform/chartTokens.ts';

test('the overlay holds one team per categorical slot', () => {
  assert.equal(MAX_TRENDS_TEAMS, CATEGORICAL.length);
  assert.equal(MAX_TRENDS_TEAMS, 6);
});

test('addTeam appends, ignores a duplicate, and refuses a 7th pick instead of cycling', () => {
  assert.deepEqual(addTeam(['A'], 'B'), { teams: ['A', 'B'], refused: false });
  assert.deepEqual(addTeam(['A', 'B'], 'A'), { teams: ['A', 'B'], refused: false });
  const six = ['A', 'B', 'C', 'D', 'E', 'F'];
  assert.deepEqual(addTeam(six, 'G'), { teams: six, refused: true });
  assert.deepEqual(addTeam(six, 'C'), { teams: six, refused: false }); // already on: not a refusal
});

const GAP = 14;
/** Every pair of labels at least `gap` apart. */
function spaced(ys: number[], gap: number) {
  const s = [...ys].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] >= gap - 1e-9, `${s[i - 1]} and ${s[i]} overlap`);
}

test('spreadLabels leaves labels that already clear each other where their lines end', () => {
  assert.deepEqual(spreadLabels([10, 100, 200], GAP, 0, 240), [10, 100, 200]);
});

test('spreadLabels nudges colliding labels apart and keeps their top-to-bottom order', () => {
  const ys = [100, 105, 103, 104];
  const out = spreadLabels(ys, GAP, 0, 240);
  spaced(out, GAP);
  assert.equal(out[0], 100); // the topmost label stays on its line
  // the same order by y as the line ends: 0, 2, 3, 1
  assert.deepEqual([0, 1, 2, 3].sort((a, b) => out[a] - out[b]), [0, 2, 3, 1]);
});

test('spreadLabels keeps a crowd inside the plot: pushed up off the bottom, down off the top', () => {
  const bottom = spreadLabels([236, 238, 240], GAP, 0, 240);
  spaced(bottom, GAP);
  assert.deepEqual(bottom, [212, 226, 240]);
  const top = spreadLabels([-4, 2], GAP, 0, 240);
  assert.deepEqual(top, [0, 14]);
});

test('spreadLabels breaks a tie by series order', () => {
  assert.deepEqual(spreadLabels([50, 50, 50], GAP, 0, 240), [50, 64, 78]);
});
