// /platform/query grid: a shared link opens in percentile shading; h and s on a
// cell land in the URL's grid.* keys, the query's own keys survive beside them,
// and no grid.* key ever reaches the Data API request.
// Needs SDV_TRIGGER_KEY = a personal read-scope key on the local server.
// /platform is behind org sign-in, so this is recorded locally (see the PR's
// Walkthrough clip) and is NOT listed on the PR's `Walkthrough steps:` line.
const steps = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const apiCalls = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/platform/query/run')) apiCalls.push(r.url());
  });
  await page.goto(base + '/platform/query?schema=cfb&table=passing&season=2025&limit=50&grid.tint=pct', { waitUntil: 'domcontentloaded' });
  const grid = page.getByRole('grid');
  await grid.waitFor({ timeout: 60_000 }); // the shared link ran itself
  await page.getByRole('button', { name: /percentile/i }).waitFor(); // grid.tint=pct restored
  const cell = grid.locator('td[data-cell="0-1"]');
  await cell.click();
  await cell.press('h'); // pct → off
  await page.waitForFunction(() => new URL(location.href).searchParams.get('grid.tint') === 'off', null, { timeout: 5_000 });
  await cell.press('s'); // sort that column ascending
  await page.waitForFunction(() => new URL(location.href).searchParams.has('grid.sort'), null, { timeout: 5_000 });
  if (!/[?&]season=2025(&|$)/.test(page.url())) throw new Error('the API request was lost from the URL');
  if (!apiCalls.length) throw new Error('the shared link never ran its query');
  const leaked = apiCalls.filter((u) => new URL(u).search.includes('grid.'));
  if (leaked.length) throw new Error(`grid.* reached the Data API: ${leaked.join(' ')}`);
  await page.waitForTimeout(800);
};
export default steps;
