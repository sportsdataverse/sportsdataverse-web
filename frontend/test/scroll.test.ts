import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealInScroller } from '../lib/platform/scroll.ts';

// A 448px play log at y=500 with a 1px border and a 32px sticky header; the
// fake row has no scrollIntoView, so calling it (and so moving the window) throws.
function scroller(rowTop: number, rowHeight = 28) {
  const box = {
    scrollTop: 1000,
    clientTop: 1,
    clientHeight: 448,
    getBoundingClientRect: () => ({ top: 500 }),
    querySelector: () => ({ offsetHeight: 32 }),
  };
  const row = { getBoundingClientRect: () => ({ top: rowTop, bottom: rowTop + rowHeight }) };
  revealInScroller(box as unknown as HTMLElement, row as unknown as HTMLElement);
  return box.scrollTop;
}

test('revealInScroller leaves a visible row alone', () => {
  assert.equal(scroller(600), 1000);
});

test('revealInScroller scrolls up so a row above sits just under the sticky header', () => {
  // view starts at 500 + 1 + 32 = 533
  assert.equal(scroller(400), 1000 - 133);
});

test('revealInScroller scrolls down so a row below sits on the bottom edge', () => {
  // view ends at 500 + 1 + 448 = 949; the row ends at 1028
  assert.equal(scroller(1000), 1000 + 79);
});
