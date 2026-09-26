// Identified survey: answer every step and land on the thank-you view.
export default async (page, base) => {
  await page.goto(base + '/survey', { waitUntil: 'networkidle', timeout: 90_000 });
  const form = page.getByRole('form', { name: 'Survey' });
  // the three channel questions on the discovery step share option labels, so
  // address each by its fieldset (legend text) rather than by label alone
  const inSet = (legend) => form.locator('fieldset').filter({ hasText: legend });
  const pick = async (legend, ...labels) => {
    for (const l of labels) { await inSet(legend).getByText(l, { exact: true }).click(); await page.waitForTimeout(250); }
  };
  await pick('What best describes you?', 'Developer / engineer');
  await pick('Which languages', 'R');
  await pick('Which sports', 'CFB');
  await form.getByLabel('Country', { exact: true }).selectOption('US');
  await form.getByLabel('State / province', { exact: true }).selectOption('TX');
  await form.getByPlaceholder('City (optional)', { exact: true }).fill('Austin');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  await pick('first find', 'Twitter / X');
  await pick('hear about updates', 'GitHub', 'Email / newsletter');
  await pick('news delivered', 'Email / newsletter');
  await form.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(600);
  // follow-ups: at least the data types + following question are visible
  await pick('mostly pull', 'Play-by-play');
  await pick('following us', 'Yes');
  await form.getByPlaceholder('Your name', { exact: true }).fill('Walkthrough Tester');
  await form.getByPlaceholder('you@example.com', { exact: true }).fill('walkthrough-survey@example.com');
  await form.getByPlaceholder('GitHub handle (optional)', { exact: true }).fill('https://github.com/octocat');
  await form.getByRole('button', { name: 'Send answers' }).click();
  await page.getByRole('status').filter({ hasText: 'Thanks' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
};
