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

  const urlHas = (k, v) => page.waitForFunction(([k, v]) => new URL(location.href).searchParams.get(k) === v, [k, v]);
  // A change of view: wait for the URL to name it and the card to finish loading. The rows
  // themselves may not differ (the top 3 can be active either way), so never wait on a change.
  const settle = async (card, act, k, v) => {
    await act();
    await urlHas(k, v);
    await page.waitForFunction(
      (id) => {
        const t = document.querySelector(`[data-testid="${id}"]`)?.innerText ?? '';
        return t !== '' && !t.includes('Loading');
      },
      await card.getAttribute('data-testid'),
      { timeout: 60_000 }
    );
    await page.waitForTimeout(1200);
  };
  const span = page.getByTestId('rolling-span');
  const spanHas = async (text) => {
    if (!(await span.innerText()).includes(text)) throw new Error(`span line lacks "${text}"`);
  };

  await settle(hero, () => page.getByRole('tab', { name: 'Most improved' }).click(), 'tab', 'improved');
  await settle(hero, () => page.getByRole('tab', { name: 'Coldest' }).click(), 'tab', 'coldest');
  // Active off lets in anyone whose last event is older than two weeks.
  await settle(movers, () => page.getByRole('checkbox', { name: 'Active only' }).click(), 'active', '0');
  await spanHas('active filter off');
  await settle(movers, () => page.getByLabel('Window').selectOption('300'), 'window', '300');
  await spanHas('last 300');
  await settle(movers, () => page.getByRole('button', { name: 'NFL' }).click(), 'league', 'nfl');
  if ((await movers.locator('tbody tr').count()) === 0) throw new Error('no NFL movers rows');
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); // the shared link
  await movers.locator('tbody tr').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
};
export default rolling;
