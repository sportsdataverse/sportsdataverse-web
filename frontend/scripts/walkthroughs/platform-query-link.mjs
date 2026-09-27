// /platform/query: a shared link runs its query on arrival, and editing the order
// field rewrites the address bar (which is also the Data API request).
// Needs SDV_TRIGGER_KEY = a personal read-scope key on the local server.
export default async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/query?schema=cfb&table=passing&season=2025&order=-EPAplay&limit=25', { waitUntil: 'domcontentloaded' });
  await page.getByRole('grid').waitFor({ timeout: 60_000 }); // ran itself, no click
  const p = new URL(page.url()).searchParams;
  if (p.get('season') !== '2025' || p.get('order') !== '-EPAplay') throw new Error(`link not preserved: ${p}`);
  await page.getByPlaceholder('-season').fill('-TEPA');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('order') === '-TEPA', null, { timeout: 5_000 });
  await page.waitForTimeout(800);
};
