// ResultsGrid column presets, family separators and the frozen label column:
// - Query cfb.team_summaries 2025 with grid.preset=efficiency: the frozen pos_team column behind #, then
//   exactly the efficiency columns (presetsFor over the result's columns, each base followed by its _rank
//   and _n); the header text is the registry's short label with its side (EPA/Play Off, EPA/Play Def),
//   the tooltip the long label and the raw name; a 2 px left border starts each family run on the header
//   and the body alike; the frozen column stays put, opaque, through a horizontal scroll; End lands on
//   the last displayed column.
// - The explosiveness pill swaps the columns and grid.preset and the status bar names the preset; All
//   restores every column in the result's order, with a separator at every family run; a reload of the
//   copied link restores the preset.
// - Query cfb.passing: a dragged reorder (yards, volume, between TEPA and EPAplay) moves the separators with the
//   displayed order; at 500 rows the windowed grid's sizer row carries the same borders; a preset chosen
//   with the focus on the last column keeps the one tab stop on a cell that exists; grid.preset=drive
//   (no drive column there) is dropped with a notice.
// Keys go through page.keyboard. /platform is behind org sign-in, so this is recorded locally.
import { groupStarts, headerLabels, presetsFor } from '../../lib/platform/gridRegistry.ts';

const TEAM = '/platform/query?schema=cfb&table=team_summaries&season=2025&limit=50';
const PASSING = '/platform/query?schema=cfb&table=passing&season=2025&order=-TEPA&limit=100';

const steps = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const grid = page.getByRole('grid');
  const open = async (url) => {
    await page.goto(url.startsWith('http') ? url : base + url, { waitUntil: 'domcontentloaded' });
    await grid.locator('tbody tr[data-row]').first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(400);
  };
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  };
  const pill = (name) => page.getByRole('group', { name: 'Column presets' }).getByRole('button', { name, exact: true });
  const read = () =>
    page.evaluate(() => {
      const g = document.querySelector('[role="grid"]');
      const box = g.parentElement;
      const ths = [...g.querySelectorAll('thead th')].slice(1);
      const text = (th) => [...th.querySelector('button').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      const sep = (el) => getComputedStyle(el).borderLeftWidth === '2px';
      const row0 = g.querySelector('tbody tr[data-row="0"]');
      const sizer = g.querySelector('tbody tr.invisible');
      const [hash, first] = row0.cells;
      const cs = getComputedStyle(first);
      const x = (el) => el.getBoundingClientRect().left - box.getBoundingClientRect().left;
      const col = g.closest('.flex-col');
      return {
        cols: ths.map((th) => th.dataset.col), // the raw names: the visible text is the registry's short label
        texts: ths.map(text),
        titles: ths.map((th) => th.querySelector('button').title),
        headSep: ths.map(sep),
        bodySep: [...row0.cells].slice(1).map(sep),
        sizerSep: sizer ? [...sizer.cells].slice(1).map(sep) : null,
        first: { position: cs.position, left: parseFloat(cs.left), bg: cs.backgroundColor, x: x(first), hashW: hash.getBoundingClientRect().width },
        lastX: x(row0.cells[row0.cells.length - 1]),
        pills: [...col.querySelectorAll('[aria-label="Column presets"] button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`),
        bar: col.querySelector('.rounded-b-lg').innerText.toLowerCase(),
        status: col.querySelector('[role="status"]').textContent,
        preset: new URL(location.href).searchParams.get('grid.preset'),
        focused: document.activeElement?.dataset?.cell ?? null,
        stop: g.querySelector('td[tabindex="0"]')?.dataset.cell ?? null,
        stops: g.querySelectorAll('td[tabindex="0"]').length,
        heights: [...new Set([...g.querySelectorAll('tbody tr[data-row]')].map((tr) => tr.getBoundingClientRect().height))],
      };
    });
  /** The separators sit exactly at groupStarts over the DISPLAYED columns, on the header and the body (and the sizer). */
  const separators = (s, where) => {
    const want = groupStarts(s.cols);
    const expect = s.cols.map((_, i) => want.has(i));
    for (const [name, got] of [['header', s.headSep], ['body', s.bodySep], ['sizer', s.sizerSep]]) {
      if (got && got.join() !== expect.join()) fail(`${where}: ${name} separators at ${got.flatMap((b, i) => (b ? [i] : []))}, not ${[...want]}`);
    }
    return want;
  };
  /** Every header reads headerLabels' text, its tooltip the long label and the raw name. */
  const labels = (s, where) => {
    const want = headerLabels(s.cols);
    s.cols.forEach((c, i) => {
      if (s.texts[i] !== want[i].text) fail(`${where}: ${c} reads "${s.texts[i]}", not "${want[i].text}"`);
      // resolved: the long label, the raw name, then the glossary's dtype; unresolved: the glossary tip (name, dtype, description)
      const ok = want[i].text === c ? s.titles[i].startsWith(c) : s.titles[i].startsWith(want[i].title) && s.titles[i].includes(`(${c})`);
      if (!ok) fail(`${where}: ${c} tooltip "${s.titles[i]}"`);
    });
  };

  // --- team_summaries, grid.preset=efficiency from the URL ---------------------------------------
  await open(`${TEAM}&grid.preset=efficiency`);
  let s = await read();
  if (s.cols[0] !== 'pos_team') fail(`the first column is ${s.cols[0]}, not the frozen pos_team`);
  if (s.preset !== 'efficiency' || !s.bar.includes('preset: efficiency · all shows every column')) fail(`preset from the URL: ${s.preset}, bar "${s.bar}"`);
  labels(s, 'efficiency');
  const at = (c) => s.cols.indexOf(c);
  if (s.texts[at('EPAplay_off')] !== 'EPA/Play Off' || s.texts[at('EPAplay_def')] !== 'EPA/Play Def') fail(`EPAplay_off / _def read ${s.texts[at('EPAplay_off')]} / ${s.texts[at('EPAplay_def')]}`);
  if (at('EPAplay_off_rank') !== at('EPAplay_off') + 1 || at('EPAplay_off_n') !== at('EPAplay_off') + 2) fail('EPAplay_off is not followed by its _rank and _n');
  const effStarts = separators(s, 'efficiency');
  if ([...effStarts].join() !== '1') fail(`one family run under the preset should start at column 1, got ${[...effStarts]}`);
  // the frozen column: sticky behind the # cell, opaque; a horizontal scroll moves the rest, not it
  if (s.first.position !== 'sticky' || Math.abs(s.first.left - s.first.hashW) > 1 || Math.abs(s.first.x - s.first.hashW) > 1) fail(`frozen column: ${JSON.stringify(s.first)}`);
  if (/rgba\(.*, 0\)$/.test(s.first.bg) || s.first.bg === 'transparent') fail(`the frozen cell is see-through: ${s.first.bg}`);
  if (s.heights.length !== 1 || s.heights[0] !== 28) fail(`row heights ${s.heights}, not all 28 px with separators`);
  const efficiency = s.cols;
  const before = s;
  await grid.evaluate((t) => t.parentElement.scrollBy({ left: 600 }));
  await page.waitForTimeout(500);
  s = await read();
  if (Math.abs(s.first.x - before.first.x) > 1) fail(`a horizontal scroll moved the frozen column from ${before.first.x} to ${s.first.x}`);
  if (s.lastX >= before.lastX - 500) fail(`a horizontal scroll did not move the last column (${before.lastX} -> ${s.lastX})`);
  await page.waitForTimeout(600);
  // End: the last DISPLAYED column, not the result's last
  await grid.locator('td[data-cell="0-0"]').click();
  await key('End');
  s = await read();
  if (s.focused !== `0-${efficiency.length - 1}`) fail(`End landed on ${s.focused}, not 0-${efficiency.length - 1}`);
  await grid.evaluate((t) => t.parentElement.scrollTo({ left: 0 }));

  // --- the explosiveness pill, then All, then the copied link -------------------------------------
  await pill('explosiveness').click();
  await page.waitForTimeout(400);
  s = await read();
  if (s.preset !== 'explosiveness' || !s.bar.includes('preset: explosiveness')) fail(`the pill: grid.preset=${s.preset}, bar "${s.bar}"`);
  if (s.cols[0] !== 'pos_team' || !s.pills.includes('explosiveness*') || s.pills.includes('efficiency*')) fail(`explosiveness: ${s.cols.slice(0, 3)} ${s.pills}`);
  labels(s, 'explosiveness');
  separators(s, 'explosiveness');
  const explosiveness = s.cols;
  const link = page.url();
  await page.waitForTimeout(600);
  await pill('All').click();
  await page.waitForTimeout(600);
  s = await read();
  const all = s.cols;
  if (s.preset !== null || s.bar.includes('preset:') || !s.pills.includes('All*')) fail(`All: grid.preset=${s.preset}, bar "${s.bar}", pills ${s.pills}`);
  if (all.slice(0, 5).join() !== 'team_id,pos_team,division,conference,season') fail(`All does not show the result's order: ${all.slice(0, 5)}`);
  const presets = presetsFor(all);
  if (s.pills.join() !== ['All*', ...presets.map((p) => p.family)].join()) fail(`pills ${s.pills}, presets ${presets.map((p) => p.family)}`);
  const want = (family) => presets.find((p) => p.family === family).columns;
  if (efficiency.slice(1).join() !== want('efficiency').join()) fail(`the efficiency preset showed ${efficiency.length - 1} columns, presetsFor says ${want('efficiency').length}`);
  if (explosiveness.slice(1).join() !== want('explosiveness').join()) fail(`the explosiveness preset showed ${explosiveness.slice(1)}, not ${want('explosiveness')}`);
  labels(s, 'All');
  const allStarts = separators(s, 'All');
  if (allStarts.size < 6) fail(`All shows ${allStarts.size} family runs; the separator check proves little`);
  if (s.first.position === 'sticky') fail('under All team_id is displayed first, and only the label column sticks, only when first');
  console.log(`team_summaries: ${all.length} columns, presets ${presets.map((p) => `${p.family} ${p.columns.length}`).join(', ')}, ${allStarts.size} family runs under All`);
  await page.waitForTimeout(600);
  await open(link);
  s = await read();
  if (s.preset !== 'explosiveness' || s.cols.join() !== explosiveness.join()) fail(`the copied link lost the preset: ${s.preset}, ${s.cols.length} columns`);
  await page.waitForTimeout(600);

  // --- passing: a drag keeps the separators with the displayed order; the sizer; the focus clamp; a missing preset
  await open(PASSING);
  s = await read();
  if (s.cols[0] !== 'team_id' || s.first.position === 'sticky') fail(`passing under All: ${s.cols[0]} first, position ${s.first.position}`);
  const startsBefore = [...separators(s, 'passing')];
  const th = (name) => grid.locator(`thead th[data-col="${name}"]`);
  // one column over (a 390 px scroller shows three): the volume column lands inside the efficiency run
  await th('yards').dragTo(th('EPAplay'));
  await page.waitForTimeout(500);
  s = await read();
  if (s.cols.indexOf('yards') !== s.cols.indexOf('EPAplay') - 1) fail(`the drag did not put yards before EPAplay: ${s.cols.slice(8, 16)}`);
  const startsAfter = [...separators(s, 'dragged')];
  if (startsAfter.join() === startsBefore.join()) fail(`the drag moved no separator (${startsBefore}): the check proves nothing`);
  console.log(`passing: separators ${startsBefore} -> ${startsAfter} after dragging yards before EPAplay`);
  await page.waitForTimeout(600);
  // End under All, then the efficiency pill: the one tab stop is a cell that exists
  await grid.locator('td[data-cell="0-0"]').click();
  await key('End');
  s = await read();
  if (s.focused !== `0-${s.cols.length - 1}`) fail(`End under All: ${s.focused}`);
  await pill('efficiency').click();
  await page.waitForTimeout(400);
  s = await read();
  if (s.cols[0] !== 'passer_player_name' || s.first.position !== 'sticky') fail(`passing efficiency: ${s.cols[0]} first, ${s.first.position}`);
  if (s.stops !== 1 || Number(s.stop.split('-')[1]) > s.cols.length - 1) fail(`after the preset shrank the columns the tab stop is ${s.stop} (${s.stops} stops) of ${s.cols.length}`);
  separators(s, 'passing efficiency');
  await page.waitForTimeout(600);
  // 500 rows: the windowed grid's sizer row carries the separators too
  await open(`${PASSING.replace('limit=100', 'limit=500')}&grid.preset=efficiency`);
  s = await read();
  if (!s.sizerSep) fail('500 rows did not window the grid (no sizer row)');
  separators(s, 'windowed');
  await page.waitForTimeout(600);
  // a preset this table lacks: dropped, said so, every column shown
  await open(`${PASSING}&grid.preset=drive`);
  s = await read();
  if (s.status !== 'no drive preset for this result' || s.preset !== null || !s.pills.includes('All*')) fail(`grid.preset=drive on passing: "${s.status}", grid.preset=${s.preset}, ${s.pills}`);
  if (s.cols.length < 60) fail(`the dropped preset hid columns: ${s.cols.length}`);
  await page.waitForTimeout(800);
};
export default steps;
