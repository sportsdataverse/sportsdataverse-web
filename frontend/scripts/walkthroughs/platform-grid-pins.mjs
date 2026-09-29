// /platform/ratings (NBA 2026): p pins the focused row, and the tray under the grid shows the
// pinned players side by side, one column each, in pin order. The pins ride in the URL as
// grid.pin=player_id:…, so a reload (and a re-sort before it) brings back the same three. z shows
// only the pinned rows and z again all of them, focus staying in the grid; the 9th pin is refused
// in the status bar. From 1280 px the rail beside the grid follows the hovered row and the focused
// one; at 390 px there is no rail, the tray scrolls inside itself and the page never sideways.
// Pinned rows keep the exact row height the windowed grid places rows by (platform-grid-virtual
// checks the unpinned rows). Then Query cfb.passing: pins by player_id, the tray shades a metric by
// its producer percentile, and its screen-reader text never widens the page.
// Keys go through page.keyboard (a locator.press refocuses its target first, which would hide a
// lost focus).
// /platform is behind org sign-in, so this is recorded locally (see the PR's Walkthrough clip)
// and is NOT listed on the PR's `Walkthrough steps:` line.
const LINK = '/platform/ratings?season=2026';

const steps = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const grid = page.getByRole('grid');
  const tray = page.getByRole('region', { name: 'Pinned rows' });
  const rail = page.getByRole('complementary', { name: 'Row detail' });
  const open = async (url) => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await grid.locator('tbody tr[data-row]').first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(400);
  };
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  };
  const state = () =>
    page.evaluate(() => {
      const g = document.querySelector('[role="grid"]');
      const heads = [...document.querySelectorAll('section[aria-label="Pinned rows"] thead th')].slice(1);
      return {
        total: Number(g.getAttribute('aria-rowcount')) - 1,
        tray: heads.map((th) => th.querySelector('span span').textContent.trim()),
        pin: new URL(location.href).searchParams.get('grid.pin'),
        inGrid: !!document.activeElement?.matches?.('[role="grid"] td[data-cell]'),
        status: g.closest('.flex-col').querySelector('[role="status"]').textContent,
        bar: g.closest('.flex-col').querySelector('.rounded-b-lg').innerText.toLowerCase(),
        heights: [...new Set([...g.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.getBoundingClientRect().height))],
      };
    });
  /** The player_name cell of view row r. */
  const nameAt = (r) => grid.locator(`tr[data-row="${r}"] td[data-cell="${r}-0"]`).innerText();
  const wide = page.viewportSize().width >= 1280;

  // pin rows 0, 2 and 3 with p: three tray columns, named as the grid names them, in pin order
  await open(base + LINK);
  const cols = await grid.locator('thead th').allInnerTexts();
  if (cols[1].trim().toLowerCase() !== 'player_name') fail(`the first column is ${cols[1]}, not player_name`);
  const picked = [await nameAt(0), await nameAt(2), await nameAt(3)];
  await grid.locator('td[data-cell="0-0"]').click();
  for (const k of ['p', 'ArrowDown', 'ArrowDown', 'p', 'ArrowDown', 'p']) await key(k);
  let s = await state();
  if (s.tray.join('|') !== picked.join('|')) fail(`tray columns ${s.tray} vs pinned ${picked}`);
  if (!/^player_id:\d+,\d+,\d+$/.test(s.pin ?? '')) fail(`grid.pin=${s.pin}`);
  if (!s.inGrid) fail('p moved the focus out of the grid');
  if (!s.bar.includes('3 pinned') || s.bar.includes('session only')) fail(`status bar: ${s.bar}`);
  if (await grid.locator('button[aria-pressed="true"]').count() !== 3) fail('three rows should carry the pinned marker');
  // the marker lives in the # cell: pinned rows keep the density's exact height (28 px by default)
  if (s.heights.length !== 1 || s.heights[0] !== 28) fail(`row heights ${s.heights} with pins, not all 28 px`);
  const pinUrl = s.pin;
  await page.waitForTimeout(800);

  // the rail (from 1280 px) follows the pointer, then the keyboard focus
  if (wide) {
    await grid.locator('tr[data-row="6"]').hover();
    await page.waitForTimeout(250);
    const hovered = await nameAt(6);
    if ((await rail.locator('p').first().innerText()) !== hovered) fail(`rail shows ${await rail.locator('p').first().innerText()}, not hovered ${hovered}`);
    await key('ArrowDown');
    const focused = await nameAt(4);
    if ((await rail.locator('p').first().innerText()) !== focused) fail(`rail shows ${await rail.locator('p').first().innerText()}, not focused ${focused}`);
    await page.waitForTimeout(800);
  } else if (await rail.isVisible()) fail('the rail shows below 1280 px');

  // re-sort by gp (s), then reload the copied URL: the same three, in the same order
  const gp = cols.findIndex((c) => c.trim().toLowerCase() === 'gp') - 1;
  await grid.locator(`td[data-cell="0-${gp}"]`).click();
  await key('s');
  s = await state();
  if (s.pin !== pinUrl || s.tray.join('|') !== picked.join('|')) fail(`a sort moved the pins: ${s.pin} ${s.tray}`);
  await page.waitForTimeout(600);
  await open(page.url());
  s = await state();
  if (s.pin !== pinUrl) fail(`reload: grid.pin=${s.pin}, not ${pinUrl}`);
  if (s.tray.join('|') !== picked.join('|')) fail(`reload: tray ${s.tray}, not ${picked}`);
  await tray.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // z: only the three pinned rows, focus kept; z again: every row
  const all = s.total;
  await grid.locator('td[data-cell="5-0"]').click();
  await key('z');
  s = await state();
  if (s.total !== 3) fail(`z shows ${s.total} rows, not 3`);
  if (!s.inGrid) fail('z moved the focus out of the grid');
  if (!s.bar.includes('pinned only')) fail(`status bar under z: ${s.bar}`);
  await page.waitForTimeout(800);
  await key('z');
  s = await state();
  if (s.total !== all || !s.inGrid) fail(`z again: ${s.total} rows of ${all}, focus in grid ${s.inGrid}`);

  // pin 5 more (8 in all), then a 9th: refused in the status bar, nothing dropped
  await key('Control+Home');
  for (let r = 0; r < 12 && (await state()).tray.length < 8; r++) {
    await key('ArrowDown');
    const pressed = await grid.locator(`tr[data-row="${r + 1}"] button[aria-pressed]`).getAttribute('aria-pressed');
    if (pressed === 'false') await key('p');
  }
  s = await state();
  if (s.tray.length !== 8) fail(`${s.tray.length} pinned, not 8`);
  await key('ArrowDown');
  await key('p');
  s = await state();
  if (s.tray.length !== 8 || s.pin.split(',').length !== 8) fail(`the 9th pin changed the pins: ${s.tray.length} / ${s.pin}`);
  if (!/8 rows pinned, the most/i.test(s.status)) fail(`no refusal in the status bar: "${s.status}"`);
  if (!s.inGrid) fail('the refused pin moved the focus');
  await page.waitForTimeout(1000);

  // 390 px: the tray scrolls inside itself; the page never scrolls sideways
  const [sw, cw, tw, tcw] = await page.evaluate(() => {
    const box = document.querySelector('section[aria-label="Pinned rows"] > div');
    return [document.documentElement.scrollWidth, document.documentElement.clientWidth, box.scrollWidth, box.clientWidth];
  });
  if (sw > cw) fail(`the page scrolls sideways (${sw} > ${cw})`);
  if (!wide && tw <= tcw) fail(`8 pinned at ${cw} px fit without scrolling the tray (${tw} <= ${tcw})`);
  await tray.scrollIntoViewIfNeeded();
  if (!wide) await tray.locator('div').first().evaluate((el) => el.scrollBy({ left: 400, behavior: 'smooth' }));
  await page.waitForTimeout(1200);

  // Query cfb.passing: pins by player_id there too, and a metric with a producer percentile is
  // shaded by it in the tray, its number in screen-reader text that must not widen the page
  await open(base + '/platform/query?schema=cfb&table=passing&season=2025&order=-TEPA&limit=50');
  await grid.locator('td[data-cell="0-0"]').click();
  for (const k of ['p', 'ArrowDown', 'p', 'ArrowDown', 'p']) await key(k);
  s = await state();
  if (s.tray.length !== 3 || !/^player_id:\d+,\d+,\d+$/.test(s.pin ?? '')) fail(`Query pins: ${s.tray} / ${s.pin}`);
  if (!(await tray.locator('td[style*="background-color"]').count())) fail('no tray cell is shaded by its percentile');
  const [qsw, qcw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (qsw > qcw) fail(`Query with pins: the page scrolls sideways (${qsw} > ${qcw})`);
  await tray.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
};
export default steps;
