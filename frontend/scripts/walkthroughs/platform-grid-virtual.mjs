// /platform/query: a 10,000-row result keeps only the rows in view (plus overscan) in the DOM,
// every row exactly its density's height (w/e: 24/28/36 px), and focus survives what moves rows:
// s (a sort) keeps the focused position, a wheel scroll keeps the focused row, e on a deep row keeps
// it in view. The keyboard still reaches every row: Ctrl+End from the middle lands on the last row,
// focused and in view, Ctrl+Home comes back, and ArrowDown past the view scrolls the focused row
// exactly onto the box's bottom edge. Keys go through page.keyboard (a locator.press refocuses
// its target first, which would hide a lost focus).
// Needs SDV_TRIGGER_KEY = a personal read-scope key on the local server.
// /platform is behind org sign-in, so this is recorded locally (see the PR's Walkthrough clip)
// and is NOT listed on the PR's `Walkthrough steps:` line.
const LINK = '/platform/query?schema=cfb&table=drives&season=2024&limit=10000';
const MAX_TRS = 90; // rows in view at the smallest density + 2 × overscan, the focused row, spacers, with room
const ROW_H = 28; // the default density

/** The grid's DOM row count, and where the focused cell sits in the box's visible band. */
const snapshot = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]');
    const box = grid.parentElement;
    const b = box.getBoundingClientRect();
    const bandTop = Math.max(grid.querySelector('thead').getBoundingClientRect().bottom, 0);
    const bandBottom = Math.min(b.top + box.clientTop + box.clientHeight, innerHeight);
    const cell = document.activeElement?.closest?.('[data-cell]');
    const r = cell?.getBoundingClientRect();
    return {
      inGrid: !!document.activeElement?.matches?.('[role="grid"] td[data-cell]'),
      trs: grid.querySelectorAll('tbody tr').length,
      heights: [...new Set([...grid.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.getBoundingClientRect().height))],
      focused: cell ? Number(cell.dataset.cell.split('-')[0]) : null,
      visible: !!r && r.top >= bandTop - 1 && r.bottom <= bandBottom + 1,
      bottomGap: r ? bandBottom - r.bottom : null,
    };
  });

function assertWindow(s, where, rowH = ROW_H) {
  if (s.trs > MAX_TRS) throw new Error(`${where}: ${s.trs} rows in the DOM (> ${MAX_TRS})`);
  if (s.heights.length !== 1 || s.heights[0] !== rowH) throw new Error(`${where}: row heights ${s.heights}, not all ${rowH}px`);
}

/** Focus is on a grid cell in view row `row`, visible in the box. */
function assertFocus(s, where, row) {
  if (!s.inGrid) throw new Error(`${where}: focus left the grid`);
  if (row != null && s.focused !== row) throw new Error(`${where}: row ${s.focused} focused, not ${row}`);
  if (!s.visible) throw new Error(`${where}: the focused row is out of view`);
}

const steps = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + LINK, { waitUntil: 'domcontentloaded' });
  const grid = page.getByRole('grid');
  await grid.locator('tbody tr[data-row]').first().waitFor({ timeout: 120_000 });
  const total = Number(await grid.getAttribute('aria-rowcount')) - 1;
  if (total < 10_000) throw new Error(`only ${total} rows; the check needs a 10,000-row result`);
  await grid.scrollIntoViewIfNeeded();
  assertWindow(await snapshot(page), 'top');
  await page.waitForTimeout(600);
  const key = async (k, settle = 250) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(settle);
    return snapshot(page);
  };

  // density: w is 24 px, e e is 36 px, w back to the default 28; the focused cell stays focused
  await grid.locator('td[data-cell="0-1"]').click();
  for (const [k, h] of [['w', 24], ['e', 28], ['e', 36], ['w', 28]]) {
    const s = await key(k);
    assertWindow(s, `density ${k}`, h);
    assertFocus(s, `density ${k}`, 0);
  }

  // s on row 0 sorts; the row that had focus moves (usually out of the window, unmounting), and
  // focus stays on row 0 of the new order: asc, desc, then back to unsorted
  const yards = await grid.locator('thead th').evaluateAll((ths) => ths.slice(1).findIndex((th) => th.textContent.trim() === 'yards'));
  await grid.locator(`td[data-cell="0-${yards}"]`).click();
  for (const pass of ['asc', 'desc', 'off']) {
    const s = await key('s', 400);
    assertWindow(s, `s (${pass})`);
    assertFocus(s, `s (${pass})`, 0);
  }

  // a wheel scroll far past the focused row keeps it focused (it stays mounted, out of view), and
  // the next arrow brings its neighbour into view
  const box = await grid.locator('xpath=..').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 30_000);
  await page.waitForFunction(() => document.querySelector('[role="grid"]').parentElement.scrollTop > 20_000, null, { timeout: 5_000 });
  await page.waitForTimeout(400);
  const wheeled = await snapshot(page);
  assertWindow(wheeled, 'wheel');
  if (!wheeled.inGrid || wheeled.focused !== 0) throw new Error(`wheel: focus moved to ${wheeled.focused} or left the grid`);
  assertFocus(await key('ArrowDown'), 'ArrowDown after the wheel', 1);
  await page.waitForTimeout(400);

  // scroll to the middle, in visible steps: the window follows, still ~40 rows in the DOM
  await page.evaluate(async () => {
    const box = document.querySelector('[role="grid"]').parentElement;
    const target = (box.scrollHeight - box.clientHeight) / 2;
    for (let i = 1; i <= 30; i++) {
      box.scrollTop = (target * i) / 30;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(400);
  const mid = await snapshot(page);
  assertWindow(mid, 'middle');
  const shownRows = (await grid.locator('tbody tr[data-row]').evaluateAll((trs) => trs.map((tr) => Number(tr.dataset.row))));
  const firstShown = Math.min(...shownRows.filter((r) => r !== mid.focused)); // the focused row stays mounted up top
  if (Math.abs(firstShown - total / 2) > 100) throw new Error(`middle shows row ${firstShown} of ${total}`);
  await page.waitForTimeout(600);

  // Ctrl+End from a cell in the middle: the last row, focused and in view
  await grid.locator('tbody tr[data-row]').nth(15).locator('td[data-cell]').first().click();
  const end = await key('Control+End');
  assertWindow(end, 'Ctrl+End');
  assertFocus(end, 'Ctrl+End', total - 1);
  await page.waitForTimeout(600);

  // e on the last row: taller rows move the window away from it at the same scrollTop, and the
  // grid scrolls it back into view, still focused; w restores the default
  const taller = await key('e', 400);
  assertWindow(taller, 'e on the last row', 36);
  assertFocus(taller, 'e on the last row', total - 1);
  const back = await key('w', 400);
  assertWindow(back, 'w on the last row');
  assertFocus(back, 'w on the last row', total - 1);
  await page.waitForTimeout(600);

  // Ctrl+Home: back to row 0, focused and in view
  const home = await key('Control+Home');
  assertWindow(home, 'Ctrl+Home');
  assertFocus(home, 'Ctrl+Home', 0);
  await page.waitForTimeout(600);

  // ArrowDown past the bottom of the view: the grid scrolls just enough, so the focused row sits on
  // the box's bottom edge (a slip of the header's height, placing rows from the wrong top, shows here)
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.activeElement?.dataset?.cell?.startsWith('25-'), null, { timeout: 5_000 });
  const down = await snapshot(page);
  if (Math.abs(down.bottomGap) > 1) throw new Error(`ArrowDown: row 25 sits ${down.bottomGap}px off the box's bottom edge`);
  await page.waitForTimeout(800);
};
export default steps;
