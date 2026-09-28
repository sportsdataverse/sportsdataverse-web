// /platform/rolling: the hero cards, the risers/fallers card and the span line render;
// each tab, the active toggle, the window and the league change the rows and the URL.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on
// the PR's `Walkthrough steps:` line (CI has no session; the module throws there).
const rolling = async (page, base) => {
  // /platform needs an org-member session: a cookie minted per memory
  // sdv_web_admin_clip_recipe (isOrgMember: true, no accessToken).
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  await page.goto(base + '/platform/rolling', { waitUntil: 'domcontentloaded' });
  const hero = page.getByTestId('rolling-hero');
  const movers = page.getByTestId('rolling-movers');
  await page.getByTestId('rolling-span').waitFor({ timeout: 120_000 });
  await hero.locator('.font-barlow').first().waitFor({ timeout: 60_000 });
  await movers.locator('tbody tr').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);

  // A change of view swaps the rows: wait until the named card's text differs.
  const changes = async (card, act) => {
    const before = await card.innerText();
    await act();
    await page.waitForFunction(
      ([id, prev]) => {
        const t = document.querySelector(`[data-testid="${id}"]`)?.innerText ?? '';
        return t !== prev && !t.includes('Loading');
      },
      [await card.getAttribute('data-testid'), before],
      { timeout: 60_000 }
    );
    await page.waitForTimeout(1200);
  };
  const urlHas = (k, v) => page.waitForFunction(([k, v]) => new URL(location.href).searchParams.get(k) === v, [k, v]);

  await changes(hero, () => page.getByRole('tab', { name: 'Most improved' }).click());
  await urlHas('tab', 'improved');
  await changes(hero, () => page.getByRole('tab', { name: 'Coldest' }).click());
  await urlHas('tab', 'coldest');
  // Active off lets in anyone whose last event is older than two weeks.
  await changes(movers, () => page.getByRole('checkbox', { name: 'Active only' }).click());
  await urlHas('active', '0');
  await changes(movers, () => page.getByLabel('Window').selectOption('300'));
  await urlHas('window', '300');
  await changes(movers, () => page.getByRole('button', { name: 'NFL' }).click());
  await urlHas('league', 'nfl');
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); // the shared link
  await movers.locator('tbody tr').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
};
export default rolling;
