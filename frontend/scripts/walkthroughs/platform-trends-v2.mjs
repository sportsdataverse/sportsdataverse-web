// /platform/trends, multi-team overlay: a shared three-team link charts itself with a
// legend and one end label per line; hovering reads every team's value at that season;
// each Add re-charts, up to six teams, and a seventh is refused with a note. Removing a
// team leaves a gap: every other line keeps its colour, and so does a reload of the
// resulting link; the next Add fills the gap's colour. An old single-team link still
// charts its one team. A shared CFB ratings link charts its two teams by week within
// its season, and picking another season re-charts the same teams.
// League band (P7 T3): every chart draws the league mean (dashed) over a mean ± 1 SD band
// from the same file, with one "League mean ± 1 SD" legend entry; the CFB summaries band's
// final-week mean equals the parquet's; hovering over the band still moves the readout;
// a rating with a producer rank reads "#N of M" beside its value, one without reads none.
// Fix round: a stat with an inf value (Miami (OH)'s available_yards_pct_off) still charts
// with its band; M counts the teams with a value, a .5 rank reads "T-"; college hoops
// average D-I teams only ("D-I mean ± 1 SD", at the teams' own precision).
// Small multiples (P7 T4): a Big Ten link draws one panel per member (18 in 2025), every
// panel on the same y domain; selecting a panel adds its team to the overlay (team= in the
// URL, "In overlay" on the panel) and the view stays on the panels; the toggle switches to
// the overlay and back; an NFL division is 4 panels; an MBB conference carries the D-I band;
// no width scrolls sideways.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on
// the PR's `Walkthrough steps:` line (CI has no session; the module throws there).
const THREE = ['Boston Celtics', 'Los Angeles Lakers', 'Golden State Warriors'];
const MORE = ['Chicago Bulls', 'Miami Heat', 'New York Knicks'];
const SEVENTH = 'Denver Nuggets';
const CHART = 'svg[aria-label="Rebounds Per Game by season"]';
// polars on cfb_team_summaries_weekly_2025.parquet (release asset as of 2026-09-28):
// pl.read_parquet(f).filter(pl.col('through_week') == 16)['EPAplay_off'].mean(), n = 136.
// A republish of the 2025 file moves it: re-derive, never loosen the 1e-9.
const EPA_WEEK16_MEAN = 0.06580872766029501;
// cfb_groups cfb_team_group_seasons.parquet: count(*) WHERE season = 2025 AND
// conference_id = 'cfb:big-ten' (all 18 are in the 2025 summaries file).
const BIG_TEN_2025 = 18;

const trendsV2 = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);

  const teamsInUrl = () => new URL(page.url()).searchParams.getAll('team');
  const urlTeams = (want) =>
    page.waitForFunction((w) => JSON.stringify(new URL(location.href).searchParams.getAll('team')) === w, JSON.stringify(want));
  // Loading state: the chart button reads "Charting…" while a chart loads and "Chart it" after.
  const idle = () => page.getByRole('button', { name: 'Chart it' }).waitFor({ timeout: 120_000 });
  const charted = async () => {
    await page.getByRole('button', { name: 'Charting…' }).waitFor({ timeout: 10_000 });
    await idle();
  };
  const legend = page.getByTestId('trends-legend');
  const has = async (loc, text) => {
    const t = await loc.innerText();
    if (!t.includes(text)) throw new Error(`${await loc.getAttribute('data-testid')} lacks "${text}": ${t.slice(0, 200)}`);
  };
  const count = async (loc, n, what) => {
    const got = await loc.count();
    if (got !== n) throw new Error(`${what}: expected ${n}, got ${got}`);
  };
  /** The league mean line's [x, mean] pairs, at full precision. */
  const means = async (chart) =>
    (await page.locator(`${chart} [data-testid="trends-mean"]`).getAttribute('data-mean'))
      .split(' ')
      .map((p) => p.split(':').map(Number));
  const readoutX = async () => (await legend.innerText()).split('\n')[0];
  const ranks = () => page.getByTestId('trends-rank').allInnerTexts();
  /** team → its line's computed stroke colour. */
  const strokes = () =>
    page.evaluate((sel) => {
      const out = {};
      for (const el of document.querySelectorAll(`${sel} [data-team]`)) {
        out[el.getAttribute('data-team')] = getComputedStyle(el).stroke;
      }
      return out;
    }, CHART);
  /** Every team drawn both times kept its colour. */
  const sameColours = (before, after, what) => {
    for (const [team, stroke] of Object.entries(after)) {
      if (team in before && before[team] !== stroke) throw new Error(`${what}: ${team} moved from ${before[team]} to ${stroke}`);
    }
  };
  const add = async (team) => {
    await page.getByLabel('Add a team').selectOption(team);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  };

  const q = THREE.map((t) => `team=${encodeURIComponent(t)}`).join('&');
  await page.goto(`${base}/platform/trends?sport=nba&${q}&stat=avgRebounds`, { waitUntil: 'domcontentloaded' });
  await page.locator(CHART).waitFor({ timeout: 120_000 });
  await idle();
  for (const t of THREE) await has(legend, t);
  await count(page.getByTestId('trends-end-label'), 3, 'end labels');
  // Hoops: the league mean line, from the same season files.
  if ((await means(CHART)).length < 2) throw new Error('the NBA chart has no league mean line');
  await has(legend, 'League mean ± 1 SD');
  await page.waitForTimeout(1200);

  // Hover: the legend reads every team's value at the hovered season.
  const box = await page.locator(CHART).boundingBox();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
  await page.waitForTimeout(1200);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(800);
  await page.mouse.move(0, 0);

  // Each Add re-charts; fill to six, then a seventh is refused with a note, never cycled.
  for (const [i, t] of MORE.entries()) {
    await add(t);
    await urlTeams([...THREE, ...MORE.slice(0, i + 1)]);
    await charted();
    await count(page.getByTestId('trends-end-label'), 4 + i, `end labels after adding ${t}`);
    await page.waitForTimeout(600);
  }
  await add(SEVENTH);
  await has(page.getByTestId('trends-note'), `Remove one to add ${SEVENTH}`);
  if (teamsInUrl().includes(SEVENTH)) throw new Error('a 7th team reached the URL');
  await page.waitForTimeout(1200);

  // Remove #2: a gap in the URL, and every other line keeps its colour...
  const six = await strokes();
  if (Object.keys(six).length !== 6) throw new Error(`expected 6 lines, got ${JSON.stringify(six)}`);
  await page.getByRole('button', { name: `Remove ${THREE[1]}` }).click();
  const gapped = [THREE[0], '', THREE[2], ...MORE];
  await urlTeams(gapped);
  await count(page.getByTestId('trends-end-label'), 5, 'end labels after a removal');
  sameColours(six, await strokes(), 'after a removal');
  await page.waitForTimeout(1500);

  // ...through a reload of the resulting link too.
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await page.locator(CHART).waitFor({ timeout: 120_000 });
  await idle();
  const reloaded = await strokes();
  if (Object.keys(reloaded).length !== 5) throw new Error(`reload drew ${JSON.stringify(reloaded)}`);
  sameColours(six, reloaded, 'after a reload');
  await page.waitForTimeout(1200);

  // The next Add fills the gap: the new team takes the removed team's colour.
  await add(SEVENTH);
  await urlTeams([THREE[0], SEVENTH, THREE[2], ...MORE]);
  await charted();
  const refilled = await strokes();
  if (refilled[SEVENTH] !== six[THREE[1]]) throw new Error(`${SEVENTH} drew ${refilled[SEVENTH]}, not the gap's ${six[THREE[1]]}`);
  sameColours(six, refilled, 'after refilling the gap');
  await page.waitForTimeout(1500);

  // The old single-team link still charts its one team.
  await page.goto(`${base}/platform/trends?sport=nba&team=${encodeURIComponent(THREE[0])}&stat=avgRebounds`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(CHART).waitFor({ timeout: 120_000 });
  await idle();
  await count(page.getByTestId('trends-end-label'), 1, 'end labels on an old link');
  await page.waitForTimeout(1200);

  // CFB ratings by week: a shared weekly link charts by week in its season...
  const WEEKLY = ['Ohio State', 'Michigan'];
  const WEEKLY_CHART = 'svg[aria-label="adj_net by week"]';
  const wq = WEEKLY.map((t) => `team=${encodeURIComponent(t)}`).join('&');
  await page.goto(`${base}/platform/trends?sport=cfb_ratings_weekly&season=2025&${wq}&stat=adj_net`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(WEEKLY_CHART).waitFor({ timeout: 120_000 });
  await idle();
  for (const t of WEEKLY) await has(legend, t);
  await has(legend, 'Through week '); // CFB's week W includes week W (NFL's is 'Entering week')
  await count(page.getByTestId('trends-end-label'), 2, 'weekly end labels');
  // On a phone the chart sits below the fold: a pointer off the viewport hovers nothing.
  await page.locator(WEEKLY_CHART).scrollIntoViewIfNeeded();
  const wbox = await page.locator(WEEKLY_CHART).boundingBox();
  const latestWeek = await readoutX();
  await page.mouse.move(wbox.x + wbox.width * 0.3, wbox.y + wbox.height / 2, { steps: 8 });
  await page.waitForTimeout(1200);
  if ((await readoutX()) === latestWeek) throw new Error(`the weekly hover left the readout at "${latestWeek}"`);
  // adj_net has a producer rank (net_rank): each team's hover value reads "#N of M".
  const hovered = await ranks();
  if (hovered.length !== 2 || !hovered.every((r) => /^#\d+ of \d+$/.test(r))) throw new Error(`adj_net ranks: ${hovered}`);
  await page.mouse.move(0, 0);

  // ...and another season re-charts the same teams: wait on the URL, then the load.
  // The switch clears the chart in the render that writes the URL, so the chart coming
  // back is that load finishing (its "Charting…" can last ~20 ms, too brief to wait on).
  await page.getByLabel('Season').selectOption('2024');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('season') === '2024');
  await page.locator(WEEKLY_CHART).waitFor({ timeout: 60_000 });
  await idle();
  await has(page.getByTestId('trends-chart-title'), '2024');
  await count(page.getByTestId('trends-end-label'), 2, 'weekly end labels after a season switch');
  await page.waitForTimeout(1500);

  // A rating with no producer rank (fei_net) reads no rank at all.
  await page.goto(`${base}/platform/trends?sport=cfb_ratings_weekly&season=2025&${wq}&stat=fei_net`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('svg[aria-label="fei_net by week"]').waitFor({ timeout: 120_000 });
  await idle();
  await has(legend, 'League mean ± 1 SD');
  await count(page.getByTestId('trends-rank'), 0, 'ranks on fei_net');
  await page.waitForTimeout(1200);

  // CFB team summaries: the band and its legend entry; its week-16 mean is the parquet's.
  const SUMMARY = ['Ohio State', 'Indiana'];
  const SUMMARY_CHART = 'svg[aria-label="EPAplay_off by week"]';
  const sq = SUMMARY.map((t) => `team=${encodeURIComponent(t)}`).join('&');
  await page.goto(`${base}/platform/trends?sport=cfb_team_summaries_weekly&season=2025&${sq}&stat=EPAplay_off`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(SUMMARY_CHART).waitFor({ timeout: 120_000 });
  await idle();
  const band = page.locator(`${SUMMARY_CHART} [data-testid="trends-band"] polygon`);
  if ((await band.count()) < 1) throw new Error('the CFB summaries chart has no league band');
  await has(legend, 'League mean ± 1 SD');
  await has(legend, '(n = 136)');
  const [lastX, lastMean] = (await means(SUMMARY_CHART)).at(-1);
  if (lastX !== 16 || Math.abs(lastMean - EPA_WEEK16_MEAN) > 1e-9) {
    throw new Error(`week ${lastX} league mean ${lastMean}, parquet says week 16 ${EPA_WEEK16_MEAN}`);
  }
  // EPAplay_off_rank is in the same row: both teams read "#N of 136".
  const latestRanks = await ranks();
  if (latestRanks.length !== 2 || !latestRanks.every((r) => / of 136$/.test(r))) throw new Error(`EPAplay_off ranks: ${latestRanks}`);
  // The band takes no pointer events: hovering on it still moves the readout off week 16.
  await band.first().scrollIntoViewIfNeeded();
  const bb = await band.first().boundingBox();
  const before = await readoutX();
  await page.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height / 2, { steps: 8 });
  await page.waitForTimeout(800);
  if ((await readoutX()) === before) throw new Error(`hovering the band left the readout at "${before}"`);
  await page.waitForTimeout(1200);
  await page.mouse.move(0, 0);

  /** Chart a 2025 CFB summaries stat for two teams; its band must draw. */
  const summaries = async (teams, stat) => {
    const tq = teams.map((t) => `team=${encodeURIComponent(t)}`).join('&');
    await page.goto(`${base}/platform/trends?sport=cfb_team_summaries_weekly&season=2025&${tq}&stat=${stat}`, {
      waitUntil: 'domcontentloaded',
    });
    const chart = `svg[aria-label="${stat} by week"]`;
    await page.locator(chart).waitFor({ timeout: 120_000 });
    await idle();
    if ((await page.locator(`${chart} [data-testid="trends-band"] polygon`).count()) < 1) throw new Error(`${stat}: no league band`);
    return chart;
  };

  // An inf in the file (Miami (OH), weeks 1-3) is left out of the band, not fatal to the chart.
  await summaries(['Miami (OH)', 'Ohio State'], 'available_yards_pct_off');
  await count(page.getByTestId('trends-end-label'), 2, 'available_yards_pct_off end labels');
  await page.waitForTimeout(1200);

  // Week 1 of red_zone_success_off_pass: 83 teams have a value (the producer ranks 93),
  // Georgia's 5.5 is a two-way tie for 5th.
  const rz = await summaries(['Georgia', 'Texas'], 'red_zone_success_off_pass');
  await page.locator(rz).scrollIntoViewIfNeeded();
  const rzBox = await page.locator(rz).boundingBox();
  await page.mouse.move(rzBox.x + 49, rzBox.y + rzBox.height / 2, { steps: 6 }); // the plot's left edge: week 1
  await page.waitForTimeout(800);
  if ((await readoutX()) !== 'Through week 1') throw new Error(`expected week 1, read "${await readoutX()}"`);
  const wk1 = await ranks();
  if (wk1.join('|') !== '#T-5 of 83|#50 of 83') throw new Error(`week 1 ranks: ${wk1}`);
  await page.waitForTimeout(1200);
  await page.mouse.move(0, 0);

  // MBB: the band is D-I only (~365 teams; the file lists ~730), at the teams' one decimal.
  await page.goto(`${base}/platform/trends?sport=mbb&team=Duke%20Blue%20Devils&team=Kansas%20Jayhawks&stat=avgPoints`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('svg[aria-label="Points Per Game by season"]').waitFor({ timeout: 120_000 });
  await idle();
  const d1 = /D-I mean ± 1 SD (\d+\.\d) \(n = (\d+)\)/.exec(await legend.innerText());
  if (!d1 || +d1[2] < 300 || +d1[2] > 400) throw new Error(`MBB band is not D-I: ${await legend.innerText()}`);
  await page.waitForTimeout(1500);

  // --- Small multiples -------------------------------------------------------------
  const panels = page.getByTestId('trends-panel');
  const multiples = page.getByTestId('trends-multiples');
  const noSideScroll = async (what) => {
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) throw new Error(`${what}: the page scrolls sideways (${sw} > ${cw})`);
  };
  /** Open a multiples link and wait for its panels. */
  const openMultiples = async (qs) => {
    await page.goto(`${base}/platform/trends?${qs}`, { waitUntil: 'domcontentloaded' });
    await multiples.waitFor({ timeout: 120_000 });
    await idle();
  };
  /** Every panel's y domain; they must all be one. */
  const oneDomain = async (what) => {
    const domains = await page.getByTestId('trends-panel-plot').evaluateAll((els) => els.map((e) => e.getAttribute('data-y-domain')));
    if (!domains.length || new Set(domains).size !== 1) throw new Error(`${what}: panel y domains differ: ${[...new Set(domains)].join(' | ')}`);
  };

  // (a) The Big Ten, 2025 EPA/play: one panel per member, A-Z, one y domain.
  await openMultiples('sport=cfb_team_summaries_weekly&season=2025&view=multiples&group=cfb%3Abig-ten&stat=EPAplay_off');
  await count(panels, BIG_TEN_2025, 'Big Ten 2025 panels');
  await oneDomain('Big Ten');
  const names = await page.getByTestId('trends-panel-title').allInnerTexts();
  if (names.join('|') !== [...names].sort((a, b) => a.localeCompare(b)).join('|')) throw new Error(`panels are not A-Z: ${names}`);
  if ((await page.getByLabel('Conference').inputValue()) !== 'cfb:big-ten') throw new Error('the conference picker is not on the Big Ten');
  await has(page.getByTestId('trends-chart-title'), 'Big Ten');
  await has(page.getByTestId('trends-multiples-legend'), 'League mean ± 1 SD');
  await noSideScroll('Big Ten panels');
  await multiples.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  // (b) Selecting a panel adds its team to the overlay; the view stays on the panels.
  const osu = page.getByRole('button', { name: 'Add Ohio State to the overlay' });
  await osu.scrollIntoViewIfNeeded();
  await osu.click();
  await urlTeams(['Ohio State']);
  const picked = page.locator('[data-testid="trends-panel"][data-team="Ohio State"]');
  await has(picked, 'In overlay');
  if (new URL(page.url()).searchParams.get('view') !== 'multiples') throw new Error('adding a team left the multiples view');
  await picked.click({ force: true }); // a picked panel (aria-disabled) does nothing
  await page.waitForTimeout(300);
  if (teamsInUrl().length !== 1) throw new Error(`a second click on a picked panel changed team=: ${teamsInUrl()}`);
  await page.waitForTimeout(1200);

  // The toggle: the overlay charts the pick, and back to the same panels.
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  await page.locator(SUMMARY_CHART).waitFor({ timeout: 120_000 });
  await idle();
  await count(page.getByTestId('trends-end-label'), 1, 'overlay end labels after adding from a panel');
  if (new URL(page.url()).searchParams.has('view')) throw new Error('the overlay kept view= in the URL');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Small multiples', exact: true }).click();
  await multiples.waitFor({ timeout: 120_000 });
  await idle();
  await count(panels, BIG_TEN_2025, 'Big Ten panels after the toggle');
  await page.waitForTimeout(1000);

  // Another conference from the picker re-charts.
  await page.getByLabel('Conference').selectOption({ label: 'SEC' });
  await page.waitForFunction(() => new URL(location.href).searchParams.get('group') === 'cfb:sec');
  await multiples.waitFor({ timeout: 120_000 });
  await idle();
  await has(page.getByTestId('trends-chart-title'), 'SEC');
  await oneDomain('SEC');
  await page.waitForTimeout(1200);

  // (c) NFL ratings by division: 4 panels.
  await openMultiples('sport=nfl_ratings_weekly&season=2025&view=multiples&group=nfl%3Aafc-east&stat=adj_net');
  await count(panels, 4, 'AFC East panels');
  await oneDomain('AFC East');
  if ((await page.getByLabel('Division').inputValue()) !== 'nfl:afc-east') throw new Error('the division picker is not on the AFC East');
  await noSideScroll('AFC East panels');
  await multiples.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  // (d) MBB 2026, one conference, over the D-I band.
  await openMultiples('sport=mbb&view=multiples&group=mbb%3Abig-12&stat=avgPoints');
  await has(page.getByTestId('trends-chart-title'), '2026');
  await count(panels, 16, 'Big 12 2026 panels'); // mbb_team_group_seasons 2026, conference_id = 'mbb:big-12'
  await oneDomain('Big 12');
  await has(page.getByTestId('trends-multiples-legend'), 'D-I mean ± 1 SD');
  if ((await page.locator('[data-testid="trends-panel-plot"] polygon').count()) < 16) throw new Error('the MBB panels have no band');
  // (e) no sideways scroll, at any width this runs at (390 px on the phone pass).
  await noSideScroll('MBB panels');
  await multiples.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
};
export default trendsV2;
