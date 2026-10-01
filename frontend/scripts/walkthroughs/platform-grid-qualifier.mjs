// ResultsGrid sample sizes and the leaderboard qualifier, on Query cfb.passing 2025 sorted by EPA per
// play (the top of that board is 4-dropback passers) and on cfb.team_summaries:
// - an X with an X_n beside it marks its header n ("sample size in X_n"); each X cell's title ends "n = <X_n>";
// - once league_averages' qualifier_min lands, the faded rows are exactly those with dropbacks <
//   qualifier_min x team_games, and exactly those whose EPAplay_pct is null (the producer ranks
//   qualifiers only); a faded row's metrics recede with no heat tint, its name does not, and its #
//   cell (title and screen-reader text) and each faded metric's title say why; a selected faded row,
//   and a focused faded metric cell, read whole;
// - Ctrl+Q / Alt+Q stay the browser's; q shows only the qualified rows plus a pinned faded one, the
//   status bar states the gate, grid.q=1 rides in the URL and a reload restores it; q again shows all;
// - a team table asks for no qualifier, fades nothing, and q only says so;
// - grid.q=1 with a cell focused before the gate lands: the focused player stays focused;
// - a run superseded by a table switch before it lands never renders (its rows, under the new table).
// Keys go through page.keyboard. /platform is behind org sign-in, so this is recorded locally.
const LINK = '/platform/query?schema=cfb&table=passing&season=2025&order=-EPAplay&limit=200';
const TEAM = '/platform/query?schema=cfb&table=team_summaries&season=2025&limit=50';

const steps = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const grid = page.getByRole('grid');
  let gateCalls = 0;
  page.on('request', (r) => {
    if (r.url().includes('table=league_averages')) gateCalls++;
  });
  const open = async (url) => {
    await page.goto(base + url, { waitUntil: 'domcontentloaded' });
    await grid.locator('tbody tr[data-row]').first().waitFor({ timeout: 120_000 });
  };
  /** The qualifier landed: some # cell explains a faded row. */
  const faded = () => grid.locator('td[title*="below the qualifier"]').first().waitFor({ timeout: 30_000 });
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  };
  /** Every rendered row (≤ 200 rows: all of them) by its cells, keyed by header name (the header's own
   *  text, without the n marker), plus what the grid shows about it. */
  const read = () =>
    page.evaluate(() => {
      const g = document.querySelector('[role="grid"]');
      // the raw column name (th[data-col]): the visible text is the registry's short label
      const names = [...g.querySelectorAll('thead th')].slice(1).map((th) => th.dataset.col);
      const rows = [...g.querySelectorAll('tbody tr[data-row]')].map((tr) => {
        const [hash, ...tds] = tr.cells;
        const cell = Object.fromEntries(names.map((n, i) => [n, tds[i].textContent === '∅' ? null : tds[i].title.split(' · ')[0]]));
        const opacity = Object.fromEntries(names.map((n, i) => [n, getComputedStyle(tds[i]).opacity]));
        const heat = names.filter((n, i) => tds[i].style.backgroundColor);
        const sr = hash.querySelector('.sr-only')?.textContent ?? '';
        return { cell, opacity, heat, sr, why: hash.title, n: tds[names.indexOf('EPAplay')]?.title ?? '' };
      });
      const col = g.closest('.flex-col');
      return {
        names,
        marks: [...g.querySelectorAll('thead abbr')].map((a) => a.title),
        rows,
        total: Number(g.getAttribute('aria-rowcount')) - 1,
        bar: col.querySelector('.rounded-b-lg').innerText.toLowerCase(),
        status: col.querySelector('[role="status"]').textContent,
        q: new URL(location.href).searchParams.get('grid.q'),
      };
    });

  // --- cfb.passing 2025: n markers, then the fade against the gate and the producer's ranks --------
  await open(LINK);
  await faded();
  let s = await read();
  if (!s.marks.includes('sample size in EPAplay_n') || s.marks.length !== s.names.filter((n) => s.names.includes(`${n}_n`)).length) {
    fail(`n markers ${s.marks}`);
  }
  const qual = s.rows.find((r) => !r.why);
  if (!/^-?[\d.]+ · n = \d+$/.test(qual.n)) fail(`a qualified EPAplay cell's title reads "${qual.n}"`);
  if (!/^-?[\d.]+ · n = \d+ · below the qualifier \(14 per team game\)$/.test(s.rows[0].n)) fail(`a faded EPAplay cell's title reads "${s.rows[0].n}"`);
  const gate = (r) => Number(r.cell.dropbacks) < 14 * Number(r.cell.team_games);
  let wrong = s.rows.filter((r) => Boolean(r.why) !== gate(r));
  if (wrong.length) fail(`${wrong.length} rows fade against dropbacks < 14 x team_games, e.g. ${JSON.stringify(wrong[0].cell.passer_player_name)}`);
  wrong = s.rows.filter((r) => Boolean(r.why) !== (r.cell.EPAplay_pct === null));
  if (wrong.length) fail(`${wrong.length} faded rows disagree with a null EPAplay_pct, e.g. ${wrong[0].cell.passer_player_name}`);
  const below = s.rows.filter((r) => r.why);
  if (!below.length || below.length === s.rows.length) fail(`${below.length} of ${s.rows.length} faded: the check proves nothing`);
  const f = below[0];
  const want = `${f.cell.dropbacks} dropbacks in ${f.cell.team_games} team games, below the qualifier (14 per team game = ${14 * Number(f.cell.team_games)})`;
  if (f.why !== want || f.sr !== `, ${want}`) fail(`the # cell says "${f.why}" / "${f.sr}", not "${want}"`);
  // metrics by type (team_games too), not keys or text
  const o = f.opacity;
  if (o.EPAplay !== '0.6' || o.team_games !== '0.6' || o.passer_player_name !== '1' || o.player_id !== '1' || o.season !== '1') fail(`faded opacities ${JSON.stringify(o)}`);
  if (qual.opacity.EPAplay !== '1') fail('a qualified row is faded');
  // no heat on a faded row (default tint: heat), while qualified rows carry it
  const heated = below.filter((r) => r.heat.length);
  if (heated.length) fail(`${heated.length} faded rows are heat-shaded, e.g. ${heated[0].cell.passer_player_name}: ${heated[0].heat}`);
  if (!s.rows.some((r) => !r.why && r.heat.includes('EPAplay'))) fail('no qualified EPAplay cell is shaded: the no-heat check proves nothing');
  if (!(await page.getByText('cfb.passing', { exact: true }).isVisible())) fail('the result header does not name cfb.passing');
  const all = s.total;
  const names = s.names;
  const qualifiedN = s.rows.length - below.length;
  console.log(`qualifier: ${below.length} of ${all} rows faded, all with a null EPAplay_pct, none heat-shaded; e.g. #: ${f.why}`);
  await page.waitForTimeout(800);

  // a faded row's metric cell: a click selects the row, which reads whole; Escape deselects and the
  // focused cell alone stays whole (the keyboard reader's cue is in its title)
  const cellOp = (r, name) =>
    page.evaluate(([r, c]) => {
      const td = document.querySelector(`[role="grid"] td[data-cell="${r}-${c}"]`);
      return { op: getComputedStyle(td).opacity, focused: document.activeElement === td };
    }, [r, s.names.indexOf(name)]);
  await grid.locator(`td[data-cell="0-${s.names.indexOf('EPAplay')}"]`).click();
  let [epa, drop] = [await cellOp(0, 'EPAplay'), await cellOp(0, 'dropbacks')];
  if (epa.op !== '1' || drop.op !== '1') fail(`a selected faded row: EPAplay ${epa.op}, dropbacks ${drop.op}`);
  await key('Escape');
  [epa, drop] = [await cellOp(0, 'EPAplay'), await cellOp(0, 'dropbacks')];
  if (!epa.focused || epa.op !== '1' || drop.op !== '0.6') fail(`the focused faded metric cell: ${JSON.stringify(epa)}, its neighbour ${drop.op}`);
  await page.waitForTimeout(600);

  // pin the top (faded) row; Ctrl+Q and Alt+Q are the browser's and change nothing
  await grid.locator('td[data-cell="0-0"]').click();
  await key('p');
  // one at a time: two toggles would cancel out
  for (const k of ['Control+q', 'Alt+q']) {
    await key(k);
    s = await read();
    if (s.total !== all || s.q !== null || s.bar.includes('qualified:')) fail(`${k} toggled the qualifier: ${s.total} rows, grid.q=${s.q}`);
  }

  // q: the qualified rows and the pinned one; the status bar states the gate; grid.q=1
  await key('q');
  s = await read();
  if (s.total !== qualifiedN + 1) fail(`q shows ${s.total} rows, not ${qualifiedN} qualified + 1 pinned`);
  if (s.rows.filter((r) => r.why).length !== 1) fail('q left a faded row that is not pinned');
  if (!s.bar.includes(`${qualifiedN + 1} / ${all} rows`) || !s.bar.includes('qualified: ≥ 14 dropbacks per team game')) fail(`status bar under q: ${s.bar}`);
  if (s.q !== '1') fail(`grid.q=${s.q}`);
  if (!page.url().includes('grid.pin=')) fail('the pin left the URL');
  await page.waitForTimeout(1_000);

  // a reload restores it (the gate fetched again, after the grid renders)
  await open(page.url().replace(/^https?:\/\/[^/]+/, ''));
  await page.waitForFunction((n) => Number(document.querySelector('[role="grid"]').getAttribute('aria-rowcount')) - 1 === n, qualifiedN + 1, { timeout: 30_000 });
  s = await read();
  if (s.q !== '1' || !s.bar.includes('qualified: ≥ 14 dropbacks per team game')) fail(`reload: grid.q=${s.q}, ${s.bar}`);
  await page.waitForTimeout(800);

  // q again: every row, the status bar's gate gone, grid.q gone
  await grid.locator('td[data-cell="0-0"]').click();
  await key('q');
  s = await read();
  if (s.total !== all || s.q !== null || s.bar.includes('qualified:')) fail(`q off: ${s.total} rows, grid.q=${s.q}, ${s.bar}`);
  await page.waitForTimeout(600);

  // --- a team table: no qualifier call, nothing faded, q says so ---------------------------------------
  gateCalls = 0;
  await open(TEAM);
  await page.waitForTimeout(1_500);
  await grid.locator('td[data-cell="0-0"]').click();
  await key('q');
  s = await read();
  if (gateCalls) fail(`a team table asked for its qualifier ${gateCalls} times`);
  if (s.rows.some((r) => r.why)) fail('a team table faded a row');
  if (s.status !== 'no qualifier for this table' || s.q !== null || s.total !== 50) fail(`team q: "${s.status}", grid.q=${s.q}, ${s.total} rows`);
  await page.waitForTimeout(800);

  // --- grid.q=1, a cell focused before the gate lands: the same player stays focused ------------------
  const runOf = (table) => (u) => u.pathname === '/api/platform/query/run' && u.searchParams.get('table') === table;
  let openGate;
  const gateHeld = new Promise((r) => (openGate = r));
  await page.route(runOf('league_averages'), async (route) => {
    await gateHeld;
    await route.continue();
  });
  await open(LINK + '&grid.q=1');
  const [nameAt, pctAt] = [names.indexOf('passer_player_name'), names.indexOf('EPAplay_pct')];
  // the 3rd qualified row: its EPAplay_pct is set (the producer ranks qualifiers only)
  const target = (
    await page.evaluate((c) => [...document.querySelectorAll('[role="grid"] tbody tr[data-row]')].filter((tr) => tr.cells[c + 1].textContent !== '∅').map((tr) => Number(tr.dataset.row)), pctAt)
  )[2];
  const who = await grid.locator(`td[data-cell="${target}-${nameAt}"]`).innerText();
  await grid.locator(`td[data-cell="${target}-${nameAt}"]`).click();
  const gateLanded = page.waitForResponse((r) => runOf('league_averages')(new URL(r.url())));
  openGate();
  await gateLanded;
  await page.waitForFunction((n) => Number(document.querySelector('[role="grid"]').getAttribute('aria-rowcount')) - 1 === n, qualifiedN, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const now = await page.evaluate(() => ({ cell: document.activeElement?.dataset?.cell, text: document.activeElement?.textContent }));
  if (now.text !== who || now.cell !== `2-${nameAt}`) fail(`the gate landed under q: focus on ${now.cell} "${now.text}", not 2-${nameAt} "${who}" (was row ${target})`);
  await page.unroute(runOf('league_averages'));
  await page.waitForTimeout(600);

  // --- a run superseded by a table switch before it lands: its rows never show -----------------------
  let release;
  const held = new Promise((r) => (release = r));
  await page.route(runOf('passing'), async (route) => {
    await held;
    await route.continue();
  });
  const sent = page.waitForRequest((r) => runOf('passing')(new URL(r.url())));
  await page.goto(base + LINK, { waitUntil: 'domcontentloaded' });
  await sent;
  await page.getByRole('button', { name: 'rushing', exact: true }).click();
  const landed = page.waitForResponse((r) => runOf('passing')(new URL(r.url())));
  release();
  await landed;
  await page.waitForTimeout(1_500);
  if (await grid.count()) fail(`the superseded cfb.passing run rendered under the rushing table (header: ${await page.getByText(/^cfb\.\w+$/).allInnerTexts()})`);
  await page.unroute(runOf('passing'));
  await page.waitForTimeout(600);
};
export default steps;
