// /platform/admin/ops: the droplet status tab loads its gauges and job runs, a job
// row expands to its full command and log tail, and the Jobs view toggles to all
// recent runs. /platform is behind org sign-in, so this is recorded locally (see
// the PR's Walkthrough clip) and is NOT listed on the PR's `Walkthrough steps:` line.
export default async (page, base) => {
  // An org-admin session: a cookie minted per memory sdv_web_admin_clip_recipe
  // (isOrgMember: true, role: "admin", no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/admin/ops', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Jobs' }).waitFor({ timeout: 60_000 });
  await page.getByText('Load (1/5/15m)').waitFor();
  const firstJob = page.locator('section:has(h3:text-is("Jobs")) tbody tr').first();
  await firstJob.click();
  await page.getByText(/Loading log…|no log file found|\/logs?\//).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1_200);
  await page.getByRole('button', { name: 'All recent runs' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('heading', { name: 'Timers' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);
};
