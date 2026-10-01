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
// Then the modes and companions (P3 T4): Gobert's Smoothed view keeps every mark of the Raw view
// (same lattice, same sizes, ≤ 300) with at least one recoloured (the kernel does something) and
// says "smoothed" in the readout, legend and note; a curve bin with no attempt in the kernel's
// reach (Clint Capela's 17 ft) draws the league dot only, and each companion writes the hovered
// bin's numbers above itself; Zones draws the five court zones as fills
// whose shots sum to the drawn total, each lettered with its FG% and shots, the min-n range
// idle; the NHL skater's Zones are four; each mode is mirrored as mode= in the URL and Raw drops
// it. The companions share ONE hovered distance with the map: hovering the 24 ft bin on the
// curve draws the band on the court at exactly 24–25 ft (the circle's r − strokeWidth/2 is 24)
// and tints the butterfly's 24 ft column; hovering a hexagon tints the curve column holding its
// mean distance with no band on the map; the arrow keys walk the curve's bins and the band
// follows. The butterfly's left + right equal the drawn shots, and column by column equal the
// curve's bins.
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
    const n = await marks.locator('[data-n]').count();
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
  const picker = page.getByLabel('Player', { exact: true });
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
  if ((await page.getByLabel('Player', { exact: true }).inputValue()) !== '8477492') fail('the picker did not select the URL skater');
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
  if ((await page.getByLabel('League', { exact: true }).inputValue()) !== 'nba_stats') fail('the default league is not nba_stats');
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

  // (j) Modes. Gobert again, Raw → Smoothed → Zones → Raw by the segmented control (aria-pressed),
  // each mirrored as mode= in the URL (Raw drops it). Smoothed: the same marks at the same places
  // and sizes (every polygon's points and circle's cx/cy/r identical), ≤ 300, at least one with
  // another data-slot — the kernel moved a colour — and "smoothed" in the readout, the legend and
  // the note with the σ. Zones: 5 <path data-n> marks whose shots sum to the drawn total, a label
  // on each with its own FG% and shots, the min-n range disabled, "5 zones" in the note; the
  // restricted area's readout names it.
  const modeParam = () => new URL(page.url()).searchParams.get('mode');
  const modeButton = (label) => page.getByTestId('shots-mode').getByRole('button', { name: label, exact: true });
  const pressed = async () => (await page.getByTestId('shots-mode').locator('button[aria-pressed="true"]').allInnerTexts()).join('|');
  const geometry = () => marks.locator('[data-n]').evaluateAll((els) => els.map((el) => `${el.tagName}:${el.getAttribute('points') ?? `${el.getAttribute('cx')},${el.getAttribute('cy')},${el.getAttribute('r')}`}`));
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203497`, { waitUntil: 'domcontentloaded' });
  const jRaw = await drawn();
  await page.getByTestId('shots-title').filter({ hasText: 'Rudy Gobert · 2026' }).waitFor({ timeout: 60_000 });
  if ((await pressed()) !== 'Raw' || modeParam() !== null) fail(`initial mode: pressed "${await pressed()}", URL mode=${modeParam()}`);
  const rawGeom = await geometry();
  const rawSlots = await slotsOf();
  // (j0) A curve bin with no attempt within the kernel's reach — Clint Capela 2026 shoots at the
  // rim and the odd three, nothing at 17–18 ft: hovering it draws NO player dot (the line breaks
  // there, so does the dot) while the league dot and both readouts stand; leaving clears them.
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203991`, { waitUntil: 'domcontentloaded' });
  await drawn();
  await page.getByTestId('shots-title').filter({ hasText: 'Clint Capela · 2026' }).waitFor({ timeout: 60_000 });
  const unsupported = page.locator('[data-testid="shots-curve-bins"] rect:not([data-supported])');
  if ((await unsupported.count()) < 1) fail('Capela has no curve bin out of the kernel\'s reach: pick another player for this check');
  const uLo = await unsupported.first().getAttribute('data-lo');
  await unsupported.first().scrollIntoViewIfNeeded();
  await unsupported.first().hover();
  await page.waitForTimeout(300);
  const curveDots = page.locator('[data-testid="shots-curve-dot"]');
  const uDots = await curveDots.evaluateAll((els) => els.map((el) => el.getAttribute('fill')));
  if (uDots.length !== 1 || uDots[0] !== 'var(--color-chart-cat-2)') fail(`unsupported ${uLo} ft bin drew dots ${JSON.stringify(uDots)} (want the league's only)`);
  const uLabel = await unsupported.first().getAttribute('aria-label');
  if ((await page.getByTestId('shots-curve-readout').innerText()) !== uLabel) fail(`curve readout "${await page.getByTestId('shots-curve-readout').innerText()}" ≠ the bin's "${uLabel}"`);
  const uSide = await page.locator(`[data-testid="shots-butterfly-bins"] rect[data-lo="${uLo}"]`).getAttribute('aria-label');
  if ((await page.getByTestId('shots-butterfly-readout').innerText()) !== uSide) fail(`butterfly readout "${await page.getByTestId('shots-butterfly-readout').innerText()}" ≠ "${uSide}"`);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  if ((await curveDots.count()) !== 0 || !/Hover a distance/.test(await page.getByTestId('shots-curve-readout').innerText()) || !/Hover a column/.test(await page.getByTestId('shots-butterfly-readout').innerText())) fail('the dots or readouts did not clear on leave');
  console.log(`shots (j0) nba_stats 203991 (Capela) ${width}: unsupported ${uLo} ft bin → league dot only; readouts "${uLabel}" / "${uSide}"`);
  await page.waitForTimeout(600);
  // back to Gobert for the modes
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203497`, { waitUntil: 'domcontentloaded' });
  if ((await drawn()) !== jRaw) fail('Gobert did not redraw the same marks');
  await page.getByTestId('shots-title').filter({ hasText: 'Rudy Gobert · 2026' }).waitFor({ timeout: 60_000 });
  await modeButton('Smoothed').click();
  await page.waitForTimeout(400);
  const jSmooth = await drawn();
  if (jSmooth !== jRaw) fail(`Smoothed draws ${jSmooth} marks, Raw ${jRaw}`);
  if ((await pressed()) !== 'Smoothed' || modeParam() !== 'smoothed') fail(`Smoothed: pressed "${await pressed()}", URL mode=${modeParam()}`);
  const smoothGeom = await geometry();
  if (smoothGeom.join('\n') !== rawGeom.join('\n')) fail('Smoothed moved or resized a mark');
  const smoothSlots = await slotsOf();
  const moved = smoothSlots.filter((m, i) => m.slot !== rawSlots[i].slot).length;
  if (moved < 1) fail('Smoothed recoloured no mark: the kernel did nothing');
  if (smoothSlots.some((m, i) => m.n !== rawSlots[i].n)) fail('Smoothed changed a mark\'s shots');
  const jNote = await note.innerText();
  if (!/· smoothed, σ 3 ft$/.test(jNote)) fail(`smoothed note: "${jNote}"`);
  if (!/smoothed \(σ 3 ft\)/.test(await legendOf())) fail(`smoothed legend: "${await legendOf()}"`);
  const sHex = marks.locator('polygon').first();
  await sHex.scrollIntoViewIfNeeded();
  await sHex.hover();
  await page.waitForTimeout(300);
  const sText = await readout.innerText();
  if (!/ · smoothed$/.test(sText) || !/^\d+ shots · \d+% FG · \d+ ft/.test(sText)) fail(`smoothed readout: "${sText}"`);
  await page.mouse.move(0, 0);
  console.log(`shots (j) smoothed ${width}: ${jSmooth} marks (= raw ${jRaw}), same geometry, ${moved} recoloured; note "${jNote}"; readout "${sText}"`);
  await page.waitForTimeout(800);
  await modeButton('Zones').click();
  await page.waitForTimeout(400);
  const jZones = await drawn();
  if (jZones !== 5 || (await marks.locator('path[data-n]').count()) !== 5) fail(`Zones draws ${jZones} marks`);
  if ((await pressed()) !== 'Zones' || modeParam() !== 'zones') fail(`Zones: pressed "${await pressed()}", URL mode=${modeParam()}`);
  const zones = await marks.locator('path[data-n]').evaluateAll((els) => els.map((el) => ({ zone: el.dataset.zone, n: Number(el.dataset.n), made: Number(el.dataset.made), slot: el.dataset.slot ?? null, label: el.parentElement.querySelector('text')?.textContent ?? '' })));
  const drawnTotal = Number((await note.innerText()).match(/^([\d,]+) shots/)[1].replace(/,/g, ''));
  const zoneSum = zones.reduce((s, z) => s + z.n, 0);
  if (zoneSum !== drawnTotal) fail(`the zones hold ${zoneSum} shots, the note ${drawnTotal}`);
  for (const z of zones) if (z.n && z.label !== `${Math.round((100 * z.made) / z.n)}% · ${z.n.toLocaleString('en-US')}`) fail(`zone ${z.zone} labelled "${z.label}" for ${z.made}/${z.n}`);
  if (zones.map((z) => z.zone).sort().join() !== 'atb3,corner3,mid,paint,restricted') fail(`zones: ${zones.map((z) => z.zone)}`);
  // the two corners are one zone, lettered on both strips with the same label
  const cornerLabels = await marks.locator('path[data-zone="corner3"]').evaluateAll((els) => [...els[0].parentElement.querySelectorAll('text')].map((t) => t.textContent));
  if (cornerLabels.length !== 2 || cornerLabels[0] !== cornerLabels[1]) fail(`corner labels ${JSON.stringify(cornerLabels)}`);
  if ((await marks.locator('text').count()) !== 6) fail(`${await marks.locator('text').count()} zone labels, want 6 (5 zones, the corner twice)`);
  if (!(await range.isDisabled())) fail('the min-n range is live in Zones');
  if (!/· 5 zones$/.test(await note.innerText())) fail(`zones note: "${await note.innerText()}"`);
  const ra = marks.locator('path[data-zone="restricted"]');
  await ra.hover(); // the centre of its box is the hoop: inside the circle, not the paint around it
  await page.waitForTimeout(300);
  const raText = await readout.innerText();
  const raZ = zones.find((z) => z.zone === 'restricted');
  if (!raText.startsWith(`restricted area · ${raZ.n.toLocaleString('en-US')} shots · ${Math.round((100 * raZ.made) / raZ.n)}% FG`)) fail(`restricted readout "${raText}" for ${JSON.stringify(raZ)}`);
  if (!/stroke-foreground/.test((await ra.getAttribute('class')) ?? '')) fail('the hovered zone is not outlined');
  await page.mouse.move(0, 0);
  console.log(`shots (j) zones ${width}: ${zones.map((z) => `${z.zone} ${z.label} ${z.slot}`).join('; ')} (Σ ${zoneSum} = note ${drawnTotal}); readout "${raText}"`);
  await page.waitForTimeout(800);
  await modeButton('Raw').click();
  await page.waitForTimeout(400);
  if ((await drawn()) !== jRaw || modeParam() !== null) fail(`back to Raw: ${await drawn()} marks, URL mode=${modeParam()}`);
  // the URL reproduces a mode
  await page.goto(`${base}/platform/shots?league=nba_stats&season=2026&player=203497&mode=zones`, { waitUntil: 'domcontentloaded' });
  if ((await drawn()) !== 5 || (await pressed()) !== 'Zones') fail('mode=zones in the URL did not open Zones');
  await page.waitForTimeout(600);

  // (k) One hovered distance, on Shai Gilgeous-Alexander's Raw view (he shoots from everywhere,
  // so the 24 ft bin exists and holds shots). Hovering the curve's 24 ft bin draws the band on
  // the court at EXACTLY 24–25 ft (r − strokeWidth/2 = 24, strokeWidth = 1), tints the
  // butterfly's 24 ft column and the curve's own; leaving clears all three. Hovering a hexagon
  // tints the curve column holding its mean distance (floor) and draws NO band. Keyboard: focus
  // the curve's first bin, ArrowRight steps a bin and the band follows it, End reaches the last.
  await page.goto(`${base}${NBA}`, { waitUntil: 'domcontentloaded' });
  await drawn();
  const curveBin = (lo) => page.locator(`[data-testid="shots-curve-bins"] rect[data-lo="${lo}"]`);
  const sideBin = (lo) => page.locator(`[data-testid="shots-butterfly-bins"] rect[data-lo="${lo}"]`);
  const arc = page.getByTestId('shots-hover-arc');
  const arcAt = async () => ((await arc.count()) ? { r: Number(await arc.getAttribute('r')), sw: Number(await arc.getAttribute('stroke-width')), lo: Number(await arc.getAttribute('data-lo')) } : null);
  const cMarks = Number(await page.locator('[data-testid="shots-curves"] svg').getAttribute('data-marks'));
  const bMarks = Number(await page.locator('[data-testid="shots-butterfly"] svg').getAttribute('data-marks'));
  if (cMarks > 300 || bMarks > 300) fail(`companions: curve ${cMarks} marks, butterfly ${bMarks}`);
  await curveBin(24).scrollIntoViewIfNeeded();
  await curveBin(24).hover();
  await page.waitForTimeout(300);
  const band = await arcAt();
  if (!band || Math.abs(band.r - band.sw / 2 - 24) > 1e-9 || band.sw !== 1 || band.lo !== 24) fail(`hover 24 ft: band ${JSON.stringify(band)} (want inner radius 24, width 1)`);
  if ((await sideBin(24).getAttribute('data-hover')) === null || (await curveBin(24).getAttribute('data-hover')) === null) fail('hover 24 ft did not tint both companions');
  const kLabel = await curveBin(24).getAttribute('aria-label');
  if (!/^24 ft · \d+ shots \(\d+%\) · \d+% FG · league \d+%$/.test(kLabel)) fail(`24 ft label: "${kLabel}"`);
  // both dots (the bin has attempts in reach), and the two readouts spell the bin's numbers out
  const kDots = await page.locator('[data-testid="shots-curve-dot"]').evaluateAll((els) => els.map((el) => el.getAttribute('fill')).sort());
  if (kDots.join() !== 'var(--color-chart-cat-1),var(--color-chart-cat-2)') fail(`24 ft dots: ${JSON.stringify(kDots)}`);
  if ((await page.getByTestId('shots-curve-readout').innerText()) !== kLabel) fail(`curve readout ≠ "${kLabel}"`);
  const kSide = await sideBin(24).getAttribute('aria-label');
  if ((await page.getByTestId('shots-butterfly-readout').innerText()) !== kSide || !/^24 ft · left \d+ shots · \d+% FG · \d+ ft · right \d+ shots · \d+% FG · \d+ ft$/.test(kSide)) fail(`butterfly readout "${await page.getByTestId('shots-butterfly-readout').innerText()}" vs "${kSide}"`);
  console.log(`shots (k) ${width}: hover 24 ft on the curve → band r=${band.r} width=${band.sw} (24–25 ft); "${kLabel}"; both dots; butterfly 24 ft tinted, readout "${kSide}"; curve ${cMarks} marks, butterfly ${bMarks}`);
  await page.waitForTimeout(800);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  if (await arcAt()) fail('the band stayed after leaving the curve');
  if ((await sideBin(24).getAttribute('data-hover')) !== null) fail('the butterfly column stayed tinted');
  // a hexagon → the curve's column at floor(its mean distance), no band
  const far = marks.locator('polygon').first();
  await far.scrollIntoViewIfNeeded();
  await far.hover();
  await page.waitForTimeout(300);
  const farLo = Math.floor(Number(await far.getAttribute('data-dist')));
  if ((await curveBin(farLo).getAttribute('data-hover')) === null) fail(`hovering a hex at ${await far.getAttribute('data-dist')} ft did not tint the curve's ${farLo} ft bin`);
  if ((await page.locator('[data-testid="shots-curve-bins"] rect[data-hover]').count()) !== 1) fail('more than one curve column tinted');
  if (await arcAt()) fail('a hovered hexagon drew a band');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  // keyboard on the curve: the roving tab stop is the first bin with shots; the arrows step from it
  const firstLo = Number(await page.locator('[data-testid="shots-curve-bins"] rect[tabindex="0"]').getAttribute('data-lo'));
  await page.locator('[data-testid="shots-curve-bins"] rect[tabindex="0"]').focus();
  await page.waitForTimeout(200);
  const b1 = await arcAt();
  if (!b1 || b1.lo !== firstLo) fail(`focusing the ${firstLo} ft bin drew ${JSON.stringify(b1)}`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const b2 = await arcAt();
  const focusedLo = await page.evaluate(() => Number(document.activeElement?.dataset?.lo));
  if (!b2 || b2.lo !== firstLo + 1 || focusedLo !== firstLo + 1) fail(`ArrowRight: focus at ${focusedLo}, band ${JSON.stringify(b2)}`);
  await page.keyboard.press('End');
  await page.waitForTimeout(250);
  const lastLo = await page.locator('[data-testid="shots-curve-bins"] rect').last().getAttribute('data-lo');
  if ((await arcAt())?.lo !== Number(lastLo)) fail(`End: band at ${JSON.stringify(await arcAt())}, last bin ${lastLo}`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  console.log(`shots (k) keyboard ${width}: hex at ${farLo} ft → curve column ${farLo}, no band; focus ${firstLo} ft → band ${b1.lo}, ArrowRight → ${b2.lo}, End → ${lastLo}`);

  // (l) The butterfly's halves: left + right (the totals line's data-left/right) equal the drawn
  // shots, and bin by bin equal the curve's bins.
  const totals = page.getByTestId('shots-butterfly-totals');
  const lN = Number(await totals.getAttribute('data-left'));
  const rN = Number(await totals.getAttribute('data-right'));
  const lTotal = Number((await note.innerText()).match(/^([\d,]+) shots/)[1].replace(/,/g, ''));
  if (lN + rN !== lTotal) fail(`butterfly left ${lN} + right ${rN} ≠ ${lTotal} drawn shots`);
  if (lN < 1 || rN < 1) fail(`a side is empty: left ${lN}, right ${rN}`);
  const cols = await page.locator('[data-testid="shots-butterfly-bars"] g[data-lo]').evaluateAll((els) => els.map((g) => ({ lo: Number(g.dataset.lo), n: Number(g.dataset.leftN) + Number(g.dataset.rightN) })));
  const curveNs = await page.locator('[data-testid="shots-curve-bins"] rect').evaluateAll((els) => els.map((r) => ({ lo: Number(r.dataset.lo), n: Number(r.dataset.n) })));
  if (JSON.stringify(cols) !== JSON.stringify(curveNs)) fail(`butterfly columns ${JSON.stringify(cols.slice(0, 5))}… ≠ curve bins ${JSON.stringify(curveNs.slice(0, 5))}…`);
  const tText = await totals.innerText();
  if (!new RegExp(`left ${lN.toLocaleString('en-US')} shots · \\d+% FG`).test(tText) || !new RegExp(`right ${rN.toLocaleString('en-US')} shots · \\d+% FG`).test(tText)) fail(`totals line "${tText}"`);
  console.log(`shots (l) ${width}: butterfly left ${lN} + right ${rN} = ${lTotal} drawn; ${cols.length} columns match the curve's bins; "${tText.replace(/\n/g, ' ')}"`);
  await page.waitForTimeout(600);

  // (m) An NHL skater's Zones: four rink zones, shots summing to the drawn total, labels of goals − xG.
  await page.goto(`${base}${NHL}&mode=zones`, { waitUntil: 'domcontentloaded' });
  const m = await drawn();
  if (m !== 4) fail(`nhl zones: ${m} marks`);
  const rz = await marks.locator('path[data-n]').evaluateAll((els) => els.map((el) => ({ zone: el.dataset.zone, n: Number(el.dataset.n), label: el.parentElement.querySelector('text')?.textContent ?? '' })));
  const mTotal = Number((await note.innerText()).match(/^([\d,]+) shots/)[1].replace(/,/g, ''));
  if (rz.reduce((s, z) => s + z.n, 0) !== mTotal) fail(`rink zones hold ${rz.reduce((s, z) => s + z.n, 0)}, the note ${mTotal}`);
  if (rz.map((z) => z.zone).sort().join() !== 'highSlot,perimeter,point,slot') fail(`rink zones: ${rz.map((z) => z.zone)}`);
  if (!rz.every((z) => !z.n || /^[+−]\d+\.\d · \d+$/.test(z.label))) fail(`rink zone labels: ${JSON.stringify(rz)}`);
  console.log(`shots (m) nhl 8477492 zones ${width}: ${rz.map((z) => `${z.zone} ${z.label}`).join('; ')} (Σ ${mTotal})`);
  await page.waitForTimeout(800);
};
export default shots;
