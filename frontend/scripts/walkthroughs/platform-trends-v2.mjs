// /platform/trends, multi-team overlay: a shared three-team link charts itself with a
// legend and one end label per line; hovering reads every team's value at that season;
// each Add re-charts, up to six teams, and a seventh is refused with a note. Removing a
// team leaves a gap: every other line keeps its colour, and so does a reload of the
// resulting link; the next Add fills the gap's colour. An old single-team link still
// charts its one team. A shared CFB ratings link charts its two teams by week within
// its season, and picking another season re-charts the same teams.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on
// the PR's `Walkthrough steps:` line (CI has no session; the module throws there).
const THREE = ['Boston Celtics', 'Los Angeles Lakers', 'Golden State Warriors'];
const MORE = ['Chicago Bulls', 'Miami Heat', 'New York Knicks'];
const SEVENTH = 'Denver Nuggets';
const CHART = 'svg[aria-label="Rebounds Per Game by season"]';

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
  await has(legend, 'Week ');
  await count(page.getByTestId('trends-end-label'), 2, 'weekly end labels');
  const wbox = await page.locator(WEEKLY_CHART).boundingBox();
  await page.mouse.move(wbox.x + wbox.width * 0.3, wbox.y + wbox.height / 2, { steps: 8 });
  await page.waitForTimeout(1200);
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
};
export default trendsV2;
