// /status on any device: a link to a collapsed producer group (/status#<producer>, what the package
// cards use) lands on that group open; the release-tag filter still narrows the stacked rows; a producer
// link in the release table opens its closed group through a hash change; a malformed hash is harmless.
export default async (page, base) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/status', { waitUntil: 'networkidle', timeout: 90_000 });
  const closed = () => page.evaluate(() => [...document.querySelectorAll('#producers details:not([open])')].map((d) => d.id));
  const [first] = await closed();
  if (!first) throw new Error('no closed producer <details> group on /status');

  // a fresh load of /status#<producer> (from another page, so it is a load, not a hash change):
  // the group opens and its summary is on screen
  await page.goto(base + '/about', { waitUntil: 'load', timeout: 90_000 });
  await page.goto(`${base}/status#${first}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForFunction((id) => document.getElementById(id)?.open === true, first, { timeout: 5000 });
  const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, first);
  const vh = page.viewportSize().height;
  if (top < 0 || top > vh / 2) throw new Error(`#${first} opened but sits at ${Math.round(top)}px of ${vh}px`);
  await page.waitForTimeout(1500);

  // the tag filter narrows the release rows, whichever layout they are in
  const shown = () => page.locator('#release-tags tbody tr[data-tag]:not([hidden])').count();
  const before = await shown();
  const box = page.getByLabel('Filter release tags by tag or producer');
  await box.scrollIntoViewIfNeeded();
  await box.fill('nfl');
  await page.waitForTimeout(800);
  const after = await shown();
  if (!(after > 0 && after < before)) throw new Error(`filter: ${before} rows, then ${after} for "nfl"`);
  await page.waitForTimeout(1200);

  // a producer link in a visible row points at a closed group: following it opens that group
  const id = await page.evaluate(() => {
    for (const a of document.querySelectorAll('#release-tags tbody tr[data-tag]:not([hidden]) a[href^="#"]')) {
      const d = document.getElementById(a.getAttribute('href').slice(1));
      if (d && d.tagName === 'DETAILS' && !d.open) return d.id;
    }
    return null;
  });
  if (id) {
    await page.locator(`#release-tags tbody tr[data-tag]:not([hidden]) a[href="#${id}"]`).first().click();
    await page.waitForFunction((g) => document.getElementById(g)?.open === true, id, { timeout: 5000 });
    await page.waitForTimeout(1500);
  }

  // a malformed %-escape in the hash opens nothing and throws nothing
  await page.evaluate(() => { window.location.hash = '%E0%A4%A'; });
  await page.waitForTimeout(500);
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
};
