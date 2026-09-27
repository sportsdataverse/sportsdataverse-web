// /platform/trends: a shared link charts its team + stat once the lists load.
export default async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/trends?sport=nba&team=Boston%20Celtics&stat=avgRebounds', { waitUntil: 'domcontentloaded' });
  await page.locator('svg[aria-label="Rebounds Per Game by season"]').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
};
