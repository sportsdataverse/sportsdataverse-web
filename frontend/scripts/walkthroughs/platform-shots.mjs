// /platform/shots (P3 T2): a player-season's shots as hexagons on a true-unit court or rink.
// An NBA player (nba_stats 2026) draws at most 300 SVG marks with a legend; hovering the busiest
// hexagon outlines it and fills the in-chart readout with THAT bin's numbers ("23 shots · 48% FG ·
// 12 ft", computed here from the mark's own data-n/data-made, so a readout of another bin fails);
// the min-n range: 1 shows lone shots as dots (more marks, still ≤ 300) and 15 reads "15+" (fewer),
// each mirrored as min= in the URL; two more players through the picker stay ≤ 300; an NHL skater
// draws on the rink with the goals − xG legend, named once its 50,000-row per-game roster lands; a
// bare /platform/shots picks the default league's
// first listed player and draws.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).

const NBA = '/platform/shots?league=nba_stats&season=2026&player=1628983';
const NHL = '/platform/shots?league=nhl&season=2026&player=8477492';

const shots = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const width = page.viewportSize()?.width ?? 0;
  const marks = page.locator('[data-testid="shots-marks"]');
  const readout = page.getByTestId('shots-readout');
  const note = page.getByTestId('shots-note');
  /** Marks once the read has landed: the note counts the shots (or says there are none). */
  const drawn = async () => {
    await page.waitForFunction(() => {
      const t = document.querySelector('[data-testid="shots-note"]')?.textContent ?? '';
      return !t.startsWith('Loading') && /shots/.test(t);
    }, null, { timeout: 120_000 });
    await page.waitForTimeout(300);
    const n = await marks.locator('polygon, circle').count();
    const attr = Number(await marks.getAttribute('data-marks'));
    if (n !== attr) fail(`${n} SVG marks but data-marks says ${attr}`);
    if (n > 300) fail(`${n} marks: over the 300-mark rule`);
    return n;
  };
  const minParam = () => new URL(page.url()).searchParams.get('min');
  const setMin = async (v) => {
    const range = page.getByLabel('Min shots per hex');
    await range.focus();
    // a range input moves by keyboard; Home/End hit the ends, arrows step
    await range.evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await page.waitForTimeout(250);
  };

  // (a) An NBA player: ≤ 300 marks, a legend, the player in the URL, the hover readout.
  await page.goto(`${base}${NBA}`, { waitUntil: 'domcontentloaded' });
  const a = await drawn();
  if (a < 50) fail(`nba_stats 1628983: only ${a} marks`);
  await page.getByTestId('shots-title').filter({ hasText: 'Shai Gilgeous-Alexander · 2026' }).waitFor({ timeout: 60_000 });
  const legend = await page.getByTestId('shots-legend').innerText();
  if (!/FG%/.test(legend) || !/dot = 1 shot/.test(legend)) fail(`legend: "${legend}"`);
  if (new URL(page.url()).searchParams.get('player') !== '1628983') fail('the player is not in the URL');
  const noteA = await note.innerText();
  if (!/^[\d,]+ shots · [\d,]+ made \(\d+%\) · \d+ hexagons, \d+ shown at 2\+ shots$/.test(noteA)) fail(`note: "${noteA}"`);
  // the busiest hexagon, by its own data-n
  const busiest = await marks.locator('polygon').evaluateAll((els) => {
    let best = 0;
    els.forEach((el, i) => {
      if (Number(el.dataset.n) > Number(els[best].dataset.n)) best = i;
    });
    return { i: best, n: Number(els[best].dataset.n), made: Number(els[best].dataset.made) };
  });
  const hex = marks.locator('polygon').nth(busiest.i);
  await hex.scrollIntoViewIfNeeded();
  await hex.hover();
  await page.waitForTimeout(300);
  const text = await readout.innerText();
  const want = `${busiest.n.toLocaleString('en-US')} shots · ${Math.round((100 * busiest.made) / busiest.n)}% FG · `;
  if (!text.startsWith(want)) fail(`readout "${text}" for the hex with n=${busiest.n} made=${busiest.made} (want "${want}…")`);
  if (!/\d+ ft$/.test(text)) fail(`readout has no distance: "${text}"`);
  if (!/stroke-foreground/.test((await hex.getAttribute('class')) ?? '')) fail('the hovered hex is not outlined');
  console.log(`shots (a) nba_stats 1628983 2026 ${width}: ${a} marks; note "${noteA}"; busiest hex n=${busiest.n} → readout "${text}"`);
  await page.waitForTimeout(800);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  if (!/Hover a hexagon/.test(await readout.innerText())) fail('the readout did not clear on leave');

  // (b) min-n: 1 draws lone shots as dots (more marks, ≤ 300); 15 reads "15+" and draws fewer.
  await setMin(1);
  const one = await drawn();
  const dots = await marks.locator('circle').count();
  if (one <= a || dots < 1) fail(`min 1: ${one} marks, ${dots} dots (was ${a})`);
  if (minParam() !== '1') fail(`URL min=${minParam()} after 1`);
  await page.waitForTimeout(600);
  await setMin(15);
  const fifteen = await drawn();
  if (fifteen >= a || (await page.getByTestId('shots-min').innerText()) !== '15+') fail(`min 15: ${fifteen} marks, output "${await page.getByTestId('shots-min').innerText()}"`);
  if (minParam() !== '15') fail(`URL min=${minParam()} after 15`);
  const polys = await marks.locator('polygon').evaluateAll((els) => els.map((el) => Number(el.dataset.n)));
  if (polys.some((n) => n < 15)) fail('a hex under 15 shots is drawn at 15+');
  console.log(`shots (b) ${width}: min 1 → ${one} marks (${dots} dots), min 15 → ${fifteen} marks`);
  await page.waitForTimeout(600);
  await setMin(2);
  await drawn();

  // (c) Two more players through the picker, each ≤ 300.
  const picker = page.getByLabel('Player');
  const options = await picker.locator('option').evaluateAll((els) => els.map((o) => ({ id: o.value, name: o.textContent })).filter((o) => o.id));
  const counts = [];
  for (const o of [options[1], options[Math.floor(options.length / 2)]]) {
    await picker.selectOption(o.id);
    // the title names the new player in the same render that starts the read, so a count after it is theirs
    await page.getByTestId('shots-title').filter({ hasText: o.name }).waitFor();
    await page.waitForFunction((id) => new URL(location.href).searchParams.get('player') === id, o.id);
    counts.push(`${o.name} ${await drawn()}`);
    await page.waitForTimeout(500);
  }
  console.log(`shots (c) ${width}: ${options.length} players listed; ${counts.join(', ')}`);

  // (d) An NHL skater on the rink: the goals − xG legend, a readout with the xG line.
  await page.goto(`${base}${NHL}`, { waitUntil: 'domcontentloaded' });
  const d = await drawn();
  if (d < 30) fail(`nhl 8477492: only ${d} marks`);
  // the NHL roster is a 50,000-row read (per player-game): the name lands after the shots
  await page.getByTestId('shots-title').filter({ hasText: 'Nathan MacKinnon · 2026' }).waitFor({ timeout: 120_000 });
  if ((await page.getByLabel('Player').inputValue()) !== '8477492') fail('the picker did not select the URL skater');
  if (!(await page.getByRole('img', { name: 'Attacking half of the rink' }).count())) fail('no rink');
  const rinkLegend = await page.getByTestId('shots-legend').innerText();
  if (!/goals − xG per shot/.test(rinkLegend)) fail(`rink legend: "${rinkLegend}"`);
  const rinkHex = marks.locator('polygon').first();
  await rinkHex.scrollIntoViewIfNeeded();
  await rinkHex.hover();
  await page.waitForTimeout(300);
  const rinkText = await readout.innerText();
  const [rn, rmade] = await rinkHex.evaluate((el) => [Number(el.dataset.n), Number(el.dataset.made)]);
  if (!rinkText.startsWith(`${rn} shots · ${rmade} goal`) || !/vs xG/.test(rinkText)) fail(`rink readout "${rinkText}" for n=${rn} goals=${rmade}`);
  console.log(`shots (d) nhl 8477492 2026 ${width}: ${d} marks on the rink; note "${await note.innerText()}"; readout "${rinkText}"`);
  await page.waitForTimeout(800);

  // (e) Bare /platform/shots: the default league, the first listed player, a drawing.
  await page.goto(`${base}/platform/shots`, { waitUntil: 'domcontentloaded' });
  const e = await drawn();
  const q = new URL(page.url()).searchParams;
  if (q.get('league') || !q.get('player') || !q.get('season')) fail(`bare URL became ${page.url()}`);
  if ((await page.getByLabel('League').inputValue()) !== 'nba_stats') fail('the default league is not nba_stats');
  console.log(`shots (e) ${width}: bare URL → ${await page.getByTestId('shots-title').innerText()} with ${e} marks (${page.url().replace(base, '')})`);
  await page.waitForTimeout(800);
};
export default shots;
