import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealInScroller } from '../lib/platform/scroll.ts';

// A 448px play log with a 1px border and a 32px sticky header, its top at
// `boxTop` in a viewport `innerHeight` tall; the fake row has no
// scrollIntoView, so calling it (and so moving the window) throws.
function scroller(rowTop: number, { boxTop = 500, innerHeight = 2000, rowHeight = 28 } = {}) {
  (globalThis as { window?: unknown }).window = { innerHeight };
  const box = {
    scrollTop: 1000,
    clientTop: 1,
    clientHeight: 448,
    getBoundingClientRect: () => ({ top: boxTop }),
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

// The PR #70 evidence: the log ran 91px past an 858px fold (it ends at 949).
test('revealInScroller: a row inside the log but below the fold is scrolled up onto the screen', () => {
  assert.equal(scroller(900, { innerHeight: 858 }), 1000 + 70); // row bottom 928 → 858
});

test('revealInScroller: a row below the log lands on the fold, not the log\'s off-screen bottom edge', () => {
  assert.equal(scroller(1000, { innerHeight: 858 }), 1000 + 170); // row bottom 1028 → 858
});

test('revealInScroller: with the log\'s top scrolled off the page, a row lands at the top of the screen', () => {
  // the sticky header scrolled away with the log's top (-200 + 1 + 32 = -167)
  assert.equal(scroller(-150, { boxTop: -200, innerHeight: 800 }), 1000 - 150);
});

test('revealInScroller: a band smaller than the row keeps the row top in view', () => {
  // only 10px of the log shows (533..543): align the row top, not its bottom
  assert.equal(scroller(560, { boxTop: 500, innerHeight: 543 }), 1000 + 27);
});

test('revealInScroller: a log entirely below the fold falls back to its own view', () => {
  assert.equal(scroller(1000, { boxTop: 900, innerHeight: 800 }), 1000);
  assert.equal(scroller(1400, { boxTop: 900, innerHeight: 800 }), 1000 + 79); // row bottom 1428 → 1349
});
