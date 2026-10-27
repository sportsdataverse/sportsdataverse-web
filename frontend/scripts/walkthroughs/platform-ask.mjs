// /platform/query Ask box (rules only, spec D3): a question becomes chips and an "ignored: …" line;
// a chip's value is edited in place and another chip removed; Enter opens the Query view the chips
// describe, and the builder runs it. Nothing is POSTed: the Ask form never leaves the page.
// /platform is behind org sign-in, so this is recorded locally (see the PR's Walkthrough clip) with
// SDV_SESSION_COOKIE = a minted authjs.session-token (isOrgMember: true, no accessToken), and
// SDV_TRIGGER_KEY on the local server for the Data API.
const steps = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const posts = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/')) posts.push(`${r.method()} ${r.url()}`);
  });

  await page.goto(base + '/platform/query', { waitUntil: 'domcontentloaded' });
  const ask = page.getByRole('textbox', { name: 'Ask', exact: true });
  await ask.waitFor({ timeout: 60_000 });
  const chips = page.getByRole('list', { name: 'Understood as' });

  // 1. words no rule places come back, never silently dropped
  await ask.pressSequentially('QBs with 65% completion', { delay: 40 });
  await page.getByTestId('ask-ignored').getByText('“65% completion”').waitFor();
  await chips.getByText('passing · QB').waitFor();
  await page.waitForTimeout(800);

  // 2. the spec's question: league from the page, table, metric threshold, season, sample minimum
  await ask.fill('');
  await ask.pressSequentially('NFL QBs with EPA/play over 0.2 in 2025, min 200 dropbacks', { delay: 30 });
  for (const t of ['NFL', 'passing · QB', 'EPA/Play >', 'Dropbacks ≥', '2025']) await chips.getByText(t, { exact: true }).waitFor();
  if (await page.getByTestId('ask-ignored').count()) throw new Error('the full question left words ignored');
  await page.waitForTimeout(600);

  // 3. edit a value in place, remove a chip
  await chips.getByRole('button', { name: 'Edit EPA/Play > 0.2' }).click();
  const editor = chips.getByRole('textbox', { name: 'EPA/Play > value' });
  await editor.fill('0.15');
  await editor.press('Enter');
  await chips.getByRole('button', { name: 'Edit EPA/Play > 0.15' }).waitFor();
  await chips.getByRole('button', { name: 'Remove Dropbacks ≥ 200' }).click();
  await page.waitForTimeout(600);

  // 4. Enter opens the view; the builder remounts on it and runs the query
  await ask.press('Enter');
  await page.waitForFunction(() => {
    const p = new URL(location.href).searchParams;
    return p.get('schema') === 'nfl' && p.get('table') === 'passing' && p.get('position_group') === 'QB' &&
      p.get('EPAplay__gt') === '0.15' && p.get('season') === '2025' && !p.has('dropbacks__gte');
  }, null, { timeout: 15_000 });
  await page.getByRole('grid').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  if (posts.length) throw new Error(`the Ask flow sent a non-GET API request: ${posts.join(' ')}`);
};
export default steps;
