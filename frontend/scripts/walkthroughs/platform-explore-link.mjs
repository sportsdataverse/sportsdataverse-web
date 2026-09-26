// /platform/explore: a shared link restores dataset, table, season and a filter,
// runs the filtered preview, and editing the filter rewrites the address bar.
// /platform is behind org sign-in, so this is recorded locally (see the PR's
// Walkthrough clip) and is NOT listed on the PR's `Walkthrough steps:` line.
export default async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const link = '/platform/explore?tag=espn_cfb_pbp&table=play_by_play&season=2024&w.week=1&limit=50';
  await page.goto(base + link, { waitUntil: 'domcontentloaded' });
  await page.locator('table').first().waitFor({ timeout: 120_000 }); // the filtered preview ran
  const params = () => page.evaluate(() => Object.fromEntries(new URL(location.href).searchParams));
  const p = await params();
  if (p.season !== '2024' || p['w.week'] !== '1' || p.limit !== '50') throw new Error(`link not preserved: ${JSON.stringify(p)}`);
  const value = page.getByPlaceholder('value').first();
  if ((await value.inputValue()) !== '1') throw new Error('filter value was not restored');
  await value.fill('2');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('w.week') === '2', null, { timeout: 5_000 });
  await page.waitForTimeout(800);
};
