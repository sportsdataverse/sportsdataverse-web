// /platform/rolling: the hero cards, the risers/fallers card and the span line render;
// each tab, the active toggle, each card's own window and the league change the rows and
// the URL, and switching one card's window leaves the other card's window alone.
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
  const has = async (loc, text) => {
    const t = await loc.innerText();
    if (!t.includes(text)) throw new Error(`${await loc.getAttribute('data-testid')} lacks "${text}": ${t.slice(0, 200)}`);
  };
  const spanHas = (text) => has(span, text);
  const win = (card) => new URL(page.url()).searchParams.get(`win.${card}`);
  // The default view is CFB EPA / dropback: windows 50 (the default, so no URL key), 100, 300.
  const pickWindow = (card, n) => async () => {
    await page.getByTestId(`win-${card}`).click();
    await page.getByRole('menuitemradio', { name: `Last ${n} dropbacks` }).click();
  };

  await settle(hero, () => page.getByRole('tab', { name: 'Most improved' }).click(), 'tab', 'improved');
  await settle(hero, () => page.getByRole('tab', { name: 'Coldest' }).click(), 'tab', 'coldest');
  // Active off lets in anyone whose last event is older than two weeks.
  await settle(movers, () => page.getByRole('checkbox', { name: 'Active only' }).click(), 'active', '0');
  await spanHas('active filter off');
  await spanHas('Full windows only');
  // One card's window: the other card keeps its URL key, its menu and its own window label.
  await settle(movers, pickWindow('movers', 300), 'win.movers', '300');
  if (win('hero') !== null) throw new Error(`win.hero moved to ${win('hero')} with the movers card`);
  await has(movers, 'last 300 dropbacks vs the 300 before');
  await has(page.getByTestId('win-hero'), 'Last 50 dropbacks');
  await has(hero, 'Last 50 dropbacks');
  await settle(hero, pickWindow('hero', 100), 'win.hero', '100');
  if (win('movers') !== '300') throw new Error(`win.movers moved to ${win('movers')} with the hero card`);
  await has(hero, 'Last 100 dropbacks');
  await has(page.getByTestId('win-movers'), 'Last 300 dropbacks');
  await has(movers, 'last 300 dropbacks vs the 300 before');
  await settle(movers, () => page.getByRole('button', { name: 'NFL' }).click(), 'league', 'nfl');
  if ((await movers.locator('tbody tr').count()) === 0) throw new Error('no NFL movers rows');
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); // the shared link
  await movers.locator('tbody tr').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1200);
};
export default rolling;
