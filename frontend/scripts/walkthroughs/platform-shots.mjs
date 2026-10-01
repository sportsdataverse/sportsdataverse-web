// /platform/shots (P3 T2): a player-season's shots as hexagons on a true-unit court or rink.
// An NBA player (nba_stats 2026) draws at most 300 SVG marks with a legend; hovering the busiest
// hexagon outlines it and fills the in-chart readout with THAT bin's numbers ("23 shots · 48% FG ·
// 12 ft", computed here from the mark's own data-n/data-made, so a readout of another bin fails);
// Tab from the range input lands on the first mark and the arrow keys walk to the nearest mark in
// that direction, each driving the same readout (its aria-label); the min-n range by keyboard:
// Home (1) shows lone shots as dots (more marks, still ≤ 300) and End (15) reads "15+" (fewer),
// each mirrored as min= in the URL; two more players through the picker stay ≤ 300; Jamal Murray's
// backcourt heaves are omitted (the note counts them against the API's own rows, every mark
// touches the court frame); an NHL skater
// draws on the rink with the goals − xG legend, named once its 50,000-row per-game roster lands; a
// bare /platform/shots picks the default league's
// first listed player and draws. Then the league baseline (P3 T3): Rudy Gobert's hexagons are
// coloured FG% minus the league's FG% at each bin's mean distance (the F4 curve read through the
// proxy, recomputed here mark by mark from data-n/data-made/data-dist at the ±3/6/9 pp cuts), the
// legend is the diverging "FG% vs league at that distance" strip, and the hoop's bin reads above
// the league; a college player (no curve producer) and a failed curve read (the proxy answers
// 500) both fall back to the plain FG% ramp with a "no league baseline for <league> <season>" note.
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
  const range = page.getByLabel('Min shots per hex');
  /** The range by keyboard: Home and End are its ends, an arrow one step. */
  const pressMin = async (...keys) => {
    await range.focus();
    for (const k of keys) await page.keyboard.press(k);
    await page.waitForTimeout(250);
  };
  const active = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      const inMarks = !!el?.closest?.('[data-testid="shots-marks"]');
      const box = inMarks ? el.getBBox() : null;
      return { inMarks, tag: el?.tagName, label: el?.getAttribute('aria-label'), n: Number(el?.dataset?.n), made: Number(el?.dataset?.made), cx: box ? box.x + box.width / 2 : NaN, cy: box ? box.y + box.height / 2 : NaN };
    });

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
  // Keyboard: Tab from the range lands on the first mark (reading order), the readout is its
  // aria-label (its own numbers); ArrowDown and ArrowRight move to a mark below / to the right;
  // End reaches the last; Tab out clears the readout.
  await range.focus();
  await page.keyboard.press('Tab');
  let k = await active();
  if (!k.inMarks) fail(`Tab from the range landed on ${k.tag}, not a mark`);
  const first = await marks.locator('polygon, circle').first().evaluate((el) => el.getAttribute('aria-label'));
  if (k.label !== first) fail(`Tab landed on "${k.label}", not the first mark "${first}"`);
  const readsActive = async (step) => {
    const a = await active();
    const t = await readout.innerText();
    if (!a.inMarks || t !== a.label || !t.startsWith(`${a.n.toLocaleString('en-US')} shot`)) fail(`${step}: readout "${t}" vs focused mark "${a.label}" (n=${a.n})`);
    return a;
  };
  await readsActive('Tab');
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowDown');
  const down = await readsActive('ArrowDown');
  if (!(down.cy > k.cy)) fail(`ArrowDown moved to cy ${down.cy} from ${k.cy}`);
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');
  const right = await readsActive('ArrowRight');
  if (!(right.cx > down.cx)) fail(`ArrowRight moved to cx ${right.cx} from ${down.cx}`);
  await page.waitForTimeout(500);
  await page.keyboard.press('End');
  const last = await readsActive('End');
  const lastLabel = await marks.locator('polygon, circle').last().evaluate((el) => el.getAttribute('aria-label'));
  if (last.label !== lastLabel) fail(`End landed on "${last.label}", not the last mark "${lastLabel}"`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  if ((await active()).inMarks || !/Hover a hexagon/.test(await readout.innerText())) fail('Tab out of the marks did not clear the readout');
  console.log(`shots (a) keyboard ${width}: Tab → "${k.label}", ArrowDown → "${down.label}", ArrowRight → "${right.label}", End → "${last.label}"`);
  k = null;

  // (b) min-n by keyboard: Home (1) draws lone shots as dots (more marks, ≤ 300); End (15) reads "15+" and draws fewer.
  await pressMin('Home');
  const one = await drawn();
  const dots = await marks.locator('circle').count();
  if (one <= a || dots < 1) fail(`min 1: ${one} marks, ${dots} dots (was ${a})`);
  if (minParam() !== '1') fail(`URL min=${minParam()} after 1`);
  await page.waitForTimeout(600);
  await pressMin('End');
  const fifteen = await drawn();
  if (fifteen >= a || (await page.getByTestId('shots-min').innerText()) !== '15+') fail(`min 15: ${fifteen} marks, output "${await page.getByTestId('shots-min').innerText()}"`);
  if (minParam() !== '15') fail(`URL min=${minParam()} after 15`);
  const polys = await marks.locator('polygon').evaluateAll((els) => els.map((el) => Number(el.dataset.n)));
  if (polys.some((n) => n < 15)) fail('a hex under 15 shots is drawn at 15+');
  console.log(`shots (b) ${width}: Home → min 1 → ${one} marks (${dots} dots), End → min 15 → ${fifteen} marks`);
  await page.waitForTimeout(600);
  await pressMin('Home', 'ArrowRight');
  if (minParam() !== null) fail(`URL still carries min=${minParam()} at the default`);
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

  // (f) Jamal Murray 2026 heaves from the backcourt: the note counts the shots off the court
  // against the API's own rows, no mark sits outside the court frame, and data-marks is the
  // on-court bins alone.
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=1627750`, { waitUntil: 'domcontentloaded' });
  const f = await drawn();
  const rows = await page.evaluate(async () => (await (await fetch('/api/platform/query/run?schema=nba_stats&table=shots&season=2026&person_id=1627750&select=x_legacy,y_legacy&limit=50000')).json()).data);
  const off = rows.filter((r) => Math.abs(r.x_legacy / 10) > 25 || r.y_legacy / 10 < -5.25 || r.y_legacy / 10 > 41.75).length;
  if (off < 1) fail('Murray has no off-court shot in the rows: pick another player for this check');
  const noteF = await note.innerText();
  if (!noteF.includes(`${off} shots off the court omitted`)) fail(`note "${noteF}" does not count ${off} off-court shots`);
  // every mark intersects the court frame (feet, the group's own units): a shot at the edge bins
  // to a cell whose hexagon pokes up to a radius past the line (the viewBox clips it), but a
  // heave's bin would lie wholly beyond it
  const outside = await marks.locator('polygon, circle').evaluateAll((els) => els.filter((el) => { const b = el.getBBox(); return b.x + b.width < -25 || b.x > 25 || b.y + b.height < -5.25 || b.y > 41.75; }).length);
  if (outside) fail(`${outside} marks drawn wholly outside the court frame`);
  console.log(`shots (f) nba_stats 1627750 (Murray) 2026 ${width}: ${rows.length} rows, ${off} off the court omitted, ${f} marks every one touching the frame; note "${noteF}"`);
  await page.waitForTimeout(800);

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

  // (g) vs the league: Rudy Gobert 2026. The legend is the diverging strip at −9/−6/−3/+3/+6/+9 pp;
  // every mark's slot (data-slot, and its fill) is recomputed from its own numbers against the F4
  // league curve, so a mark coloured by another bin, another bucket (x_hi inclusive would shift a
  // boundary distance), or other cuts fails; the hoop's own bin reads above the league.
  const legendOf = async () => (await page.getByTestId('shots-legend').innerText()).replace(/\n/g, ' ');
  const slotsOf = () => marks.locator('polygon, circle').evaluateAll((els) => els.map((el) => ({ n: Number(el.dataset.n), made: Number(el.dataset.made), dist: Number(el.dataset.dist), slot: el.dataset.slot ?? null, fill: el.getAttribute('fill') })));
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203497`, { waitUntil: 'domcontentloaded' });
  const g = await drawn();
  await page.getByTestId('shots-title').filter({ hasText: 'Rudy Gobert · 2026' }).waitFor({ timeout: 60_000 });
  const gLegend = await legendOf();
  for (const want of ['FG% vs league at that distance', '−9', '−3', '+3', '+9', 'pp', 'dot = 1 shot']) if (!gLegend.includes(want)) fail(`vs-league legend lacks "${want}": "${gLegend}"`);
  if ((await page.getByTestId('shots-legend').getAttribute('data-ramp')) !== 'league') fail('the legend ramp is not "league"');
  const curve = await page.evaluate(async () => (await (await fetch('/api/platform/query/run?schema=nba_stats&table=metric_curves&season=2026&entity_type=league&metric=fg_pct_by_shot_distance&select=x_lo,x_hi,rate&limit=100')).json()).data);
  if (curve.length < 30) fail(`the 2026 nba_stats league curve has ${curve.length} rows`);
  const rateAt = (d) => curve.find((r) => d >= r.x_lo && d < r.x_hi)?.rate ?? null;
  const slotFor = (m) => {
    const league = rateAt(m.dist);
    if (league === null) return null;
    const delta = m.made / m.n - league;
    const mag = Math.abs(delta);
    const step = mag >= 0.09 ? 3 : mag >= 0.06 ? 2 : mag >= 0.03 ? 1 : 0;
    return step ? `div-${delta > 0 ? 'pos' : 'neg'}-${step}` : 'div-mid';
  };
  const gMarks = await slotsOf();
  const wrong = gMarks.filter((m) => m.slot !== slotFor(m) || m.fill !== `var(--color-chart-${m.slot})`);
  if (wrong.length) fail(`${wrong.length} of ${gMarks.length} marks coloured off the league curve, e.g. ${JSON.stringify(wrong[0])} (want ${slotFor(wrong[0])})`);
  const rim = gMarks.filter((m) => m.dist < 3).sort((a, b) => a.dist - b.dist);
  const hoop = rim[0];
  if (!hoop || hoop.dist > 1.5 || hoop.n < 100 || !/^div-pos-/.test(hoop.slot ?? '')) fail(`the hoop's bin does not read above the league: ${JSON.stringify(hoop)}`);
  const rimText = rim.map((m) => `${m.made}/${m.n} = ${Math.round((100 * m.made) / m.n)}% at ${m.dist.toFixed(2)} ft vs league ${(100 * rateAt(m.dist)).toFixed(1)}% → ${m.slot}`).join('; ');
  console.log(`shots (g) nba_stats 203497 (Gobert) 2026 ${width}: ${g} marks, every slot = its FG% − league at its distance; legend "${gLegend}"; bins under 3 ft: ${rimText}`);
  await page.waitForTimeout(800);

  // (h) No producer: a college player keeps the plain FG% ramp and the note says so.
  await page.goto(`${base}/platform/shots?league=mbb&season=2026&player=5185239`, { waitUntil: 'domcontentloaded' });
  const h = await drawn();
  if (h < 20) fail(`mbb 5185239: only ${h} marks`);
  const hNote = await note.innerText();
  if (!hNote.includes("no league baseline for Men's college basketball 2026")) fail(`mbb note: "${hNote}"`);
  const hLegend = await legendOf();
  if (!/^FG% /.test(hLegend) || /vs league/.test(hLegend) || (await page.getByTestId('shots-legend').getAttribute('data-ramp')) !== 'fg') fail(`mbb legend: "${hLegend}"`);
  const hSlots = await slotsOf();
  if (!hSlots.every((m) => /^seq-/.test(m.slot ?? '') && m.fill === `var(--color-chart-${m.slot})`)) fail(`mbb marks off the sequential ramp: ${JSON.stringify(hSlots.find((m) => !/^seq-/.test(m.slot ?? '')))}`);
  console.log(`shots (h) mbb 5185239 2026 ${width}: ${h} marks on the FG% ramp; note "${hNote}"`);
  await page.waitForTimeout(800);

  // (i) A failed curve read: the proxy answers 500 for metric_curves, and the NBA view falls back
  // the same way (the note, the FG% ramp), with no error box — the shots themselves landed.
  const curves = (url) => url.pathname === '/api/platform/query/run' && url.searchParams.get('table') === 'metric_curves';
  await page.route(curves, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"metric_curves is down"}' }));
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203497`, { waitUntil: 'domcontentloaded' });
  const i = await drawn();
  const iNote = await note.innerText();
  if (!iNote.includes('no league baseline for NBA (NBA Stats) 2026')) fail(`failed-read note: "${iNote}"`);
  if ((await page.getByTestId('shots-legend').getAttribute('data-ramp')) !== 'fg') fail(`failed read did not fall back: legend "${await legendOf()}"`);
  if (!(await slotsOf()).every((m) => /^seq-/.test(m.slot ?? ''))) fail('a mark is off the sequential ramp after the failed curve read');
  if (await page.getByTestId('shots-error').count()) fail(`the failed curve read raised the error box: "${await page.getByTestId('shots-error').innerText()}"`);
  await page.unroute(curves);
  console.log(`shots (i) ${width}: metric_curves 500 → ${i} marks on the FG% ramp; note "${iNote}"`);
  await page.waitForTimeout(800);
};
export default shots;
