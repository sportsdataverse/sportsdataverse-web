// /platform/wp: Export PNG downloads the chart as drawn (theme, team fills) with
// its title, legend and freshness footer. Georgia @ Alabama, 2024 week 5.
// The PNG is kept beside the clips for the acceptance check (both themes, both widths).
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on
// the PR's `Walkthrough steps:` line (CI has no session; the module throws there).
const exportPng = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/wp?sport=cfb&season=2024&game=401628374', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('wp-chart').waitFor({ timeout: 120_000 });
  // hover first: the kept PNG then also shows the hover overlay is left out
  await page.getByTestId('wp-chart').hover();
  await page.waitForTimeout(800);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PNG' }).click(),
  ]);
  const name = download.suggestedFilename();
  if (name !== 'wp_cfb_401628374.png') throw new Error(`unexpected export file name: ${name}`);
  const scheme = (await page.evaluate(() => document.documentElement.classList.contains('dark'))) ? 'dark' : 'light';
  const width = page.viewportSize()?.width ?? 0;
  await download.saveAs(`${process.env.OUT ?? 'img/walkthrough'}/${scheme}-${width}-${name}`);
  await page.waitForTimeout(800);
};
export default exportPng;
