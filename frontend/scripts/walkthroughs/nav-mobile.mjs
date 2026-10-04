// The skip link is the first tab stop; on phones the sheet menu closes when a link is tapped,
// including the link for the page you are already on.
export default async (page, base) => {
  await page.goto(base + '/about', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'Skip to content' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800);
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (!(await menu.isVisible())) {
    // desktop: the flat header links are shown instead of the sheet
    await page.locator('header nav').getByRole('link', { name: 'Packages' }).click();
    await page.waitForURL('**/packages', { timeout: 10000 });
    await page.waitForTimeout(1000);
    return;
  }
  const dialog = page.getByRole('dialog');
  await menu.click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800);
  await dialog.getByRole('link', { name: 'Packages' }).click();
  await page.waitForURL('**/packages', { timeout: 10000 });
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  // same-route tap: nothing navigates, the sheet must still close
  await menu.click();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  await dialog.getByRole('link', { name: 'Packages' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(1000);
};
