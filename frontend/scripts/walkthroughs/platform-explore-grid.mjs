// /platform/explore preview grid: the preview is the shared ResultsGrid, its f/s/h keys write the
// URL's grid.* keys beside Explore's own, a copied link restores the sort (another dataset or a
// moved link drops it), a descending sort keeps nulls last (here and on Query), and at 390 px only
// the grid scrolls sideways, never the page.
// Needs SDV_TRIGGER_KEY = a personal read-scope key on the local server (the Query check).
// /platform is behind org sign-in, so this is recorded locally (see the PR's Walkthrough clip)
// and is NOT listed on the PR's `Walkthrough steps:` line.
const LINK = '/platform/explore?tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week=1&limit=50';
const COL = 'yds_rushed'; // null on every non-rush play

const param = (page, key) => new URL(page.url()).searchParams.get(key);
const waitParam = (page, key, value) =>
  page.waitForFunction(([k, v]) => new URL(location.href).searchParams.get(k) === v, [key, value], { timeout: 5_000 });

/** The grid's column position (view order) of `name`, and that column's cells top to bottom. Over
 *  200 rows the grid renders only a window of them, so this scrolls it through, collecting by row. */
async function column(grid, name) {
  const c = await grid.locator('thead th').evaluateAll((ths, n) => ths.slice(1).findIndex((th) => th.textContent.trim() === n), name);
  if (c < 0) throw new Error(`no ${name} column`);
  const cells = await grid.evaluate(async (t, c) => {
    const box = t.parentElement, seen = new Map();
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))));
    for (box.scrollTop = 0; ; box.scrollTop += box.clientHeight - t.tHead.offsetHeight) {
      await settle();
      for (const td of t.querySelectorAll(`tbody td[data-cell$="-${c}"]`)) seen.set(Number(td.dataset.cell.split('-')[0]), td.textContent);
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) break;
    }
    box.scrollTop = 0;
    await settle();
    return [...seen.keys()].sort((a, b) => a - b).map((r) => seen.get(r));
  }, c);
  return { c, cells };
}

/** Descending with every null after every value, and the values really descending. */
function assertNullsLastDesc(cells, where) {
  const firstNull = cells.indexOf('∅');
  const values = cells.filter((v) => v !== '∅').map(Number);
  if (firstNull < 1 || cells.slice(firstNull).some((v) => v !== '∅')) throw new Error(`${where}: nulls not last on a descending sort: ${cells.slice(0, 5)}`);
  if (values.some((v, i) => i && v > values[i - 1])) throw new Error(`${where}: not descending: ${values.slice(0, 8)}`);
}

const steps = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);

  // (a) the preview is the grid; a link from before it (no grid.*) comes back unchanged
  await page.goto(base + LINK, { waitUntil: 'domcontentloaded' });
  const grid = page.getByRole('grid');
  await grid.locator('tbody tr').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(500);
  if (new URL(page.url()).search !== new URL(base + LINK).search) throw new Error(`old link changed: ${page.url()}`);

  // (b) f filters the focused column, s sorts it, h cycles the shading, each into grid.*
  const { c } = await column(grid, COL);
  const cell = grid.locator(`td[data-cell="0-${c}"]`);
  await cell.click();
  await cell.press('f');
  const filter = grid.getByPlaceholder(`filter ${COL}…`);
  await filter.fill('1');
  await waitParam(page, `grid.f.${COL}`, '1');
  await filter.press('Escape'); // clears and closes
  await waitParam(page, `grid.f.${COL}`, null);
  await cell.focus();
  await cell.press('h'); // heat → off (no _pct columns here)
  await waitParam(page, 'grid.tint', 'off');
  await cell.press('h'); // off → heat, the default, so the key goes
  await waitParam(page, 'grid.tint', null);
  await cell.press('s');
  await waitParam(page, 'grid.sort', COL);
  await page.waitForTimeout(400);
  await grid.locator(`td[data-cell="0-${c}"]`).press('s');
  // (c) the sort is in the URL, beside Explore's own keys
  await waitParam(page, 'grid.sort', `-${COL}`);
  if (param(page, 'w.week') !== '1' || param(page, 'season') !== '2024') throw new Error(`Explore keys lost: ${page.url()}`);
  // (d) nulls last on the descending sort
  assertNullsLastDesc((await column(grid, COL)).cells, 'Explore');
  await page.waitForTimeout(800);

  // (c) the copied link restores the sort
  const copied = page.url();
  await page.goto(copied, { waitUntil: 'domcontentloaded' });
  await grid.locator('tbody tr').first().waitFor({ timeout: 120_000 });
  const reloaded = await column(grid, COL);
  await grid.locator('thead th').nth(reloaded.c + 1).locator('svg.lucide-arrow-down').waitFor({ timeout: 5_000 });
  if (param(page, 'grid.sort') !== `-${COL}`) throw new Error(`reload lost the sort: ${page.url()}`);
  assertNullsLastDesc(reloaded.cells, 'Explore reload');

  // (e) 390 px: the page never scrolls sideways; the grid scrolls inside itself
  if (page.viewportSize().width < 500) {
    const [page_, scroller] = await page.evaluate(() => {
      const el = document.querySelector('table[role="grid"]').parentElement;
      return [document.documentElement.scrollWidth - document.documentElement.clientWidth, el.scrollWidth - el.clientWidth];
    });
    if (page_ > 0 || scroller <= 0) throw new Error(`side scroll: page +${page_}px, grid +${scroller}px`);
  }
  await page.waitForTimeout(800);

  // A linked-in sort belongs to its table: picking another dataset drops it in the same URL write,
  // before the new preview loads (which would drop a sort on a column it lacks anyway)
  const datasets = page.locator('select').first();
  const other = await datasets.evaluate((s) => [...s.options].find((o) => o.value && o.value !== s.value).value);
  await datasets.selectOption(other);
  await waitParam(page, 'tag', other);
  if (param(page, 'grid.sort') !== null) throw new Error(`another dataset kept the sort: ${page.url()}`);

  // A link naming a table the release lacks falls back to another; its sort goes with its filters
  await page.goto(base + '/platform/explore?tag=espn_cfb_pbp&table=nope&season=2024&grid.sort=-yds_rushed', { waitUntil: 'domcontentloaded' });
  await waitParam(page, 'grid.sort', null);
  if (['nope', null].includes(param(page, 'table'))) throw new Error(`the pickers never fell back: ${page.url()}`);

  // (d) Query: the same grid, a descending sort keeps the non-qualifiers' null percentiles last
  await page.goto(base + '/platform/query?schema=cfb&table=passing&season=2025&limit=500', { waitUntil: 'domcontentloaded' });
  const qgrid = page.getByRole('grid');
  await qgrid.locator('tbody tr').first().waitFor({ timeout: 60_000 });
  const q = await column(qgrid, 'EPAplay_pct');
  const qcell = qgrid.locator(`td[data-cell="0-${q.c}"]`);
  await qcell.click();
  await qcell.press('s');
  await waitParam(page, 'grid.sort', 'EPAplay_pct');
  await qgrid.locator(`td[data-cell="0-${q.c}"]`).press('s');
  await waitParam(page, 'grid.sort', '-EPAplay_pct');
  assertNullsLastDesc((await column(qgrid, 'EPAplay_pct')).cells, 'Query');
  await page.waitForTimeout(800);
};
export default steps;
