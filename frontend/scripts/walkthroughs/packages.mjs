// Example: open the packages directory, read down it, then flip the theme and back
// (the nav's "Toggle theme" button). The flip-back matters: the recorder asserts the page
// ends in the scheme it was asked to record.
export default async (page, base) => {
  await page.goto(base + '/packages', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
  const toggle = page.getByRole('button', { name: 'Toggle theme' }).first();
  const htmlClass = () => page.evaluate(() => document.documentElement.className);
  for (let i = 0; i < 2; i++) {
    const before = await htmlClass();
    await toggle.click();
    // assert the click changed the theme, not just that it completed
    await page.waitForFunction((prev) => document.documentElement.className !== prev, before, { timeout: 5000 });
    await page.waitForTimeout(900);
  }
};
