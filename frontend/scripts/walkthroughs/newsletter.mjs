// Footer newsletter signup: scroll to it, submit a reserved-domain address (stored,
// never sent to Resend), and wait for the confirmation line.
export default async (page, base) => {
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Newsletter sign-up' });
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await form.getByRole('textbox').fill('walkthrough@example.com');
  await page.waitForTimeout(500);
  await form.getByRole('button', { name: 'Subscribe' }).click();
  await form.getByRole('status').filter({ hasText: 'on the list' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
};
