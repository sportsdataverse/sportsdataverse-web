// /status on any device: open /status#<producer>, close that group, then click a link to the same hash.
// The URL already has the hash, so no hashchange fires; the click alone must reopen the group and bring it
// into view.
export default async (page, base) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/status', { waitUntil: 'networkidle', timeout: 90_000 });
  // a producer that starts closed and has a link to it in the release table
  const id = await page.evaluate(() => {
    for (const a of document.querySelectorAll('#release-tags tbody tr[data-tag] a[href^="#"]')) {
      const d = document.getElementById(a.getAttribute('href').slice(1));
      if (d && d.tagName === 'DETAILS' && !d.open) return d.id;
    }
    return null;
  });
  if (!id) throw new Error('no closed producer group with a release-table link on /status');

  await page.goto(`${base}/status#${id}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForFunction((g) => document.getElementById(g)?.open === true, id, { timeout: 5000 });
  await page.waitForTimeout(1000);

  // the reader closes the group; the hash stays in the URL
  await page.evaluate((g) => { document.getElementById(g).open = false; }, id);
  if (await page.evaluate((g) => document.getElementById(g).open, id)) throw new Error(`#${id} would not close`);

  // scroll away so "in view" is a real check, then follow a link to the same hash
  await page.evaluate(() => window.scrollTo(0, 0));
  const link = page.locator(`#release-tags tbody tr[data-tag] a[href="#${id}"]`).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await page.waitForFunction((g) => document.getElementById(g)?.open === true, id, { timeout: 5000 });
  await page.waitForTimeout(1200);
  const { top, vh } = await page.evaluate((g) => ({ top: document.getElementById(g).getBoundingClientRect().top, vh: innerHeight }), id);
  if (top < 0 || top > vh * 0.75) throw new Error(`#${id} reopened but sits at ${Math.round(top)}px of ${vh}px`);
  await page.waitForTimeout(1200);
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
};
