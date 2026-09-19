// Example: open the packages directory and use its filters.
export default async (page, base) => {
  await page.goto(base + '/packages', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
};
