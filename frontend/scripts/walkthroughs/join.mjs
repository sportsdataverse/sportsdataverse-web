// /join end to end with a reserved-domain address (stored, never emailed or sent to Resend).
export default async (page, base) => {
  await page.goto(base + '/join', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Join form' });
  const inSet = (legend) => form.locator('fieldset').filter({ hasText: legend });
  const pick = async (legend, ...labels) => {
    for (const l of labels) { await inSet(legend).getByText(l, { exact: true }).click(); await page.waitForTimeout(250); }
  };
  await pick('What best describes you?', 'Student');
  await pick('Which languages', 'Python');
  await pick('Which sports', 'NBA');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('first find', 'GitHub');
  await pick('hear about updates', 'Discord');
  await pick('news delivered', 'Email / newsletter');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('mostly pull', 'Box scores');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('Email newsletter', 'Yes, sign me up');
  await pick('invite to the Discord', 'No');
  await form.getByPlaceholder('you@example.com').fill('walkthrough@example.com');
  await form.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('status').filter({ hasText: 'on the list' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
};
