// /platform/lookups: switch to CFB and run a player search. Member-only page —
// record locally with a minted org-member session (see the sdv-web admin clip
// recipe); the automated pr-evidence workflow cannot reach /platform/**.
// Needs SDV_SESSION_COOKIE (an authjs.session-token value) set in the
// environment; it is never read from a committed file.
export default async (page, base) => {
  const cookie = process.env.SDV_SESSION_COOKIE;
  if (!cookie) throw new Error('SDV_SESSION_COOKIE is required to record this member-only page');
  await page.context().addCookies([
    { name: 'authjs.session-token', value: cookie, url: base },
  ]);
  await page.goto(base + '/platform/lookups', { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'CFB', exact: true }).click();
  const input = page.getByPlaceholder('Search CFB players…');
  await input.waitFor({ timeout: 15_000 });
  await input.fill('Manning');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('table').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
};
