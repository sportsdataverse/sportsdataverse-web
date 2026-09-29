// /platform/query: a 10,000-row result keeps only the rows in view (plus overscan) in the DOM,
// every row exactly its density's height, and the keyboard still reaches every row: Ctrl+End from
// the middle lands on the last row, focused and in view, Ctrl+Home comes back, and ArrowDown past the
// view scrolls the focused row exactly onto the box's bottom edge.
// Needs SDV_TRIGGER_KEY = a personal read-scope key on the local server.
// /platform is behind org sign-in, so this is recorded locally (see the PR's Walkthrough clip)
// and is NOT listed on the PR's `Walkthrough steps:` line.
const LINK = '/platform/query?schema=cfb&table=drives&season=2024&limit=10000';
const MAX_TRS = 90; // rows in view at the smallest density + 2 × overscan + 2 spacers, with room
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
      trs: grid.querySelectorAll('tbody tr').length,
      heights: [...new Set([...grid.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.getBoundingClientRect().height))],
      focused: cell ? Number(cell.dataset.cell.split('-')[0]) : null,
      visible: !!r && r.top >= bandTop - 1 && r.bottom <= bandBottom + 1,
      bottomGap: r ? bandBottom - r.bottom : null,
    };
  });

function assertWindow(s, where) {
  if (s.trs > MAX_TRS) throw new Error(`${where}: ${s.trs} rows in the DOM (> ${MAX_TRS})`);
  if (s.heights.length !== 1 || s.heights[0] !== ROW_H) throw new Error(`${where}: row heights ${s.heights}, not all ${ROW_H}px`);
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
  const firstShown = await grid.locator('tbody tr[data-row]').first().getAttribute('data-row');
  if (Math.abs(Number(firstShown) - total / 2) > 100) throw new Error(`middle shows row ${firstShown} of ${total}`);
  await page.waitForTimeout(600);

  // Ctrl+End from a cell in the middle: the last row, focused and in view
  const cell = grid.locator('tbody tr[data-row]').nth(15).locator('td[data-cell]').first();
  await cell.click();
  await page.keyboard.press('Control+End');
  await page.waitForFunction((n) => document.activeElement?.dataset?.cell?.startsWith(`${n}-`), total - 1, { timeout: 5_000 });
  const end = await snapshot(page);
  assertWindow(end, 'Ctrl+End');
  if (!end.visible) throw new Error('Ctrl+End: the last row is focused but out of view');
  await page.waitForTimeout(800);

  // Ctrl+Home: back to row 0, focused and in view
  await page.keyboard.press('Control+Home');
  await page.waitForFunction(() => document.activeElement?.dataset?.cell?.startsWith('0-'), null, { timeout: 5_000 });
  const home = await snapshot(page);
  assertWindow(home, 'Ctrl+Home');
  if (!home.visible) throw new Error('Ctrl+Home: row 0 is focused but out of view');
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
