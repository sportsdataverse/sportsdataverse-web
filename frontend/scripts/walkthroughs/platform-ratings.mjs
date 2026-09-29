// /platform/ratings (P10): (a) the NBA link lists player_impact, regular season only (one row per
// player), ordered by rapm, possessions shown; (b) MBB names its teams and keeps to D-I, with the
// note; (c) CFB names its schools; (d) NFL reads the newest release file at its newest as_of_week,
// names the teams and states the week in the span line, with no "Chart this" (no Scatter source);
// (e) NBA "Chart this" opens Scatter on o_rapm vs d_rapm, one mark per listed player; (f) 390 px
// scrolls nothing sideways (the grid may scroll inside itself). Every expected row set is the Data API's own, read in the page
// through the same member proxy, so a later write moves both sides together.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).

const ratings = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const span = page.getByTestId('ratings-span');
  const note = page.getByTestId('ratings-note');
  const apiRows = (params) =>
    page.evaluate(async (p) => (await (await fetch(`/api/platform/query/run?${new URLSearchParams(p)}`)).json()).data, params);
  /** Open a board and wait for its grid; the grid's columns and cells as text. */
  const board = async (qs, spanText) => {
    await page.goto(`${base}/platform/ratings?${qs}`, { waitUntil: 'domcontentloaded' });
    await span.filter({ hasText: spanText }).waitFor({ timeout: 120_000 });
    await page.locator('table[role="grid"] tbody tr').first().waitFor();
    await page.waitForTimeout(400);
    return page.evaluate(async () => {
      const t = document.querySelector('table[role="grid"]');
      const cols = [...t.querySelectorAll('thead th')].slice(1).map((th) => th.innerText.trim().toLowerCase());
      // over 200 rows the grid renders only a window of them: scroll it through, collecting by row
      const box = t.parentElement, seen = new Map();
      const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))));
      for (box.scrollTop = 0; ; box.scrollTop += box.clientHeight - t.tHead.offsetHeight) {
        await settle();
        for (const tr of t.querySelectorAll('tbody tr[data-row]')) seen.set(Number(tr.dataset.row), [...tr.querySelectorAll('td')].slice(1).map((td) => td.innerText));
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) break;
      }
      box.scrollTop = 0;
      const rows = [...seen.keys()].sort((a, b) => a - b).map((r) => seen.get(r));
      return { cols, rows, url: location.search };
    });
  };
  const col = (g, name) => g.rows.map((r) => r[g.cols.indexOf(name)]);
  const noSideScroll = async (what) => {
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) fail(`${what}: the page scrolls sideways (${sw} > ${cw})`);
  };

  // (a) NBA 2026: every regular-season player once, rapm highest first, possessions shown.
  const nba = await board('league=nba&season=2026', 'sorted by rapm');
  if (nba.url !== '?season=2026') fail(`the NBA link rewrote to ${nba.url}, not ?season=2026 (nba is the default league)`);
  const all = await apiRows({ schema: 'nba', table: 'player_impact', season: '2026', select: 'player_id,season_type', limit: '50000' });
  const regular = all.filter((r) => r.season_type === 'Regular Season');
  const players = new Set(regular.map((r) => r.player_id)).size;
  if (regular.length === all.length) fail('no playoff rows in nba.player_impact 2026: the regular-season check proves nothing');
  if (nba.rows.length !== players || regular.length !== players) fail(`NBA lists ${nba.rows.length} rows for ${players} regular-season players (${regular.length} rows)`);
  for (const c of ['off_poss', 'def_poss', 'rapm']) if (!nba.cols.includes(c)) fail(`NBA grid has no ${c} column: ${nba.cols}`);
  const rapm = col(nba, 'rapm').map(Number);
  if (rapm.some((v, i) => i && v > rapm[i - 1])) fail('NBA rows are not in rapm order, highest first');
  const top = (await apiRows({ schema: 'nba', table: 'player_impact', season: '2026', season_type: 'Regular Season', select: 'player_name,rapm', order: '-rapm', limit: '3' })).map((r) => r.player_name);
  if (col(nba, 'player_name').slice(0, 3).join('|') !== top.join('|')) fail(`NBA top 3 ${col(nba, 'player_name').slice(0, 3)} vs the API's ${top}`);
  if (!(await span.innerText()).includes('regular season')) fail(`the NBA span line does not say regular season: ${await span.innerText()}`);
  console.log(`ratings (a): ${nba.rows.length} NBA players, top ${top.join(', ')}; ${await span.innerText()}`);
  await page.waitForTimeout(1200);

  // (b) MBB 2026: D-I only (the season's team_group_seasons list), every team named.
  const mbb = await board('league=mbb&season=2026', 'sorted by adj_em');
  const [rated, d1] = await Promise.all([
    apiRows({ schema: 'mbb', table: 'ratings', season: '2026', select: 'team_id', limit: '50000' }),
    apiRows({ schema: 'mbb', table: 'team_group_seasons', season: '2026', select: 'team_id,team_name', limit: '50000' }),
  ]);
  const listed = new Set(d1.map((r) => r.team_id));
  const kept = rated.filter((r) => listed.has(r.team_id)).length;
  if (mbb.rows.length !== kept) fail(`MBB lists ${mbb.rows.length} teams for ${kept} D-I teams`);
  const names = new Set(d1.map((r) => r.team_name));
  const unnamed = col(mbb, 'team').filter((t) => !names.has(t));
  if (unnamed.length) fail(`MBB teams not named from the D-I list: ${unnamed.slice(0, 5)}`);
  const left = `${(rated.length - kept).toLocaleString('en-US')} non-D-I teams left out. The producer's rank counts all ${rated.length.toLocaleString('en-US')} rated teams`;
  if (!(await note.innerText()).includes(left)) fail(`the MBB note does not read "${left}": ${await note.innerText()}`);
  if (!(await span.innerText()).startsWith('Every D-I MBB team')) fail(`the MBB span line: ${await span.innerText()}`);
  console.log(`ratings (b): ${mbb.rows.length} D-I MBB teams, top ${col(mbb, 'team').slice(0, 3).join(', ')}; ${await note.innerText()}`);
  await page.waitForTimeout(1200);

  // (c) CFB 2026: every team named by cfb.team_info's school.
  const cfb = await board('league=cfb&season=2026', 'sorted by adj_net');
  const schools = new Set((await apiRows({ schema: 'cfb', table: 'team_info', select: 'school', limit: '50000' })).map((r) => r.school));
  const notSchool = col(cfb, 'team').filter((t) => !schools.has(t));
  if (notSchool.length) fail(`CFB teams that are not a cfb.team_info school: ${notSchool.slice(0, 5)}`);
  console.log(`ratings (c): ${cfb.rows.length} CFB teams, top ${col(cfb, 'team').slice(0, 3).join(', ')}`);
  await page.waitForTimeout(1200);

  // (d) NFL: the newest release file, its newest week (a rating entering week W counts at most
  // W - 1 games), 32 teams named by their full name.
  const nfl = await board('league=nfl', 'sorted by adj_net');
  const newest = await page.evaluate(async () => {
    const res = await (await fetch('/api/platform/datasets/assets?repo=sportsdataverse%2Fsportsdataverse-data&tag=nfl_ratings_weekly')).json();
    return res.message.map((a) => a.name.match(/^nfl_ratings_weekly_(\d{4})\.parquet$/)?.[1]).filter(Boolean).sort().at(-1);
  });
  const nflSpan = await span.innerText();
  const week = Number(nflSpan.match(/entering week (\d+)/)?.[1]);
  if (!nflSpan.includes(`in ${newest}, entering week`) || !Number.isInteger(week)) fail(`the NFL span line does not name ${newest} and a week: ${nflSpan}`);
  if (nfl.url !== `?league=nfl&season=${newest}`) fail(`the NFL link rewrote to ${nfl.url}`);
  // polars, 2026-09-28: nfl_ratings_weekly_2026.parquet holds weeks 2 and 3. A file only gains
  // weeks, so its newest can never read lower (the oldest, 2, would be the wrong-end read).
  if (newest === '2026' && week < 3) fail(`NFL 2026 shows entering week ${week}; the file's newest was 3 on 2026-09-28`);
  const games = col(nfl, 'games').map(Number);
  if (Math.max(...games) > week - 1) fail(`a team has ${Math.max(...games)} games entering week ${week}`);
  if (nfl.rows.length !== 32) fail(`NFL lists ${nfl.rows.length} teams`);
  const nflTeams = new Set((await apiRows({ schema: 'nfl', table: 'teams', select: 'team_name', limit: '50000' })).map((r) => r.team_name));
  const abbrs = col(nfl, 'team').filter((t) => !nflTeams.has(t));
  if (abbrs.length) fail(`NFL teams not named from nfl.teams: ${abbrs}`);
  if (await page.getByTestId('ratings-chart').count()) fail('NFL shows "Chart this", but its release file is no Scatter source');
  console.log(`ratings (d): NFL ${newest}, week ${week}, top ${col(nfl, 'team').slice(0, 3).join(', ')}; ${nflSpan}`);
  await page.waitForTimeout(1200);

  // (e) NBA "Chart this": the same table and season in Scatter, O-RAPM on x, D-RAPM on y.
  await board('season=2026', 'sorted by rapm');
  await page.getByTestId('ratings-chart').click();
  await page.waitForURL(/\/platform\/scatter\?/, { timeout: 60_000 });
  const scatterUrl = new URL(page.url());
  if (scatterUrl.search !== '?season=2026&x=o_rapm&y=d_rapm') fail(`Chart this opened ${scatterUrl.search}`);
  await page.getByTestId('scatter-title').filter({ hasText: 'd_rapm vs o_rapm · 2026' }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  const marks = Number(await page.getByTestId('scatter-canvas').getAttribute('data-marks'));
  if (!(marks > 0) || marks !== players) fail(`Scatter drew ${marks} marks for ${players} listed players`);
  console.log(`ratings (e): Chart this -> ${scatterUrl.pathname}${scatterUrl.search}, ${marks} marks`);
  await page.waitForTimeout(1200);

  // (f) 390 px: the grid scrolls inside itself; the page never does.
  const vp = page.viewportSize();
  await page.setViewportSize({ width: 390, height: vp.height });
  await page.goto(`${base}/platform/ratings?season=2026`, { waitUntil: 'domcontentloaded' });
  await span.filter({ hasText: 'sorted by rapm' }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await noSideScroll('NBA at 390 px');
  await page.getByRole('button', { name: 'NFL', exact: true }).click();
  await span.filter({ hasText: 'entering week' }).waitFor({ timeout: 120_000 });
  await noSideScroll('NFL at 390 px');
  await page.setViewportSize(vp);
  console.log('ratings (f): no side scroll at 390 px');
  await page.waitForTimeout(1200);
};
export default ratings;
