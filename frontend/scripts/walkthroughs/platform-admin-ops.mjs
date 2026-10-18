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
  // Expand the first job through its keyboard-reachable button and wait for the
  // log request to succeed, not just for the "Loading log…" placeholder.
  const log = page.waitForResponse((r) => r.url().includes('/api/platform/admin/joblog') && r.ok(), { timeout: 15_000 });
  const firstJob = page.locator('section:has(h3:text-is("Jobs")) tbody tr button[aria-expanded]').first();
  await firstJob.focus();
  await page.keyboard.press('Enter');
  await log;
  if ((await firstJob.getAttribute('aria-expanded')) !== 'true') throw new Error('job row did not expand');
  await page.waitForTimeout(1_200);
  await page.getByRole('button', { name: 'All recent runs' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('heading', { name: 'Timers' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);
};
