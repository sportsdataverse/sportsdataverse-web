// /join end to end with a reserved-domain address (stored, never emailed or sent to Resend).
// Also answers "yes" to the package question and fills the package fieldset (PR 3), and "yes"
// to the stickers question and fills the mailing-address fieldset (PR 4), so the evidence video
// shows those fields. Because the address is reserved, lib/join.ts's handleJoin skips
// submitPackage and the sticker request entirely — the person is stored with wants.package:
// true and wants.stickers: true, but this obviously-fake package and mailing address never
// reach the member CMS queue or the sticker_requests collection.
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
  await pick('Have you built a package', "Yes — I'll add the details");
  await pick('stickers in the mail', 'Yes please');
  await form.getByPlaceholder('Package name').fill('walkthrough-test-pkg');
  await form.getByPlaceholder('Sport or category (e.g. MBB)').fill('Testing');
  await form.getByPlaceholder('https://github.com/you/your-package').fill('https://example.com/walkthrough');
  await form.getByPlaceholder('What does it do?').fill('A fake package used only to exercise this form; never published.');
  await form.getByPlaceholder('Name on the envelope').fill('Walkthrough Tester');
  await form.getByPlaceholder('Country').fill('Nowhere');
  await form.getByPlaceholder('Address line 1').fill('1 Walkthrough Way');
  await form.getByPlaceholder('City').fill('Testville');
  await form.getByPlaceholder('you@example.com').fill('walkthrough@example.com');
  await form.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('status').filter({ hasText: 'on the list' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
};
