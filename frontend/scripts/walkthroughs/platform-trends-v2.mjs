// /platform/trends, multi-team overlay: a shared three-team link charts itself with a
// legend and one end label per line; hovering reads every team's value at that season;
// picks fill up to six and a seventh is refused with a note; removing a team drops its
// line; re-charting draws the rest; an old single-team link still charts its one team.
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
  // Loading state: the chart button reads "Chart it" again once lists or a chart have loaded.
  const idle = () =>
    page.getByRole('button', { name: 'Chart it' }).waitFor({ timeout: 120_000 });
  const legend = page.getByTestId('trends-legend');
  const has = async (loc, text) => {
    const t = await loc.innerText();
    if (!t.includes(text)) throw new Error(`${await loc.getAttribute('data-testid')} lacks "${text}": ${t.slice(0, 200)}`);
  };
  const count = async (loc, n, what) => {
    const got = await loc.count();
    if (got !== n) throw new Error(`${what}: expected ${n}, got ${got}`);
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
  await page.waitForTimeout(1200);

  // Fill to six, then a seventh pick is refused with a note, never cycled.
  const add = page.getByLabel('Add a team');
  for (const [i, t] of MORE.entries()) {
    await add.selectOption(t);
    await urlTeams([...THREE, ...MORE.slice(0, i + 1)]);
    await page.waitForTimeout(500);
  }
  await add.selectOption(SEVENTH);
  await has(page.getByTestId('trends-note'), `Remove one to add ${SEVENTH}`);
  if (teamsInUrl().includes(SEVENTH)) throw new Error('a 7th team reached the URL');
  await page.waitForTimeout(1200);

  // Chart all six, then remove one: its line and URL key go, the rest keep their colours.
  await page.getByRole('button', { name: 'Chart it' }).click();
  await page.getByRole('button', { name: 'Charting…' }).waitFor({ timeout: 10_000 });
  await idle();
  await page.locator(CHART).waitFor({ timeout: 60_000 });
  await count(page.getByTestId('trends-end-label'), 6, 'end labels');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: `Remove ${THREE[1]}` }).click();
  await urlTeams([THREE[0], THREE[2], ...MORE]);
  await count(page.getByTestId('trends-end-label'), 5, 'end labels after a removal');
  await page.waitForTimeout(1500);

  // The old single-team link still charts its one team.
  await page.goto(`${base}/platform/trends?sport=nba&team=${encodeURIComponent(THREE[0])}&stat=avgRebounds`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(CHART).waitFor({ timeout: 120_000 });
  await idle();
  await count(page.getByTestId('trends-end-label'), 1, 'end labels on an old link');
  await page.waitForTimeout(1200);
};
export default trendsV2;
