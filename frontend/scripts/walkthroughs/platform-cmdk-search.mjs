// ⌘K entity search (P12 T2). On a platform page (Trends: the overview's Mongo reads stall a local
// build with no database) the palette opens by Ctrl/⌘+K (desktop) or the topbar
// button (mobile); typing "mahomes" sends ONE search — the 200 ms debounce swallows every keystroke
// but the last, and the request leaves ≥ 150 ms after it — and the Entities group lists typed hits
// within 300 ms of the last keystroke; Enter opens the first hit's view (Lookups, NFL, q=Patrick
// Mahomes, restored in the search box). "alabama" lists teams and games (≤ 8, no navigation group,
// since no page is named that), and a game opens Win probability on its sport, season and id;
// "espn_cfb_pbp" lists the release under Datasets (≤ 5) and opens Explore on that tag; "2024" lists
// the season hit, which opens Explore on the league's pbp release for 2024; a hit of an unknown type
// (the search mocked to answer one beside a team) is not listed; the navigation matches the query
// ("sho" lists Shots) and Escape closes.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).
const cmdkSearch = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (m) => {
    throw new Error(m);
  };
  const width = page.viewportSize()?.width ?? 0;
  const mobile = width < 768;
  const dialog = page.getByRole('dialog').filter({ has: page.locator('[cmdk-root]') });
  const input = page.getByPlaceholder(/Search players, teams/);
  const hits = (type) => dialog.locator(type ? `[cmdk-item][data-hit-type="${type}"]` : '[cmdk-item][data-hit-type]');
  const headings = async () => (await dialog.locator('[cmdk-group-heading]').allInnerTexts()).map((t) => t.trim());
  const pathOf = () => page.url().replace(base, '');
  // every search the palette sends, with the moment it left
  const searches = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/platform/search') searches.push({ q: u.searchParams.get('q'), at: Date.now() });
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    const s = u.pathname === '/api/platform/search' && searches.findLast((x) => x.q === u.searchParams.get('q'));
    if (s) s.status = r.status();
  });
  const openPalette = async () => {
    if (mobile) await page.getByRole('button', { name: 'Open command menu' }).click();
    else await page.keyboard.press('Control+k');
    await dialog.waitFor({ timeout: 10_000 });
    await input.waitFor();
    if ((await input.inputValue()) !== '') fail(`the palette reopened with "${await input.inputValue()}" in it`);
  };
  const closePalette = async () => {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  };
  /** Type a query, then wait for the first hit of `type`. Every time is on the page's own clock
   *  (performance.now): the last keystroke's input event, the search's resource timing, and the
   *  animation frame the hit first renders in. */
  const search = async (q, type) => {
    searches.length = 0;
    await input.pressSequentially(q, { delay: 60 });
    const sel = `[cmdk-item][data-hit-type="${type}"]`;
    const shown = await page
      .waitForFunction((s) => (document.querySelector(s) ? performance.now() : 0), sel, { polling: 'raf', timeout: 15_000 })
      .catch(() => fail(`no ${type} hit for "${q}" in 15 s; searches ${JSON.stringify(searches)}`));
    const shownAt = await shown.jsonValue();
    const t = await page.evaluate((want) => {
      const e = performance
        .getEntriesByType('resource')
        .filter((r) => { const u = new URL(r.name); return u.pathname === '/api/platform/search' && u.searchParams.get('q') === want; })
        .pop();
      return { last: window.__lastInput, start: e?.startTime ?? NaN, end: e?.responseEnd ?? NaN };
    }, q);
    return { left: t.start - t.last, fetched: t.end - t.start, landed: shownAt - t.last, rendered: shownAt - t.end };
  };

  // (a) mahomes: one debounced search, typed hits within 300 ms of the last keystroke.
  await page.addInitScript(() => document.addEventListener('input', () => { window.__lastInput = performance.now(); }, true));
  await page.goto(`${base}/platform/trends`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open command menu' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await openPalette();
  const a = await search('mahomes', 'player');
  const sent = searches.map((s) => s.q);
  if (sent.length !== 1 || sent[0] !== 'mahomes') fail(`${sent.length} searches sent while typing (${sent.join(', ')}): the debounce must send one, for "mahomes"`);
  // The debounce is the client's whole share of the wait: the request leaves ~200 ms after the last
  // keystroke and the list renders within 100 ms of the response. The fetch itself (the proxy and
  // F10, ~75–140 ms warm from the droplet) is logged, not asserted: on top of the 200 ms debounce it
  // decides whether the ≤ 300 ms target is met.
  const left = Math.round(a.left);
  if (!(left >= 180)) fail(`the search left ${left} ms after the last keystroke: the 200 ms debounce is missing`);
  if (!(a.rendered <= 100)) fail(`hits rendered ${Math.round(a.rendered)} ms after the response landed (want ≤ 100)`);
  const players = await hits('player').evaluateAll((els) => els.map((el) => ({ league: el.dataset.hitLeague, id: el.dataset.hitId, text: el.innerText.replace(/\s+/g, ' ').trim() })));
  if (!players.length || players.length > 8) fail(`${players.length} player hits`);
  if (!players.every((p) => /Patrick Mahomes/.test(p.text) && p.id === '3139477')) fail(`not every hit is Mahomes: ${JSON.stringify(players)}`);
  if (!/^PLAYER /i.test(players[0].text)) fail(`the hit is not typed: "${players[0].text}"`);
  const groupsA = await headings();
  if (groupsA[0] !== 'Entities' || groupsA.includes('Platform') || groupsA.includes('Site')) fail(`groups for "mahomes": ${groupsA.join(' | ')}`);
  console.log(`cmdk (a) ${width}: "mahomes" → 1 search, left ${left} ms after the last keystroke, fetched in ${Math.round(a.fetched)} ms, ${players.length} typed hits rendered ${Math.round(a.landed)} ms after it (${Math.round(a.rendered)} ms after the response): ${players.map((p) => `${p.league} ${p.text}`).join(' ; ')}`);
  await page.waitForTimeout(800);

  // (b) Enter opens the first hit's view: NFL Lookups with the name restored.
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/platform\/lookups\?/, { timeout: 30_000 });
  const lookupsPath = pathOf();
  if (lookupsPath !== '/platform/lookups?sport=nfl&q=Patrick+Mahomes') fail(`Enter opened ${lookupsPath}`);
  await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  const box = page.getByPlaceholder(/Search NFL players/);
  await box.waitFor({ timeout: 60_000 });
  if ((await box.inputValue()) !== 'Patrick Mahomes') fail(`the Lookups search box reads "${await box.inputValue()}"`);
  console.log(`cmdk (b) ${width}: Enter → ${lookupsPath}, search box "Patrick Mahomes"`);
  await page.waitForTimeout(800);

  // (c) alabama: teams and games (≤ 8, no navigation group); a game opens Win probability.
  await openPalette();
  const c = await search('alabama', 'game');
  await hits('team').first().waitFor({ timeout: 10_000 });
  const n = await hits().count();
  if (n > 8) fail(`${n} entity hits for "alabama" (max 8)`);
  const groupsC = await headings();
  if (groupsC.includes('Platform') || groupsC.includes('Site')) fail(`a navigation group lists for "alabama": ${groupsC.join(' | ')}`);
  const game = hits('game').first();
  const gameId = await game.getAttribute('data-hit-id');
  const gameText = (await game.innerText()).replace(/\s+/g, ' ').trim();
  const [teamsC, gamesC] = [await hits('team').count(), await hits('game').count()];
  await game.scrollIntoViewIfNeeded();
  await game.click();
  await page.waitForURL(/\/platform\/wp\?/, { timeout: 30_000 });
  const wpPath = pathOf();
  if (!new RegExp(`^/platform/wp\\?sport=cfb&season=\\d{4}&game=${gameId}$`).test(wpPath)) fail(`the game "${gameText}" opened ${wpPath}`);
  console.log(`cmdk (c) ${width}: "alabama" → left ${Math.round(c.left)} ms, fetched ${Math.round(c.fetched)} ms, rendered ${Math.round(c.landed)} ms after the last keystroke; ${n} hits (${teamsC} teams, ${gamesC} games); "${gameText}" → ${wpPath}`);
  await page.waitForTimeout(800);

  // (d) espn_cfb_pbp: the Datasets group (≤ 5) opens Explore on the tag.
  await openPalette();
  await search('espn_cfb_pbp', 'dataset');
  const tags = await hits('dataset').evaluateAll((els) => els.map((el) => el.dataset.hitId));
  if (tags.length > 5 || !tags.includes('espn_cfb_pbp')) fail(`datasets for "espn_cfb_pbp": ${tags.join(', ')}`);
  if (!tags.every((t) => t.includes('espn_cfb_pbp'))) fail(`a dataset off the query: ${tags.join(', ')}`);
  const groupsD = await headings();
  if (!groupsD.includes('Datasets')) fail(`groups for "espn_cfb_pbp": ${groupsD.join(' | ')}`);
  await dialog.locator('[cmdk-item][data-hit-type="dataset"][data-hit-id="espn_cfb_pbp"]').click();
  await page.waitForURL(/\/platform\/explore\?/, { timeout: 30_000 });
  if (pathOf() !== '/platform/explore?tag=espn_cfb_pbp') fail(`the dataset opened ${pathOf()}`);
  console.log(`cmdk (d) ${width}: "espn_cfb_pbp" → datasets ${tags.join(', ')} → ${pathOf()}`);
  await page.waitForTimeout(800);

  // (e) 2024: the season hit opens Explore on the league's play-by-play release for that season —
  // from Explore itself, whose client reads the URL once, so the palette must load the page afresh:
  // once the pickers settle (Explore adds its table to the URL) the season is still 2024.
  await openPalette();
  await search('2024', 'season');
  const season = hits('season').first();
  const seasonText = (await season.innerText()).replace(/\s+/g, ' ').trim();
  await season.click();
  await page.waitForURL(/[?&]season=2024(&|$)/, { timeout: 30_000 });
  await page.waitForURL(/[?&]table=/, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const landed = new URL(page.url()).searchParams;
  if (!['espn_cfb_pbp', 'nfl_model_pbp'].includes(landed.get('tag') ?? '') || landed.get('season') !== '2024') fail(`the season "${seasonText}" settled on ${pathOf()}`);
  console.log(`cmdk (e) ${width}: "2024" → "${seasonText}" → ${pathOf()}`);
  await page.waitForTimeout(800);

  // (f) A hit of a type the platform has no view for is not listed: the search is mocked to answer a
  // conference beside a team, and only the team lists.
  const mock = (url) => url.pathname === '/api/platform/search';
  await page.route(mock, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { type: 'conference', id: '8', label: 'SEC', sublabel: 'cfb', path: '/conference/8', league: 'cfb', season: null, score: 5 },
        { type: 'team', id: '333', label: 'Alabama', sublabel: 'ALA · SEC', path: '/team/333', league: 'cfb', season: null, score: 4 },
      ]),
    })
  );
  await openPalette();
  await search('sec', 'team');
  const listed = await hits().evaluateAll((els) => els.map((el) => `${el.dataset.hitType}:${el.dataset.hitId}`));
  if (listed.length !== 1 || listed[0] !== 'team:333') fail(`listed for the mocked search: ${listed.join(', ')} (want team:333 alone)`);
  if (await dialog.getByText('SEC', { exact: true }).count()) fail('the conference hit is listed');
  await page.unroute(mock);
  console.log(`cmdk (f) ${width}: a conference beside a team → listed ${listed.join(', ')} only`);
  await page.waitForTimeout(800);
  await closePalette();

  // (g) Navigation matches the query; Escape closes.
  await openPalette();
  await input.pressSequentially('sho', { delay: 60 });
  await dialog.getByRole('option', { name: 'Shots', exact: true }).waitFor({ timeout: 15_000 });
  const groupsG = await headings();
  if (!groupsG.includes('Platform')) fail(`groups for "sho": ${groupsG.join(' | ')}`);
  await page.waitForTimeout(600);
  await closePalette();
  console.log(`cmdk (g) ${width}: "sho" lists Shots under Platform; Escape closes`);
};
export default cmdkSearch;
