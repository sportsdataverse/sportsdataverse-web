// ResultsGrid basis toggle (per game / per play / per drive / total):
// - Query cfb.team_summaries 2025: the segmented control offers Native + every basis basesFor says the
//   result can serve; `per play` shows each column's per-play sibling in its place (every cell equals
//   rebase over the native cells: TEPA_off reads EPAplay_off, tagged `· per play`, the tooltip naming
//   the sibling), blanks a column without one (plays_off, success_off: `—`, `(no per play)`), leaves a
//   native per-play column and its _rank / _n alone, turns the heat tint off for rebased columns only,
//   and says so in the status bar; per game and per drive the same; Native restores every cell.
// - `s` on TEPA_off under per play orders the rows as sorting the native EPAplay_off does (and not as
//   sorting the native TEPA_off); `b` cycles Native → total → per play → per game → per drive → Native,
//   Ctrl+b is left to the browser; a copied link with grid.basis + grid.preset restores both.
// - Query cfb.passing: EPAplay_pct passes through untouched under per play; a 10k-row link stays
//   windowed (≤ 44 rows in the DOM, 28 px each) on a basis; a faded row's qualifier note still carries
//   the native dropbacks and team_games counts.
// - Query cfb.league_averages (no registry column): no toggle, `b` says so, grid.basis is dropped with a notice.
// Keys go through page.keyboard. /platform is behind org sign-in, so this is recorded locally.
import { basesFor, rebase } from '../../lib/platform/gridRegistry.ts';

const TEAM = '/platform/query?schema=cfb&table=team_summaries&season=2025&limit=50';
const PASSING = '/platform/query?schema=cfb&table=passing&season=2025&order=-TEPA';
const AVERAGES = '/platform/query?schema=cfb&table=league_averages&season=2024&limit=100';

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
    await page.waitForTimeout(200);
  };
  const segment = (name) => page.getByRole('group', { name: 'Value basis' }).getByRole('button', { name, exact: true });
  /** The displayed grid: every rendered row's cells by column name, the header tags and tooltips, the toggle, the bar. */
  const read = () =>
    page.evaluate(() => {
      const g = document.querySelector('[role="grid"]');
      const col = g.closest('.flex-col');
      const ths = [...g.querySelectorAll('thead th')].slice(1);
      const cols = ths.map((th) => th.dataset.col);
      const trs = [...g.querySelectorAll('tbody tr[data-row]')];
      const cells = {};
      cols.forEach((c, i) => (cells[c] = trs.map((tr) => tr.cells[i + 1].textContent)));
      const shaded = {};
      cols.forEach((c, i) => (shaded[c] = trs.filter((tr) => tr.cells[i + 1].style.backgroundColor !== '').length));
      const tags = {};
      ths.forEach((th) => {
        const t = th.querySelector('span[data-basis]');
        if (t) tags[th.dataset.col] = t.textContent;
      });
      const titles = Object.fromEntries(ths.map((th) => [th.dataset.col, th.querySelector('button').title]));
      const flames = Object.fromEntries(ths.map((th) => [th.dataset.col, !!th.querySelector('[aria-label="value-encoded"]')]));
      const toggle = col.querySelector('[aria-label="Value basis"]');
      return {
        cols,
        cells,
        shaded,
        tags,
        titles,
        flames,
        rows: trs.length,
        total: Number(g.getAttribute('aria-rowcount')) - 1,
        heights: [...new Set(trs.map((tr) => tr.getBoundingClientRect().height))],
        segments: toggle ? [...toggle.querySelectorAll('button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`) : null,
        bar: col.querySelector('.rounded-b-lg').innerText.toLowerCase(),
        status: col.querySelector('[role="status"]').textContent,
        basis: new URL(location.href).searchParams.get('grid.basis'),
        sort: new URL(location.href).searchParams.get('grid.sort'),
        preset: new URL(location.href).searchParams.get('grid.preset'),
        presetPills: [...col.querySelectorAll('[aria-label="Column presets"] button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`),
      };
    });
  const cellOf = (s, c, r) => grid.locator(`td[data-cell="${r}-${s.cols.indexOf(c)}"]`);
  /** Every displayed cell under `basis` is rebase over the native cells (a blank reads —), and the rest of the contract. */
  const check = (s, native, basis, where) => {
    const label = basis.replace(/_/g, ' ');
    if (s.basis !== basis || !s.segments.includes(`${label}*`)) fail(`${where}: grid.basis=${s.basis}, segments ${s.segments}`);
    if (!s.bar.includes(`basis: ${label} · percentile shading off for rebased columns`)) fail(`${where}: bar "${s.bar}"`);
    const rows = native.cells[native.cols[0]].map((_, r) => native.cols.map((c) => native.cells[c][r]));
    const want = rebase(native.cols, rows, basis);
    let sourced = 0;
    s.cols.forEach((c, i) => {
      const expect = want.rows.map((row) => (want.blanked.has(c) ? '—' : row[i]));
      if (s.cells[c].join('\u0001') !== expect.join('\u0001')) fail(`${where}: ${c} shows ${s.cells[c].slice(0, 3)}, not ${expect.slice(0, 3)}`);
      const src = want.sourced.get(c);
      if (src) {
        sourced++;
        if (s.tags[c] !== `· ${label}` || !s.titles[c].includes(`values from ${src}`)) fail(`${where}: ${c} tag "${s.tags[c]}", title "${s.titles[c]}"`);
        if (s.shaded[c] || s.flames[c]) fail(`${where}: ${c} is sourced from ${src} but keeps its tint (${s.shaded[c]} shaded cells, flame ${s.flames[c]})`);
      } else if (want.blanked.has(c)) {
        if (s.tags[c] !== `(no ${label})` || !s.titles[c].includes(`no ${label} variant`)) fail(`${where}: ${c} tag "${s.tags[c]}", title "${s.titles[c]}"`);
        if (s.shaded[c] || s.flames[c]) fail(`${where}: blank ${c} is tinted`);
      } else if (s.tags[c] !== undefined) fail(`${where}: ${c} is untouched but tagged "${s.tags[c]}"`);
    });
    if (!sourced) fail(`${where}: nothing sourced, the check proves nothing`);
    return want;
  };

  // --- team_summaries: the native view, then per play ---------------------------------------------
  await open(TEAM);
  let s = await read();
  const native = s;
  const offered = basesFor(native.cols);
  if (s.basis !== null || s.segments?.join() !== ['Native*', ...offered.map((b) => b.replace(/_/g, ' '))].join()) fail(`native: grid.basis=${s.basis}, segments ${s.segments}, basesFor ${offered}`);
  if (Object.keys(s.tags).length || s.bar.includes('basis:')) fail(`native: tags ${JSON.stringify(s.tags)}, bar "${s.bar}"`);
  const at = (c) => native.cols.indexOf(c);
  for (const c of ['TEPA_off', 'EPAplay_off', 'plays_off', 'success_off', 'EPAplay_off_rank', 'EPAplay_off_n', 'pos_team']) if (at(c) < 0) fail(`team_summaries lacks ${c}`);
  if (!native.shaded.EPAplay_off || !native.shaded.TEPA_off) fail(`native: no heat on EPAplay_off (${native.shaded.EPAplay_off}) / TEPA_off (${native.shaded.TEPA_off}): the tint check proves nothing`);
  await segment('per play').click();
  await page.waitForTimeout(500);
  s = await read();
  const perPlay = check(s, native, 'per_play', 'per play');
  // the brief's spot checks, by name
  if (perPlay.sourced.get('TEPA_off') !== 'EPAplay_off') fail(`TEPA_off sourced from ${perPlay.sourced.get('TEPA_off')}`);
  for (const r of [0, 1, 2]) if (s.cells.TEPA_off[r] !== native.cells.EPAplay_off[r]) fail(`row ${r}: TEPA_off reads ${s.cells.TEPA_off[r]}, native EPAplay_off ${native.cells.EPAplay_off[r]}`);
  for (const c of ['plays_off', 'success_off']) if (!perPlay.blanked.has(c) || s.cells[c].some((v) => v !== '—')) fail(`${c} is not blank under per play: ${s.cells[c].slice(0, 3)}`);
  for (const c of ['EPAplay_off', 'EPAplay_off_rank', 'EPAplay_off_n']) if (s.cells[c].join() !== native.cells[c].join() || s.tags[c]) fail(`${c} changed under per play`);
  if (!s.shaded.EPAplay_off || !s.flames.EPAplay_off) fail(`EPAplay_off (native per play) lost its heat: ${s.shaded.EPAplay_off} shaded, flame ${s.flames.EPAplay_off}`);
  const blankTitle = await cellOf(s, 'plays_off', 0).getAttribute('title');
  if (blankTitle !== 'no per play variant') fail(`blank cell title "${blankTitle}"`);
  console.log(`per play: ${perPlay.sourced.size} sourced, ${perPlay.blanked.size} blanked of ${s.cols.length}; TEPA_off ${s.cells.TEPA_off.slice(0, 3)} = native EPAplay_off`);
  await page.waitForTimeout(600);

  // --- per game, per drive, then Native restores every cell ---------------------------------------
  await segment('per game').click();
  await page.waitForTimeout(500);
  s = await read();
  const perGame = check(s, native, 'per_game', 'per game');
  if (perGame.sourced.get('TEPA_off') !== 'EPAgame_off' || perGame.sourced.get('plays_off') !== 'playsgame_off') fail(`per game: TEPA_off <- ${perGame.sourced.get('TEPA_off')}, plays_off <- ${perGame.sourced.get('plays_off')}`);
  await page.waitForTimeout(500);
  await segment('per drive').click();
  await page.waitForTimeout(500);
  s = await read();
  const perDrive = check(s, native, 'per_drive', 'per drive');
  if (perDrive.sourced.get('TEPA_off') !== 'EPAdrive_off') fail(`per drive: TEPA_off <- ${perDrive.sourced.get('TEPA_off')}`);
  console.log(`per game: ${perGame.sourced.size} sourced / ${perGame.blanked.size} blanked; per drive: ${perDrive.sourced.size} / ${perDrive.blanked.size}`);
  await page.waitForTimeout(500);
  await segment('Native').click();
  await page.waitForTimeout(500);
  s = await read();
  if (s.basis !== null || !s.segments.includes('Native*') || s.bar.includes('basis:')) fail(`Native: grid.basis=${s.basis}, ${s.segments}, bar "${s.bar}"`);
  if (JSON.stringify(s.cells) !== JSON.stringify(native.cells) || JSON.stringify(s.tags) !== '{}' || JSON.stringify(s.shaded) !== JSON.stringify(native.shaded)) fail('Native did not restore the initial render');
  console.log(`Native: every cell, tag and tint as the initial render (${s.cols.length} columns × ${s.rows} rows)`);
  await page.waitForTimeout(500);

  // --- s on a sourced column orders by the displayed values -----------------------------------------
  await cellOf(native, 'EPAplay_off', 0).click();
  await key('s');
  const byNativeEPAplay = (await read()).cells.pos_team;
  await key('s');
  await key('s'); // back to the result's order
  await cellOf(native, 'TEPA_off', 0).click();
  await key('s');
  const byNativeTEPA = (await read()).cells.pos_team;
  await key('s');
  await key('s');
  if (byNativeEPAplay.join() === byNativeTEPA.join()) fail('EPAplay_off and TEPA_off sort the same: the sort check proves nothing');
  await segment('per play').click();
  await page.waitForTimeout(500);
  await cellOf(native, 'TEPA_off', 0).click();
  await key('s');
  s = await read();
  if (s.sort !== 'TEPA_off' || s.basis !== 'per_play') fail(`sort under per play: grid.sort=${s.sort}, grid.basis=${s.basis}`);
  if (s.cells.pos_team.join() !== byNativeEPAplay.join()) fail(`s on TEPA_off under per play ordered ${s.cells.pos_team.slice(0, 4)}, sorting the native EPAplay_off gives ${byNativeEPAplay.slice(0, 4)}`);
  const differs = byNativeEPAplay.findIndex((t, k) => t !== byNativeTEPA[k]);
  console.log(`s on TEPA_off under per play: ${s.cells.pos_team.slice(0, 3)} = the native EPAplay_off order (the native TEPA_off order differs from row ${differs + 1}: ${byNativeTEPA[differs]} vs ${byNativeEPAplay[differs]})`);
  await key('s');
  await key('s');
  await page.waitForTimeout(400);

  // --- b cycles the offered bases; Ctrl+b is the browser's ----------------------------------------
  const cycle = [null, ...offered];
  let i = cycle.indexOf('per_play');
  const walked = [cycle[i]];
  for (let n = 0; n < cycle.length; n++) {
    await key('b');
    i = (i + 1) % cycle.length;
    s = await read();
    const want = cycle[i];
    if (s.basis !== want || !s.segments.includes(`${want === null ? 'Native' : want.replace(/_/g, ' ')}*`)) fail(`b #${n + 1}: grid.basis=${s.basis}, want ${want}; ${s.segments}`);
    walked.push(want);
  }
  await key('Control+b');
  if ((await read()).basis !== cycle[i]) fail('Ctrl+b changed the basis');
  console.log(`b walked ${walked.map((b) => b ?? 'Native').join(' → ')}; Ctrl+b left it`);
  await page.waitForTimeout(500);

  // --- a copied link restores the basis and the preset together -----------------------------------
  await open(`${TEAM}&grid.basis=per_play&grid.preset=efficiency`);
  s = await read();
  if (s.basis !== 'per_play' || s.preset !== 'efficiency' || !s.segments.includes('per play*') || !s.presetPills.includes('efficiency*')) fail(`link: basis ${s.basis}, preset ${s.preset}, ${s.segments}, ${s.presetPills}`);
  if (s.cols[0] !== 'pos_team' || !s.bar.includes('preset: efficiency') || !s.bar.includes('basis: per play')) fail(`link: ${s.cols[0]} first, bar "${s.bar}"`);
  for (const r of [0, 1, 2]) if (s.cells.TEPA_off[r] !== native.cells.EPAplay_off[r]) fail(`link row ${r}: TEPA_off ${s.cells.TEPA_off[r]} vs native EPAplay_off ${native.cells.EPAplay_off[r]}`);
  if (s.cols.includes('plays_off')) fail('the efficiency preset shows plays_off');
  console.log(`link: grid.basis=per_play + grid.preset=efficiency restored (${s.cols.length} columns, pos_team frozen)`);
  await page.waitForTimeout(600);

  // --- passing: X_pct passes through; a 10k link stays windowed on a basis -------------------------
  await open(`${PASSING}&limit=10000&grid.basis=per_play`);
  s = await read();
  if (s.basis !== 'per_play' || s.total <= 200) fail(`passing: grid.basis=${s.basis}, ${s.total} rows (not windowed)`);
  if (s.rows > 44 || s.heights.length !== 1 || s.heights[0] !== 28) fail(`passing under per play: ${s.rows} rows in the DOM, heights ${s.heights}`);
  const want = rebase(s.cols, [], 'per_play');
  if (want.sourced.get('TEPA') !== 'EPAplay' || !want.blanked.has('plays') || want.sourced.has('EPAplay_pct') || want.blanked.has('EPAplay_pct')) fail(`passing: ${JSON.stringify([...want.sourced])} / ${[...want.blanked]}`);
  if (s.tags.TEPA !== '· per play' || s.tags.plays !== '(no per play)' || s.tags.EPAplay_pct !== undefined || s.cells.plays.some((v) => v !== '—')) fail(`passing tags ${JSON.stringify(s.tags)}`);
  if (s.cells.EPAplay_pct.every((v) => v === '—' || v === '∅')) fail('EPAplay_pct is not passing through');
  console.log(`passing: ${s.total} rows under per play, ${s.rows} in the DOM at ${s.heights}px; EPAplay_pct untouched, plays blank, TEPA <- EPAplay`);
  // the qualifier note reads the native counts: a faded row still says "<n> dropbacks in <m> team games" with plays blank
  await grid.locator('td[title*="below the qualifier"]').first().waitFor({ timeout: 30_000 });
  const why = await grid.locator('tbody tr[data-row] > td:first-child[title*="below the qualifier"]').first().getAttribute('title');
  if (!/^\d+ dropbacks in \d+ team games, below the qualifier/.test(why)) fail(`a faded row's note under per play reads "${why}"`);
  console.log(`passing under per play: faded row note "${why.split(',')[0]}"`);
  await page.waitForTimeout(500);

  // --- a table with no sibling: no toggle, b says so, grid.basis is dropped --------------------------
  await open(`${AVERAGES}&grid.basis=per_play`);
  s = await read();
  if (s.segments !== null || s.basis !== null) fail(`league_averages: segments ${s.segments}, grid.basis=${s.basis}`);
  if (s.status !== 'no per play basis for this result') fail(`league_averages status "${s.status}"`);
  await grid.locator('td[data-cell="0-0"]').click();
  await key('b');
  s = await read();
  if (!s.status.startsWith('no other basis for this result') || s.basis !== null) fail(`b on league_averages: "${s.status}", grid.basis=${s.basis}`);
  console.log(`league_averages: no toggle; b: "${s.status}"`);
  await page.waitForTimeout(800);
};
export default steps;
