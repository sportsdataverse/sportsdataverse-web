// /packages: a language chip narrows the directory to one section, the search box narrows it further
// (the two combine), a search that empties the section says so, and "All" brings the other sections
// back with the search still applied.
export default async (page, base) => {
  await page.goto(base + '/packages', { waitUntil: 'networkidle', timeout: 90_000 });
  // rows below sm, cards from sm up: count whichever is displayed
  const names = () => page.locator('main h3:visible').allInnerTexts();
  const sections = () => page.locator('main h2:visible').allInnerTexts();
  const all = await names();
  await page.waitForTimeout(1000);

  const chips = page.getByRole('group', { name: 'Filter packages by language' });
  // the chips are styled uppercase; match their names case-insensitively
  await chips.getByRole('button', { name: /^r$/i }).click();
  await page.waitForTimeout(900);
  const r = await names();
  if ((await sections()).join() !== 'R') throw new Error(`R chip shows sections ${await sections()}`);
  if (!(r.length > 0 && r.length < all.length)) throw new Error(`R chip: ${all.length} packages, then ${r.length}`);

  await page.getByLabel('Search packages').fill('hoop');
  await page.waitForTimeout(900);
  const both = await names();
  // the search reads title, sports and description, so a match need not have "hoop" in its name
  if (!(both.length > 0 && both.length < r.length)) throw new Error(`R + "hoop": ${both.join(', ')}`);
  await page.waitForTimeout(1000);

  // a search that empties the chosen section says so, in that section
  await page.getByLabel('Search packages').fill('zzzz-no-such-package');
  await page.getByText('No R packages match', { exact: false }).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(900);
  await page.getByLabel('Search packages').fill('hoop');
  await page.waitForTimeout(700);

  await chips.getByRole('button', { name: /^all$/i }).click();
  await page.waitForTimeout(900);
  if ((await sections()).length !== 3) throw new Error(`All chip shows sections ${await sections()}`);
  await page.getByLabel('Search packages').fill('');
  await page.waitForTimeout(1200);
};
