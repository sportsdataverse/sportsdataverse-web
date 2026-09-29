// ResultsGrid pins, the comparison tray and the hover rail, on three results:
// - /platform/ratings (NBA 2026): p pins the focused row, the ⊕ in the # cell the clicked one
//   (focus and the one tab stop stay put), c the row under the pointer; the tray's ✕ unpins.
//   Ctrl+C / Ctrl+P / Ctrl+Z stay the browser's. The pins ride in the URL as grid.pin=player_id:…,
//   so a re-sort and a reload keep them, and a shared id the season lacks is reported, not
//   dropped unseen. z shows only the pinned rows, the focused row staying focused through z and
//   back; the 9th pin is refused; unpinning every row under z returns to all rows. From 1280 px
//   the rail follows the hovered and the focused row; at 390 px the tray scrolls inside itself.
//   Pinned rows keep the exact row height the windowed grid places rows by.
// - /platform/query cfb.passing: pins by player_id survive a re-sort and a filter, and a tray cell
//   is shaded exactly as its entity's X_pct cell says (pctTint, the grid's own function).
// - cfb.league_averages has no id column: pins are row numbers, this session only, and say so.
// Keys go through page.keyboard (a locator.press refocuses its target first, which would hide a
// lost focus). /platform is behind org sign-in, so this is recorded locally (see the PR's
// Walkthrough clip) and is NOT listed on the PR's `Walkthrough steps:` line.
import { pctScale, pctTint } from '../../lib/platform/scales.ts';

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
      const col = g.closest('.flex-col');
      const heads = [...document.querySelectorAll('section[aria-label="Pinned rows"] thead th')].slice(1);
      return {
        total: Number(g.getAttribute('aria-rowcount')) - 1,
        tray: heads.map((th) => th.querySelector('span span').textContent.trim()),
        pin: new URL(location.href).searchParams.get('grid.pin'),
        inGrid: !!document.activeElement?.matches?.('[role="grid"] td[data-cell]'),
        focused: document.activeElement?.dataset?.cell ?? null,
        focusedText: document.activeElement?.textContent ?? null,
        stops: g.querySelectorAll('td[tabindex="0"]').length,
        status: col.querySelector('[role="status"]').textContent,
        bar: col.querySelector('.rounded-b-lg').innerText.toLowerCase(),
        heights: [...new Set([...g.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.getBoundingClientRect().height))],
      };
    });
  /** The first cell (player_name / passer column 0) of view row r. */
  const nameAt = (r) => grid.locator(`tr[data-row="${r}"] td[data-cell="${r}-0"]`).innerText();
  const same = (s, names, where) => {
    if (s.tray.join('|') !== names.join('|')) fail(`${where}: tray ${s.tray}, not ${names}`);
  };
  const wide = page.viewportSize().width >= 1280;

  // --- Ratings: p pins rows 0, 2, 3 --------------------------------------------------------------
  await open(base + LINK);
  const cols = (await grid.locator('thead th').allInnerTexts()).map((c) => c.trim().toLowerCase());
  if (cols[1] !== 'player_name') fail(`the first column is ${cols[1]}, not player_name`);
  const picked = [await nameAt(0), await nameAt(2), await nameAt(3)];
  await grid.locator('td[data-cell="0-0"]').click();
  for (const k of ['p', 'ArrowDown', 'ArrowDown', 'p', 'ArrowDown', 'p']) await key(k);
  let s = await state();
  same(s, picked, 'p');
  if (!/^player_id:\d+,\d+,\d+$/.test(s.pin ?? '')) fail(`grid.pin=${s.pin}`);
  if (!s.inGrid || s.focused !== '3-0') fail(`p moved the focus to ${s.focused}`);
  if (!s.bar.includes('3 pinned') || s.bar.includes('session only')) fail(`status bar: ${s.bar}`);
  if (s.status !== `Pinned ${picked[2]}, 3 of 8`) fail(`the live status reads "${s.status}"`);
  if ((await grid.locator('button[aria-pressed="true"]').count()) !== 3) fail('three rows should carry the pinned marker');
  // the marker lives in the # cell: pinned rows keep the density's exact height (28 px by default)
  if (s.heights.length !== 1 || s.heights[0] !== 28) fail(`row heights ${s.heights} with pins, not all 28 px`);
  const pinUrl = s.pin;
  const all = s.total;

  // Ctrl+C, Ctrl+P, Ctrl+Z are the browser's (copy, print, undo): no pin, no pinned-only, pointer on
  // an unpinned row (c) and focus on a pinned one (p)
  await grid.locator('tr[data-row="1"]').hover();
  for (const k of ['Control+c', 'Control+p', 'Control+z']) await key(k);
  s = await state();
  if (s.pin !== pinUrl) fail(`a Ctrl shortcut changed the pins: ${s.pin}`);
  same(s, picked, 'Ctrl shortcuts');
  if (s.total !== all || s.bar.includes('z shows all')) fail(`Ctrl+Z toggled pinned-only: ${s.total} rows`);
  await page.waitForTimeout(500);

  // the ⊕ by mouse: pins its row, and the focus and the grid's one tab stop stay where they were
  const name5 = await nameAt(5);
  await grid.locator('tr[data-row="5"] button[aria-pressed]').click();
  s = await state();
  same(s, [...picked, name5], '⊕');
  if (s.focused !== '3-0' || s.stops !== 1) fail(`the ⊕ moved the focus (${s.focused}) or the tab stops (${s.stops})`);
  if (s.status !== `Pinned ${name5}, 4 of 8`) fail(`the live status reads "${s.status}"`);

  // c pins the row under the pointer, at the time of the key; with none under it, a notice
  const name6 = await nameAt(6);
  await grid.locator('tr[data-row="6"]').hover();
  await key('c');
  s = await state();
  same(s, [...picked, name5, name6], 'c');
  await page.mouse.move(2, 2);
  await key('c');
  s = await state();
  if (s.tray.length !== 5 || !/none is/.test(s.status)) fail(`c with no row under the pointer: ${s.tray.length} pinned, "${s.status}"`);

  // the tray's ✕ unpins
  await tray.getByRole('button', { name: `Unpin ${name5}, row 6` }).click();
  await tray.getByRole('button', { name: `Unpin ${name6}, row 7` }).click();
  s = await state();
  same(s, picked, 'tray ✕');
  if (s.status !== `Unpinned ${name6}, 3 of 8` || s.pin !== pinUrl) fail(`after the ✕: "${s.status}", ${s.pin}`);
  await page.waitForTimeout(600);

  // the rail (from 1280 px) follows the pointer, then the keyboard focus
  if (wide) {
    await grid.locator('tr[data-row="6"]').hover();
    await page.waitForTimeout(200);
    if ((await rail.locator('p').first().innerText()) !== name6) fail(`rail shows ${await rail.locator('p').first().innerText()}, not hovered ${name6}`);
    await grid.locator('td[data-cell="3-0"]').focus(); // back to the pinned cell, without a click
    await key('ArrowDown');
    const focused = await nameAt(4);
    if ((await rail.locator('p').first().innerText()) !== focused) fail(`rail shows ${await rail.locator('p').first().innerText()}, not focused ${focused}`);
    await page.waitForTimeout(600);
  } else if (await rail.isVisible()) fail('the rail shows below 1280 px');

  // a re-sort, then the copied URL plus an id this season lacks: the same three, and a notice
  const gp = cols.indexOf('gp') - 1;
  await grid.locator(`td[data-cell="0-${gp}"]`).click();
  await key('s');
  s = await state();
  if (s.pin !== pinUrl) fail(`a sort moved the pins: ${s.pin}`);
  same(s, picked, 'sort');
  await open(page.url().replace(/grid\.pin=[^&]*/, (m) => m + '%2C1'));
  s = await state();
  same(s, picked, 'reload');
  if (s.status !== "1 pinned row isn't in this result") fail(`a missing shared pin: "${s.status}"`);
  if (s.pin !== pinUrl) fail(`reload: grid.pin=${s.pin}, not ${pinUrl}`);
  await tray.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  // z: only the pinned rows, the focused one still focused (view row 3 -> 2); z again: every row,
  // focus back on it at row 3, and the status bar no longer says pinned only
  await grid.locator('td[data-cell="3-0"]').click();
  await key('z');
  s = await state();
  if (s.total !== 3) fail(`z shows ${s.total} rows, not 3`);
  if (s.focused !== '2-0' || s.focusedText !== picked[2] || s.stops !== 1) fail(`z: focus ${s.focused} "${s.focusedText}", ${s.stops} tab stops`);
  if (!s.bar.includes('pinned only, z shows all')) fail(`status bar under z: ${s.bar}`);
  await page.waitForTimeout(600);
  await key('z');
  s = await state();
  if (s.total !== all || s.focused !== '3-0' || s.focusedText !== picked[2]) fail(`z off: ${s.total} rows, focus ${s.focused} "${s.focusedText}"`);
  if (s.bar.includes('z shows all')) fail(`status bar after z off: ${s.bar}`);

  // pin 5 more (8 in all), then a 9th: refused in the status bar, nothing dropped
  await key('Control+Home');
  for (let r = 0; r < 12 && (await state()).tray.length < 8; r++) {
    await key('ArrowDown');
    if ((await grid.locator(`tr[data-row="${r + 1}"] button[aria-pressed]`).getAttribute('aria-pressed')) === 'false') await key('p');
  }
  if ((await state()).tray.length !== 8) fail('could not pin 8');
  await key('ArrowDown');
  await key('p');
  s = await state();
  if (s.tray.length !== 8 || s.pin.split(',').length !== 8) fail(`the 9th pin changed the pins: ${s.tray.length} / ${s.pin}`);
  if (!/8 rows pinned, the most/i.test(s.status) || !s.inGrid) fail(`9th pin: "${s.status}", focus in grid ${s.inGrid}`);

  // 8 pinned: the page never scrolls sideways; at 390 px the tray scrolls inside itself
  const [sw, cw, tw, tcw] = await page.evaluate(() => {
    const box = document.querySelector('section[aria-label="Pinned rows"] > div');
    return [document.documentElement.scrollWidth, document.documentElement.clientWidth, box.scrollWidth, box.clientWidth];
  });
  if (sw > cw) fail(`the page scrolls sideways (${sw} > ${cw})`);
  if (!wide && tw <= tcw) fail(`8 pinned at ${cw} px fit without scrolling the tray (${tw} <= ${tcw})`);
  await tray.scrollIntoViewIfNeeded();
  if (!wide) await tray.locator('div').first().evaluate((el) => el.scrollBy({ left: 400, behavior: 'smooth' }));
  await page.waitForTimeout(800);

  // z, then p unpins each pinned row in turn: the last one leaves pinned-only, focus kept
  await key('z');
  if ((await state()).total !== 8) fail('z with 8 pinned');
  for (let i = 0; i < 8; i++) await key('p');
  s = await state();
  if (s.total !== all || s.tray.length || s.pin !== null || !s.inGrid || s.bar.includes('z shows all')) {
    fail(`unpinning all under z: ${s.total} rows, tray ${s.tray.length}, pin ${s.pin}, focus in grid ${s.inGrid}`);
  }
  await page.waitForTimeout(600);

  // --- Query cfb.passing: pins survive a re-sort and a filter; the tray shades by X_pct ----------
  await open(base + '/platform/query?schema=cfb&table=passing&season=2025&order=-TEPA&limit=50');
  const qcols = (await grid.locator('thead th').allInnerTexts()).map((c) => c.trim().toLowerCase()); // CSS uppercases them
  const at = (name) => qcols.indexOf(name.toLowerCase()) - 1;
  await grid.locator('td[data-cell="0-0"]').click();
  for (const k of ['p', 'ArrowDown', 'p', 'ArrowDown', 'p']) await key(k);
  s = await state();
  if (s.tray.length !== 3 || !/^player_id:\d+,\d+,\d+$/.test(s.pin ?? '')) fail(`Query pins: ${s.tray} / ${s.pin}`);
  const qpicked = s.tray;
  const qpin = s.pin;
  // each pinned entity's TEPA cell in the tray has the colour pctTint gives its TEPA_pct in the grid
  const pctCol = await grid.locator(`td[data-cell$="-${at('TEPA_pct')}"]`).allInnerTexts();
  const scale = pctScale(pctCol.map((v) => (v === '∅' ? null : v)));
  const shades = await page.evaluate(
    ({ expect }) => {
      const t = document.querySelector('section[aria-label="Pinned rows"] table');
      const row = [...t.tBodies[0].rows].find((tr) => tr.cells[0].textContent === 'TEPA');
      const probe = document.createElement('span');
      t.append(probe);
      const out = expect.map((css, j) => {
        probe.style.backgroundColor = css ?? '';
        return [getComputedStyle(row.cells[j + 1]).backgroundColor, getComputedStyle(probe).backgroundColor];
      });
      probe.remove();
      return out;
    },
    { expect: await Promise.all([0, 1, 2].map(async (r) => pctTint(await grid.locator(`td[data-cell="${r}-${at('TEPA_pct')}"]`).innerText(), scale) ?? null)) }
  );
  if (shades.some(([got, want]) => got !== want)) fail(`tray TEPA shades ${JSON.stringify(shades)} (got, pctTint)`);
  if (!shades.some(([got]) => got !== 'rgba(0, 0, 0, 0)')) fail('no pinned TEPA is shaded: the check proves nothing');
  // a re-sort by yards, then a filter on the passer column: the same pins and tray
  await grid.locator(`td[data-cell="0-${at('yards')}"]`).click();
  await key('s');
  await grid.locator(`td[data-cell="0-${at('passer_player_name')}"]`).click();
  await key('f');
  await page.keyboard.type(qpicked[1].slice(0, 5));
  await key('Enter');
  s = await state();
  if (s.pin !== qpin || s.tray.join('|') !== qpicked.join('|')) fail(`Query sort + filter moved the pins: ${s.pin} ${s.tray}`);
  if (s.total >= 50) fail(`the filter kept all ${s.total} rows`);
  const [qsw, qcw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (qsw > qcw) fail(`Query with pins: the page scrolls sideways (${qsw} > ${qcw})`);
  await tray.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  // --- no id column: pins by row number, this session only ------------------------------------
  await open(base + '/platform/query?schema=cfb&table=league_averages&season=2024&limit=20');
  await grid.locator('td[data-cell="0-0"]').click();
  for (const k of ['p', 'ArrowDown', 'ArrowDown', 'p']) await key(k);
  s = await state();
  same(s, ['Row 1', 'Row 3'], 'no id');
  if (s.pin !== null || !s.bar.includes('2 pinned, this session only')) fail(`no id: grid.pin ${s.pin}, bar ${s.bar}`);
  await tray.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
};
export default steps;
