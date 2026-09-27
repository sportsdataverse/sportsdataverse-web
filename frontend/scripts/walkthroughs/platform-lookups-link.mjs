// /platform/lookups: a shared search runs against the newest roster season.
export default async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/lookups?sport=cfb&q=smith', { waitUntil: 'domcontentloaded' });
  await page.getByText(/^cfb_rosters_\d{4}\.parquet$/).waitFor({ timeout: 60_000 });
  await page.locator('table tbody tr').first().waitFor({ timeout: 60_000 });
  if ((await page.getByPlaceholder(/Search CFB players/).inputValue()) !== 'smith') throw new Error('search term not restored');
  await page.waitForTimeout(800);
};
