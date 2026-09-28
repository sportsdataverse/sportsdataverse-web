// /platform/wp: picking a game writes sport, season and game into the URL, and
// reloading that URL redraws the same chart with no clicks.
export default async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/wp?sport=nfl&season=2024', { waitUntil: 'domcontentloaded' });
  const game = page.locator('select').nth(1);
  await page.waitForFunction(() => (document.querySelectorAll('select')[1]?.options.length ?? 0) > 1, null, { timeout: 120_000 });
  const id = await game.locator('option').nth(1).getAttribute('value');
  await game.selectOption(id);
  await page.waitForFunction((g) => new URL(location.href).searchParams.get('game') === g, id, { timeout: 60_000 });
  const chart = page.getByTestId('wp-chart');
  await chart.waitFor({ timeout: 60_000 });
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); // the shared link
  await chart.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
};
