import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleRange, WINDOW_MIN } from '../lib/platform/gridVirtual.ts';

const base = { scrollTop: 0, viewport: 512, rowHeight: 28, total: 10000, overscan: 10 };

test('visibleRange at the top: 19 rows in view + 10 overscan below, the rest a bottom pad', () => {
  assert.deepEqual(visibleRange(base), { start: 0, end: 29, padTop: 0, padBottom: 279188 });
});

test('visibleRange mid-list: overscan on both sides', () => {
  assert.deepEqual(visibleRange({ ...base, scrollTop: 28000 }), { start: 990, end: 1029, padTop: 27720, padBottom: (10000 - 1029) * 28 });
});

test(`visibleRange renders everything at ${WINDOW_MIN} rows or fewer`, () => {
  assert.deepEqual(visibleRange({ ...base, total: 150 }), { start: 0, end: 150, padTop: 0, padBottom: 0 });
  assert.deepEqual(visibleRange({ ...base, total: WINDOW_MIN, scrollTop: 2000 }), { start: 0, end: WINDOW_MIN, padTop: 0, padBottom: 0 });
  assert.equal(visibleRange({ ...base, total: WINDOW_MIN + 1 }).end, 29);
});

test('visibleRange clamps a scrollTop past the content (a filter just shrank the rows)', () => {
  const r = visibleRange({ ...base, total: 1000, scrollTop: 250_000 });
  // the last 19 rows in view, 10 overscan above; still a window, ending at the last row
  assert.deepEqual(r, { start: 1000 - 19 - 10, end: 1000, padTop: (1000 - 29) * 28, padBottom: 0 });
  // and a negative one (overscroll bounce) is the top
  assert.deepEqual(visibleRange({ ...base, scrollTop: -40 }), visibleRange(base));
});

test('visibleRange with no rows', () => {
  assert.deepEqual(visibleRange({ ...base, total: 0 }), { start: 0, end: 0, padTop: 0, padBottom: 0 });
});

test('visibleRange: pads + rendered rows always add up to the full list height', () => {
  let seed = 7;
  const rand = (n: number) => ((seed = (seed * 16807) % 2147483647) % n); // deterministic
  for (let i = 0; i < 2000; i++) {
    const rowHeight = [24, 28, 36][rand(3)];
    const input = { scrollTop: rand(400_000) - 1000, viewport: 1 + rand(900), rowHeight, total: rand(12_000), overscan: rand(20) };
    const { start, end, padTop, padBottom } = visibleRange(input);
    const where = JSON.stringify(input);
    assert.equal(padTop + (end - start) * rowHeight + padBottom, input.total * rowHeight, where);
    assert.ok(0 <= start && start <= end && end <= input.total, where);
    if (input.total) assert.ok(end > start, `empty window: ${where}`);
  }
});
