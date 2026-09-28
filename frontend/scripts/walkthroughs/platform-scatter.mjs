// /platform/scatter (P4 T1): the index link draws every row the Data API returns as a dot on a
// DPR-sized canvas, with dashed median lines at the medians of X and Y; hovering or tapping a
// mark labels it; the Table view lists the same rows; resizing keeps the canvas at 2x device
// pixels; a theme switch redraws; no width scrolls sideways. Then: an X/Y pick from the rail,
// the rail filter, a team table named through a join, ranks last in the rail, a column the
// source lacks falling back, nulls counted in the note, a source switch mid-read never painting
// or erroring from the abandoned read, and college hoops kept to D-I (dense, translucent marks).
// P4 T2 then: a highlight from the combobox fades every other mark (per-mark state + pixels),
// chips keep their colour slot when another goes, a 4th is refused, the outlier labels never
// overlap, the wheel zooms 4x about the cursor and re-ticks, a drag pans, Reset and the keyboard
// + / - / Reset buttons work, RANDOM swaps in a distinct pair (resetting the zoom), 390 px has no
// side scroll, and a zoom or pan frame over ~5k MBB marks is timed.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).

// polars on the same Data API read the page makes (season_type=Regular Season, season=2026,
// limit=50000), 2026-09-28: 582 rows, none missing o_rapm or d_rapm. A later write to
// nba.player_impact 2026 moves these: re-derive, never loosen the 1e-9.
const INDEX = '/platform/scatter?schema=nba&table=player_impact&season=2026&x=o_rapm&y=d_rapm';
const MEDIAN_X = -0.019004368898077478;
const MEDIAN_Y = 0.004169331890630006;
const TOP_X = 'Shai Gilgeous-Alexander'; // the highest o_rapm, 5.384
// cfb.ratings 2025: the highest adj_off_epa is team_id 84, named Indiana by cfb.team_info.
const CFB_TOP = 'Indiana';
// nfl.passing 2025: 67 of 101 passers have no epa_cpoe_composite.
const NFL_MISSING = '67 players have no value for epa_cpoe_composite.';
// polars, 2026-09-28: 2026 rows whose team_id is in mbb.team_group_seasons (season 2026, 365 D-I
// teams). All rows: 9,990 players, medians -2.765 / 0.867; mbb.ratings all 727 teams, 99.204 / 116.503.
const MBB_PV = { d1: 5015, left: 4975, mx: -0.8493846600284214, my: 0.4076165227817555 };
const MBB_RATINGS = { d1: 365, left: 362, mx: 109.20291187126529, my: 109.10112308105424 };

const scatter = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);

  const chart = page.getByTestId('scatter-canvas');
  const note = page.getByTestId('scatter-note');
  const fail = (msg) => {
    throw new Error(msg);
  };
  /** Marks drawn for the current view, once the read for `title` has landed. */
  const drawn = async (title) => {
    await page.getByTestId('scatter-title').filter({ hasText: title }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(300); // one animation frame and then some
    return Number(await chart.getAttribute('data-marks'));
  };
  /** The API's own rows for a (source, season), fetched in the page (same cookie, same proxy). */
  const apiRows = (params) =>
    page.evaluate(async (p) => (await (await fetch(`/api/platform/query/run?${new URLSearchParams(p)}`)).json()).data, params);
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const near = (a, b) => Math.abs(a - b) <= 1e-9;
  /** A value's CSS px position in the canvas, from the plot box the component exposes. */
  const plotBox = () => chart.evaluate((el) => ({ plot: JSON.parse(el.dataset.plot), w: el.clientWidth, h: el.querySelector('canvas').clientHeight }));
  const toPx = async (x, y, box) => {
    const { plot, w, h } = box ?? (await plotBox());
    return {
      px: plot.l + ((x - plot.x[0]) / (plot.x[1] - plot.x[0])) * (w - plot.l - plot.r),
      py: plot.t + (1 - (y - plot.y[0]) / (plot.y[1] - plot.y[0])) * (h - plot.t - plot.b),
    };
  };
  /** Share of amber (score token) device pixels along one canvas column or row, in CSS px. */
  const amberShare = (axis, at) =>
    chart.evaluate(
      (el, { axis, at }) => {
        const canvas = el.querySelector('canvas');
        const dpr = canvas.width / canvas.clientWidth;
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-score)';
        el.appendChild(probe);
        const [r, g, b] = getComputedStyle(probe).color.match(/\d+/g).map(Number);
        probe.remove();
        const plot = JSON.parse(el.dataset.plot);
        const ctx = canvas.getContext('2d');
        const c = Math.floor((Math.round(at) + 0.5) * dpr);
        const [x0, y0, len] =
          axis === 'x'
            ? [c, Math.ceil(plot.t * dpr), Math.floor((canvas.clientHeight - plot.t - plot.b) * dpr)]
            : [Math.ceil(plot.l * dpr), c, Math.floor((canvas.clientWidth - plot.l - plot.r) * dpr)];
        const px = axis === 'x' ? ctx.getImageData(x0, y0, 1, len).data : ctx.getImageData(x0, y0, len, 1).data;
        let hit = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (Math.abs(px[i] - r) < 40 && Math.abs(px[i + 1] - g) < 40 && Math.abs(px[i + 2] - b) < 40) hit++;
        }
        return hit / (px.length / 4);
      },
      { axis, at }
    );
  /** One canvas pixel (CSS px) as seen over the card (the canvas itself is transparent: a
   *  translucent mark reads back as the mark colour at alpha < 255), beside the theme's mark
   *  (`token`, chart-cat-1 by default) and surface tokens. */
  const pixelAt = (pt, token = '--color-chart-cat-1') =>
    chart.evaluate((el, { pt, token: markToken }) => {
      const canvas = el.querySelector('canvas');
      const dpr = canvas.width / canvas.clientWidth;
      const [r, g, b, a] = canvas.getContext('2d').getImageData(Math.round(pt.px * dpr), Math.round(pt.py * dpr), 1, 1).data;
      const token = (v) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${v})`;
        el.appendChild(probe);
        const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number);
        probe.remove();
        return rgb;
      };
      const surface = token('--color-card');
      const pixel = [r, g, b].map((v, i) => surface[i] + (a / 255) * (v - surface[i]));
      return { pixel, mark: token(markToken), surface, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' };
    }, { pt, token });
  /** How far along surface -> mark colour a pixel sits (1 = the mark at full opacity), and how far off that line. */
  const along = ({ pixel, mark, surface }) => {
    const d = mark.map((m, i) => m - surface[i]);
    const p = pixel.map((v, i) => v - surface[i]);
    const t = p.reduce((a, v, i) => a + v * d[i], 0) / d.reduce((a, v) => a + v * v, 0);
    return { t, off: Math.hypot(...p.map((v, i) => v - t * d[i])) };
  };
  const noSideScroll = async (what) => {
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) fail(`${what}: the page scrolls sideways (${sw} > ${cw})`);
  };
  const backing = () =>
    chart.evaluate((el) => {
      const c = el.querySelector('canvas');
      return { dpr: window.devicePixelRatio, w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
    });
  const hoverAt = async ({ px, py }) => {
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.locator('canvas').boundingBox();
    await page.mouse.move(box.x + px, box.y + py, { steps: 6 });
    await page.getByTestId('scatter-hover').waitFor({ timeout: 5_000 });
    return page.getByTestId('scatter-hover').innerText();
  };
  /** A finger tap (touchstart + touchend, as a phone sends it) at canvas CSS px. */
  const cdp = await page.context().newCDPSession(page);
  const tap = async ({ px, py }) => {
    const box = await chart.locator('canvas').boundingBox();
    const [x, y] = [box.x + px, box.y + py];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  };

  // (a) The index link draws every row the API returns, less rows missing x or y.
  await page.goto(`${base}${INDEX}`, { waitUntil: 'domcontentloaded' });
  const marks = await drawn('d_rapm vs o_rapm · 2026');
  const rows = await apiRows({ schema: 'nba', table: 'player_impact', season: '2026', season_type: 'Regular Season', limit: '50000' });
  const plotted = rows.filter((r) => finite(r.o_rapm) && finite(r.d_rapm));
  if (!rows.length || marks !== plotted.length) fail(`index link drew ${marks} marks; the API returned ${rows.length}, ${plotted.length} with both values`);
  if (new URL(page.url()).search !== '?season=2026&x=o_rapm&y=d_rapm') fail(`the URL did not settle on the view: ${page.url()}`);
  // Chart first, rail after it: in the DOM, and on screen (beside it on a desktop, below on a phone).
  const order = await page.evaluate(() => {
    const [c, r] = [document.querySelector('[data-testid="scatter-canvas"]'), document.querySelector('aside[aria-label="Axes"]')];
    const [cb, rb] = [c.getBoundingClientRect(), r.getBoundingClientRect()];
    return { domFirst: Boolean(c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING), after: rb.left >= cb.right - 1 || rb.top >= cb.bottom - 1 };
  });
  if (!order.domFirst || !order.after) fail(`the rail is not after the chart: ${JSON.stringify(order)}`);
  await page.waitForTimeout(1200);

  // (b) The crosshair sits at the medians: the value (polars) and the drawn amber lines.
  const [mx, my] = [Number(await chart.getAttribute('data-median-x')), Number(await chart.getAttribute('data-median-y'))];
  if (!near(mx, MEDIAN_X) || !near(my, MEDIAN_Y)) fail(`medians ${mx}, ${my}; polars says ${MEDIAN_X}, ${MEDIAN_Y}`);
  const m = await toPx(MEDIAN_X, MEDIAN_Y);
  const [onX, offX, onY, offY] = [await amberShare('x', m.px), await amberShare('x', m.px + 6), await amberShare('y', m.py), await amberShare('y', m.py + 6)];
  if (onX < 0.4 || offX > 0.1 || onY < 0.4 || offY > 0.1) fail(`median lines not drawn at the medians: x ${onX} (6 px off ${offX}), y ${onY} (6 px off ${offY})`);

  // (d) Hovering a known player labels him; beyond 20 px nothing is labelled.
  const top = plotted.reduce((a, b) => (b.o_rapm > a.o_rapm ? b : a));
  if (top.player_name !== TOP_X) fail(`the top o_rapm is ${top.player_name}, the reference says ${TOP_X}`);
  const topPx = await toPx(top.o_rapm, top.d_rapm);
  const label = await hoverAt(topPx);
  if (!label.includes(TOP_X) || !label.includes('OKC')) fail(`hover on ${TOP_X} read "${label}"`);
  await page.waitForTimeout(1500);
  const box = await chart.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3); // the plot's corner: no mark within 20 px
  await page.waitForTimeout(300);
  if (await page.getByTestId('scatter-hover').count()) fail('a hover label outside every mark');
  await page.mouse.move(0, 0);

  // A tap labels the mark and the label outlives the finger lift; a tap on empty space clears it.
  await tap(topPx);
  if (!(await page.getByTestId('scatter-hover').count())) fail('a tap on a mark left no label after the finger lifted');
  if (!(await page.getByTestId('scatter-hover').innerText()).includes(TOP_X)) fail('a tap labelled the wrong mark');
  await page.waitForTimeout(1200);
  await tap({ px: 3, py: 3 });
  if (await page.getByTestId('scatter-hover').count()) fail('a tap on empty space kept the label');

  // A theme switch redraws: the top mark reads the new theme's chart-cat-1 over its card
  // (at any opacity: on a phone the index link is dense, so marks are translucent).
  const toggle = page.getByRole('button', { name: 'Toggle theme' });
  if (await toggle.isVisible()) {
    const check = (s, when) => {
      const a = along(s);
      if (a.t < 0.4 || a.off > 10) fail(`${when}: mark pixel ${s.pixel} is not ${s.theme} chart-cat-1 ${s.mark} over ${s.surface} (t ${a.t.toFixed(2)}, off ${a.off.toFixed(1)})`);
    };
    check(await pixelAt(topPx), 'before a theme switch');
    for (let flip = 0; flip < 2; flip++) {
      const prev = await pixelAt(topPx);
      await toggle.click();
      await page.waitForFunction((t) => document.documentElement.classList.contains('dark') !== (t === 'dark'), prev.theme);
      await page.waitForTimeout(400);
      const now = await pixelAt(topPx);
      if (now.mark.join() === prev.mark.join()) fail('the theme switch did not change chart-cat-1');
      check(now, 'after a theme switch');
      await page.waitForTimeout(800);
    }
  }

  // (e) The Table view lists the same rows (full precision on data-value).
  const tableButton = page.getByRole('button', { name: 'Table' });
  await tableButton.click();
  if ((await tableButton.getAttribute('aria-expanded')) !== 'true') fail('the Table toggle does not report aria-expanded');
  const table = page.getByTestId('scatter-table');
  await table.waitFor();
  const listed = await table.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [tr.cells[0].textContent, ...[...tr.querySelectorAll('[data-value]')].map((td) => Number(td.dataset.value))].join('|'))
  );
  const want = plotted.map((r) => [r.player_name, r.o_rapm, r.d_rapm].join('|'));
  if (listed.length !== want.length || [...listed].sort().join('\n') !== [...want].sort().join('\n')) fail(`the table lists ${listed.length} rows that differ from the ${want.length} plotted`);
  await table.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await tableButton.click();

  // (c) At DPR 2 the canvas backs its CSS size with 2x device pixels, after a resize too;
  // (f) at 390 px nothing scrolls sideways.
  const vp = page.viewportSize();
  const before = await backing();
  if (before.dpr !== 2 || before.w !== Math.round(before.cssW * 2) || before.h !== Math.round(before.cssH * 2)) fail(`backing ${JSON.stringify(before)}`);
  await page.setViewportSize({ width: vp.width === 390 ? 1024 : 390, height: vp.height });
  await page.waitForFunction((w) => document.querySelector('[data-testid="scatter-canvas"] canvas').clientWidth !== w, before.cssW);
  await page.waitForTimeout(400);
  const after = await backing();
  if (after.cssW === before.cssW || after.w !== Math.round(after.cssW * 2) || after.h !== Math.round(after.cssH * 2)) fail(`backing after a resize ${JSON.stringify(after)}`);
  if (Number(await chart.getAttribute('data-marks')) !== plotted.length) fail('a resize changed the mark count');
  await page.setViewportSize({ width: 390, height: vp.height });
  await page.waitForTimeout(400);
  await noSideScroll('scatter at 390 px');
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.setViewportSize(vp);
  await page.waitForTimeout(400);

  // The rail: typing filters it; picking Y re-draws and re-links, same rows.
  await page.getByLabel('Filter columns').fill('war');
  const rail = page.getByTestId('scatter-rail-row');
  if ((await rail.allInnerTexts()).some((t) => !t.includes('war'))) fail('the rail filter left a non-matching column');
  await page.getByLabel('Y: war', { exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get('y') === 'war');
  if ((await drawn('war vs o_rapm · 2026')) !== rows.filter((r) => finite(r.o_rapm) && finite(r.war)).length) fail('war vs o_rapm mark count');
  await page.getByLabel('Filter columns').fill('');
  await page.waitForTimeout(1200);

  // A team table is named through its join (cfb.team_info), never labelled by id; ranks come last.
  await page.goto(`${base}/platform/scatter?schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa`, { waitUntil: 'domcontentloaded' });
  const cfbMarks = await drawn('adj_def_epa vs adj_off_epa · 2025');
  const cfb = (await apiRows({ schema: 'cfb', table: 'ratings', season: '2025', limit: '50000' })).filter((r) => finite(r.adj_off_epa) && finite(r.adj_def_epa));
  if (cfbMarks !== cfb.length) fail(`cfb.ratings drew ${cfbMarks} of ${cfb.length}`);
  const railCols = (await rail.allInnerTexts()).map((t) => t.trim());
  const firstRank = railCols.findIndex((c) => c.endsWith('_rank'));
  if (firstRank < 0 || railCols.slice(firstRank).some((c) => !c.endsWith('_rank'))) fail(`ranks are not last in the rail: ${railCols.join(', ')}`);
  const best = cfb.reduce((a, b) => (b.adj_off_epa > a.adj_off_epa ? b : a));
  const cfbLabel = await hoverAt(await toPx(best.adj_off_epa, best.adj_def_epa));
  if (!cfbLabel.startsWith(CFB_TOP)) fail(`cfb hover read "${cfbLabel}", expected ${CFB_TOP}`);
  await page.waitForTimeout(1500);

  // A column the source lacks falls back to its first two numeric columns; nulls are counted.
  await page.goto(`${base}/platform/scatter?schema=nfl&table=passing&season=2025&x=passer_player_name&y=epa_cpoe_composite`, { waitUntil: 'domcontentloaded' });
  await drawn('epa_cpoe_composite vs att');
  await page.waitForFunction(() => new URL(location.href).searchParams.get('x') === 'att');
  await page.getByLabel('X: EPAplay', { exact: true }).click();
  const nflMarks = await drawn('epa_cpoe_composite vs EPAplay · 2025');
  const nfl = await apiRows({ schema: 'nfl', table: 'passing', season: '2025', limit: '50000' });
  if (nflMarks !== nfl.filter((r) => finite(r.EPAplay) && finite(r.epa_cpoe_composite)).length) fail('nfl.passing mark count');
  if (!(await note.innerText()).includes(NFL_MISSING)) fail(`the note reads "${await note.innerText()}"`);
  await noSideScroll('nfl.passing');
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const nflDefault = nfl.filter((r) => finite(r.att) && finite(r.comp)).length;

  // A source switch mid-read: the CFB ratings read is held 4 s; the NFL read lands first, and the
  // late CFB response must not replace it.
  const CFB_READ = /query\/run\?schema=cfb&table=ratings&season=2025&limit=50000/;
  await page.route(CFB_READ, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.goto(`${base}/platform/scatter?schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa`, { waitUntil: 'domcontentloaded' });
  await note.filter({ hasText: 'Loading CFB team ratings' }).waitFor({ timeout: 60_000 });
  const late = page.waitForResponse(CFB_READ, { timeout: 60_000 });
  await page.getByLabel('Source').selectOption('nfl.passing');
  if ((await drawn('comp vs att · 2025')) !== nflDefault) fail('the NFL read after a switch drew the wrong count');
  await late;
  await page.waitForTimeout(600);
  const title = page.getByTestId('scatter-title');
  if (!(await title.count()) || (await title.innerText()) !== 'comp vs att · 2025') fail('the late CFB response replaced the NFL chart');
  if (Number(await chart.getAttribute('data-marks')) !== nflDefault) fail('the late CFB response changed the marks');
  await page.unroute(CFB_READ);

  // An abandoned read that fails says nothing: the CFB read fails after 2 s while the NFL season
  // list is held 5 s, so no newer read has started when the failure lands.
  await page.route(CFB_READ, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'abandoned read failed' }) });
  });
  const NFL_SEASONS = /query\/run\?schema=nfl&table=passing&select=season/;
  await page.route(NFL_SEASONS, async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue();
  });
  await page.goto(`${base}/platform/scatter?schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa`, { waitUntil: 'domcontentloaded' });
  await note.filter({ hasText: 'Loading CFB team ratings' }).waitFor({ timeout: 60_000 });
  const failed = page.waitForResponse(CFB_READ, { timeout: 60_000 });
  await page.getByLabel('Source').selectOption('nfl.passing');
  await failed;
  await page.waitForTimeout(500);
  if (await page.getByTestId('scatter-error').count()) fail(`the abandoned read's failure showed: ${await page.getByTestId('scatter-error').innerText()}`);
  if (/Loading CFB/.test(await note.innerText())) fail('the abandoned read left the CFB spinner up');
  await drawn('comp vs att · 2025');
  await page.unroute(CFB_READ);
  await page.unroute(NFL_SEASONS);
  await page.waitForTimeout(800);

  // College hoops is D-I only: MBB team ratings 2026 against polars (non-D-I teams have a median of
  // 1 game and pulled both medians into the gap between the clusters).
  const d1 = async (league) => new Set((await apiRows({ schema: league, table: 'team_group_seasons', season: '2026', select: 'team_id', limit: '50000' })).map((r) => r.team_id));
  const mbbD1 = await d1('mbb');
  await page.goto(`${base}/platform/scatter?schema=mbb&table=ratings&season=2026&x=adj_o&y=adj_d`, { waitUntil: 'domcontentloaded' });
  const ratingMarks = await drawn('adj_d vs adj_o · 2026');
  const ratings = await apiRows({ schema: 'mbb', table: 'ratings', season: '2026', limit: '50000' });
  const ratingsD1 = ratings.filter((r) => mbbD1.has(r.team_id) && finite(r.adj_o) && finite(r.adj_d)).length;
  if (ratingMarks !== ratingsD1 || ratingMarks !== MBB_RATINGS.d1) fail(`mbb.ratings drew ${ratingMarks}; D-I rows ${ratingsD1}, polars ${MBB_RATINGS.d1}`);
  if (!near(Number(await chart.getAttribute('data-median-x')), MBB_RATINGS.mx) || !near(Number(await chart.getAttribute('data-median-y')), MBB_RATINGS.my)) fail('mbb.ratings D-I medians differ from polars');
  if (!(await note.innerText()).includes(`${MBB_RATINGS.left} non-D-I teams left out.`)) fail(`the note reads "${await note.innerText()}"`);
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  // ~5k D-I marks (MBB player value 2026): dense, so every mark is translucent and the core, where
  // they pile up, reads more opaque than an isolated mark.
  await page.goto(`${base}/platform/scatter?schema=mbb&table=player_value&season=2026&x=box_obpm&y=box_dbpm`, { waitUntil: 'domcontentloaded' });
  const pvMarks = await drawn('box_dbpm vs box_obpm · 2026');
  const pv = (await apiRows({ schema: 'mbb', table: 'player_value', season: '2026', limit: '50000' })).filter((r) => mbbD1.has(r.team_id) && finite(r.box_obpm) && finite(r.box_dbpm));
  if (pvMarks !== pv.length || pvMarks !== MBB_PV.d1) fail(`mbb.player_value drew ${pvMarks}; D-I rows ${pv.length}, polars ${MBB_PV.d1}`);
  const [pmx, pmy] = [Number(await chart.getAttribute('data-median-x')), Number(await chart.getAttribute('data-median-y'))];
  if (!near(pmx, MBB_PV.mx) || !near(pmy, MBB_PV.my)) fail(`mbb.player_value medians ${pmx}, ${pmy}; polars ${MBB_PV.mx}, ${MBB_PV.my}`);
  if (!(await note.innerText()).includes(`${MBB_PV.left.toLocaleString('en-US')} non-D-I players left out.`)) fail(`the note reads "${await note.innerText()}"`);
  if ((await chart.getAttribute('data-dense')) !== 'true') fail('5k marks did not draw dense');
  const pb = await plotBox();
  const pts = await Promise.all(pv.map((r) => toPx(r.box_obpm, r.box_dbpm, pb)));
  const med = await toPx(pmx, pmy, pb);
  // the loneliest mark clear of the median lines: its nearest neighbour is over 12 px away
  let lone = null;
  for (const p of pts) {
    if (Math.abs(p.px - med.px) < 6 || Math.abs(p.py - med.py) < 6) continue;
    const gap = Math.min(...pts.filter((q) => q !== p).map((q) => Math.hypot(q.px - p.px, q.py - p.py)));
    if (gap > 12 && (!lone || gap > lone.gap)) lone = { ...p, gap };
  }
  if (!lone) fail('no isolated mark to compare the dense core against');
  const [alone, core] = [along(await pixelAt(lone)), along(await pixelAt({ px: med.px + 5, py: med.py + 5 }))];
  if (!(alone.t > 0.2 && alone.t < 0.8) || !(core.t > alone.t + 0.25)) fail(`dense core t ${core.t.toFixed(2)} vs an isolated mark t ${alone.t.toFixed(2)}: overlaps do not build up`);
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  {
    // ---- P4 T2 ------------------------------------------------------------------------------------
    const plotNow = async () => chart.evaluate((el) => ({ plot: JSON.parse(el.dataset.plot), w: el.clientWidth, h: el.querySelector('canvas').clientHeight }));
    const url = () => new URL(page.url()).searchParams;
    const hlKeys = () => url().getAll('hl').join('|');
    const legendSlots = () => page.getByTestId('scatter-legend').locator('li[data-chip]').evaluateAll((lis) => lis.map((li) => `${li.dataset.chip}:${li.dataset.slot}`).join(' '));
    const states = () => chart.getAttribute('data-hl');
    /** (f) the outlier labels: inside the plot, no two overlapping, a leader on every pushed one, all from `allowed`. */
    const checkLabels = async (when, allowed, min) => {
      const { plot, w, h } = await plotNow();
      const labels = JSON.parse(await chart.getAttribute('data-labels'));
      if (labels.length < min) fail(`${when}: ${labels.length} labels drawn, want at least ${min}`);
      const [l, r, t, b] = [plot.l, w - plot.r, plot.t, h - plot.b];
      for (const [i, a] of labels.entries()) {
        if (!allowed.has(a.text)) fail(`${when}: "${a.text}" is labelled but is not an allowed mark`);
        if (a.x < l - 0.01 || a.y < t - 0.01 || a.x + a.w > r + 0.01 || a.y + a.h > b + 0.01) fail(`${when}: "${a.text}" leaves the plot`);
        for (const c of labels.slice(i + 1)) {
          if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) fail(`${when}: "${a.text}" overlaps "${c.text}"`);
        }
      }
      return labels;
    };
    /** Type into the highlight combobox and add the pending (first) suggestion with Enter. */
    const combo = page.getByRole('combobox', { name: /^Highlight/ });
    const list = page.getByRole('listbox', { name: 'Highlight suggestions' });
    const addChip = async (text) => {
      await combo.click();
      await combo.fill('');
      await combo.pressSequentially(text, { delay: 60 });
      await list.waitFor();
      const first = list.getByRole('option').first();
      if ((await first.locator('span').first().innerText()) !== text) fail(`"${text}" is not the first suggestion`);
      if ((await combo.getAttribute('aria-activedescendant')) !== (await first.getAttribute('id'))) fail('aria-activedescendant is not the first option');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    };

    await page.goto(`${base}${INDEX}`, { waitUntil: 'domcontentloaded' });
    await drawn('d_rapm vs o_rapm · 2026');
    await chart.scrollIntoViewIfNeeded();
    const nba = rows.filter((r) => finite(r.o_rapm) && finite(r.d_rapm)); // mark order = API row order
    const byName = (rs) => new Set(rs.map((r) => r.player_name));
    const extremes = (rs, k) => {
      const out = new Set();
      for (const [col, dir] of [['o_rapm', -1], ['o_rapm', 1], ['d_rapm', -1], ['d_rapm', 1]]) {
        for (const r of [...rs].sort((a, b) => dir * (a[col] - b[col])).slice(0, k)) out.add(r.player_name);
      }
      return out;
    };
    // (f) no highlight: only the top and bottom 4 on each axis are named, never overlapping
    const plain = await checkLabels('no highlight', extremes(nba, 4), 4);
    if (!plain.some((l) => l.text === TOP_X)) fail(`${TOP_X}, the top o_rapm, is not labelled`);
    await page.waitForTimeout(800);

    // (a) "BOS" from the combobox: arrowing moves the pending option and adds nothing; Enter adds it.
    await combo.click();
    await combo.pressSequentially('BOS', { delay: 80 });
    await list.waitFor();
    const opts = list.getByRole('option');
    if ((await opts.first().locator('span').first().innerText()) !== 'BOS') fail('BOS is not the first suggestion for "BOS"');
    await page.waitForTimeout(600);
    await page.keyboard.press('ArrowDown');
    if ((await combo.getAttribute('aria-activedescendant')) !== (await opts.nth(1).getAttribute('id'))) fail('ArrowDown did not move the pending option');
    if (hlKeys() || (await page.getByTestId('scatter-legend').count())) fail('arrowing added a chip');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => new URL(location.href).searchParams.getAll('hl').join('|') === 'BOS');
    if ((await combo.inputValue()) !== '' || (await list.isVisible())) fail('adding a chip left the combobox open');
    const bos = nba.map((r) => (r.team_abbreviation === 'BOS' ? '0' : '-')).join('');
    if ((await states()) !== bos) fail('per-mark state: BOS marks are not exactly slot 0 and the rest faded');
    const nBos = [...bos].filter((c) => c === '0').length;
    if (!(await page.getByTestId('scatter-legend').innerText()).includes(String(nBos))) fail(`the legend does not count ${nBos} BOS players`);
    // Pixels: a BOS mark is chart-cat-1 at full opacity; an isolated other mark is muted-foreground at ~15%.
    const px0 = await plotNow();
    const marksAt = await Promise.all(nba.map((r) => toPx(r.o_rapm, r.d_rapm, px0)));
    let labelBoxes = JSON.parse(await chart.getAttribute('data-labels'));
    // A sample must sit clear of every label and of every mark that could paint over it: a
    // highlighted mark is drawn over the faded ones, so only other highlighted marks count.
    const clear = (p, others = marksAt) =>
      labelBoxes.every((l) => p.px < l.x - 6 || p.px > l.x + l.w + 6 || p.py < l.y - 6 || p.py > l.y + l.h + 6) &&
      others.every((q) => q === p || Math.hypot(q.px - p.px, q.py - p.py) > 12);
    const gridX = await Promise.all(px0.plot.xt.map(async (t) => (await toPx(t, px0.plot.y[0], px0)).px));
    const gridY = await Promise.all(px0.plot.yt.map(async (t) => (await toPx(px0.plot.x[0], t, px0)).py));
    const med = await toPx(MEDIAN_X, MEDIAN_Y, px0);
    const offLines = (p) => [...gridX, med.px].every((x) => Math.abs(x - p.px) > 6) && [...gridY, med.py].every((y) => Math.abs(y - p.py) > 6);
    const bosAt = marksAt.find((p, i) => bos[i] === '0' && clear(p, marksAt.filter((_, j) => bos[j] === '0')));
    const fadedAt = marksAt.find((p, i) => bos[i] === '-' && clear(p) && offLines(p));
    if (!bosAt || !fadedAt) fail('no isolated BOS mark or faded mark to sample');
    const [hit, faded] = [along(await pixelAt(bosAt)), along(await pixelAt(fadedAt, '--color-muted-foreground'))];
    if (hit.t < 0.9 || hit.off > 12) fail(`a BOS mark is not chart-cat-1 at full opacity (t ${hit.t.toFixed(2)}, off ${hit.off.toFixed(1)})`);
    if (faded.t < 0.08 || faded.t > 0.25 || faded.off > 12) fail(`a non-BOS mark is not faded muted-foreground (t ${faded.t.toFixed(2)}, off ${faded.off.toFixed(1)})`);
    console.log(`scatter T2 (a): ${nBos} BOS marks slot 0, ${nba.length - nBos} faded; BOS pixel t ${hit.t.toFixed(2)}, faded pixel t ${faded.t.toFixed(2)}`);
    // (f) with a highlight: only BOS players are named
    await checkLabels('BOS highlight', byName(nba.filter((r) => r.team_abbreviation === 'BOS')), 4);
    await page.waitForTimeout(1200);

    // (b) A second chip takes slot 2; removing the first leaves the second's colour alone.
    await addChip('LAL');
    if (hlKeys() !== 'BOS|LAL' || (await legendSlots()) !== 'BOS:cat-1 LAL:cat-2') fail(`two chips: ${hlKeys()} / ${await legendSlots()}`);
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Remove BOS' }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.getAll('hl').join('|') === '|LAL');
    if ((await legendSlots()) !== 'LAL:cat-2') fail(`after removing BOS the legend reads ${await legendSlots()}`);
    const lal = nba.map((r) => (r.team_abbreviation === 'LAL' ? '1' : '-')).join('');
    if ((await states()) !== lal) fail('after removing BOS, the LAL marks are not still slot 1');
    labelBoxes = JSON.parse(await chart.getAttribute('data-labels'));
    const lalAt = marksAt.find((p, i) => lal[i] === '1' && clear(p, marksAt.filter((_, j) => lal[j] === '1')));
    if (!lalAt) fail('no LAL mark clear of labels to sample');
    const c2 = along(await pixelAt(lalAt, '--color-chart-cat-2'));
    if (c2.t < 0.9 || c2.off > 12) fail(`a LAL mark is not chart-cat-2 (t ${c2.t.toFixed(2)})`);
    // Refill: BOS takes the free slot 1, OKC slot 3, and a 4th is refused with a note.
    await addChip('BOS');
    await addChip('OKC');
    if (hlKeys() !== 'BOS|LAL|OKC' || (await legendSlots()) !== 'BOS:cat-1 LAL:cat-2 OKC:cat-3') fail(`three chips: ${hlKeys()} / ${await legendSlots()}`);
    await addChip('DEN');
    if (hlKeys() !== 'BOS|LAL|OKC') fail('a 4th chip reached the URL');
    if (!(await note.innerText()).includes('3 highlights at most')) fail(`no refusal note: "${await note.innerText()}"`);
    await page.waitForTimeout(1000);
    // (h) 390 px with chips on and the list open: nothing scrolls sideways.
    const vp2 = page.viewportSize();
    await page.setViewportSize({ width: 390, height: vp2.height });
    await page.waitForTimeout(400);
    await noSideScroll('390 px with 3 chips');
    await combo.click();
    await combo.pressSequentially('a', { delay: 60 });
    await list.waitFor();
    await noSideScroll('390 px with the suggestions open');
    await page.keyboard.press('Escape');
    if (await list.isVisible()) fail('Escape did not close the suggestions');
    await page.setViewportSize(vp2);
    await page.waitForTimeout(400);
    for (const c of ['LAL', 'OKC']) await page.getByRole('button', { name: `Remove ${c}` }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.getAll('hl').join('|') === 'BOS');

    // (c) Zooming 4x with the wheel at a mark keeps it under the cursor and re-ticks both axes;
    // the page does not scroll.
    await chart.scrollIntoViewIfNeeded();
    const before = await plotNow();
    const sga = nba.find((r) => r.player_name === TOP_X);
    const cbox = await chart.locator('canvas').boundingBox();
    // The cursor on SGA, at whole page pixels (a wheel event's clientX is an integer); the data
    // point exactly under it is what must stay put.
    const sgaPx = await toPx(sga.o_rapm, sga.d_rapm, before);
    const at = { px: Math.round(cbox.x + sgaPx.px) - cbox.x, py: Math.round(cbox.y + sgaPx.py) - cbox.y };
    const pw = before.w - before.plot.l - before.plot.r;
    const ph = before.h - before.plot.t - before.plot.b;
    const under = {
      x: before.plot.x[0] + ((at.px - before.plot.l) / pw) * (before.plot.x[1] - before.plot.x[0]),
      y: before.plot.y[0] + (1 - (at.py - before.plot.t) / ph) * (before.plot.y[1] - before.plot.y[0]),
    };
    await page.mouse.move(cbox.x + at.px, cbox.y + at.py);
    const scrollY = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 20 && (await plotNow()).plot.k < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
    }
    const zoomed = await plotNow();
    if (zoomed.plot.k < 4 || zoomed.plot.k > 6) fail(`the wheel zoomed to ${zoomed.plot.k}x`);
    const at4 = await toPx(under.x, under.y, zoomed);
    if (Math.hypot(at4.px - at.px, at4.py - at.py) > 0.5) fail(`at ${zoomed.plot.k.toFixed(2)}x the point under the cursor moved from ${at.px},${at.py} to ${at4.px},${at4.py}`);
    const sga4 = await toPx(sga.o_rapm, sga.d_rapm, zoomed);
    if (Math.hypot(sga4.px - at.px, sga4.py - at.py) > 5) fail(`${TOP_X} drifted from the cursor: ${sga4.px},${sga4.py}`);
    if (zoomed.plot.xt.join() === before.plot.xt.join() || zoomed.plot.yt.join() === before.plot.yt.join()) fail(`the ticks did not change: ${before.plot.xt} -> ${zoomed.plot.xt}; ${before.plot.yt} -> ${zoomed.plot.yt}`);
    if ((await page.evaluate(() => window.scrollY)) !== scrollY) fail('the wheel scrolled the page');
    console.log(`scatter T2 (c): ${zoomed.plot.k.toFixed(2)}x, x ticks ${before.plot.xt} -> ${zoomed.plot.xt}`);
    await page.waitForTimeout(1200);
    // A mouse drag pans: 60 px right shows 60 px worth of lower x.
    const plotW = before.w - before.plot.l - before.plot.r;
    await page.mouse.move(cbox.x + before.plot.l + 100, cbox.y + before.plot.t + 100);
    await page.mouse.down();
    await page.mouse.move(cbox.x + before.plot.l + 160, cbox.y + before.plot.t + 100, { steps: 8 });
    await page.mouse.up();
    const panned = await plotNow();
    const span = zoomed.plot.x[1] - zoomed.plot.x[0];
    if (Math.abs(zoomed.plot.x[0] - panned.plot.x[0] - (60 / plotW) * span) > span * 1e-6 || panned.plot.k !== zoomed.plot.k) fail(`a 60 px drag moved x from ${zoomed.plot.x} to ${panned.plot.x}`);
    // A finger drag belongs to the page: it never pans the chart.
    const [tx, ty] = [cbox.x + before.plot.l + 100, cbox.y + before.plot.t + 100];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + i * 10, y: ty + i * 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    if (JSON.stringify((await plotNow()).plot.x) !== JSON.stringify(panned.plot.x)) fail('a finger drag panned the chart');
    await page.waitForTimeout(800);

    // (d) Reset restores the original domain and ticks.
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await page.waitForTimeout(200);
    const reset = await plotNow();
    if (JSON.stringify([reset.plot.k, reset.plot.x, reset.plot.y, reset.plot.xt, reset.plot.yt]) !== JSON.stringify([before.plot.k, before.plot.x, before.plot.y, before.plot.xt, before.plot.yt])) fail(`Reset left ${JSON.stringify(reset.plot)}`);

    // (g) + / - / Reset from the keyboard: Enter and Space press them, Tab walks them.
    const centre = (p) => [(p.x[0] + p.x[1]) / 2, (p.y[0] + p.y[1]) / 2];
    await page.getByRole('button', { name: 'Zoom in' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const k2 = await plotNow();
    if (k2.plot.k !== 2 || centre(k2.plot).some((c, i) => Math.abs(c - centre(before.plot)[i]) > 1e-9)) fail(`keyboard + gave ${JSON.stringify(k2.plot)}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    if ((await plotNow()).plot.k !== 4) fail('Space on + did not zoom again');
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) !== 'Zoom out') fail('Tab from + did not reach -');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    if ((await plotNow()).plot.k !== 2) fail('keyboard - did not zoom out');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    if (JSON.stringify((await plotNow()).plot.x) !== JSON.stringify(before.plot.x)) fail('keyboard Reset did not restore the domain');
    await page.waitForTimeout(800);

    // (e) RANDOM: a distinct pair that is not the current one (nor its swap), drawn in full; it
    // resets a zoom, and keeps the highlight.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Random axes' }).click();
    await page.waitForFunction(() => {
      const q = new URL(location.href).searchParams;
      return [q.get('x'), q.get('y')].join() !== 'o_rapm,d_rapm';
    });
    const [rx, ry] = [url().get('x'), url().get('y')];
    if (rx === ry || [rx, ry].sort().join() === 'd_rapm,o_rapm') fail(`RANDOM picked ${rx}, ${ry}`);
    const rMarks = await drawn(`${ry} vs ${rx} · 2026`);
    if (rMarks !== rows.filter((r) => finite(r[rx]) && finite(r[ry])).length) fail(`RANDOM ${rx}/${ry} drew ${rMarks}`);
    if ((await plotNow()).plot.k !== 1) fail('RANDOM kept the zoom');
    if (hlKeys() !== 'BOS') fail('RANDOM dropped the highlight');
    console.log(`scatter T2 (e): RANDOM o_rapm/d_rapm -> ${rx}/${ry}`);
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);

    // Frame time: ~5k MBB marks under a highlight, zoomed by the wheel and panned by a drag.
    await page.goto(`${base}/platform/scatter?schema=mbb&table=player_value&season=2026&x=box_obpm&y=box_dbpm&hl=Duke+Blue+Devils`, { waitUntil: 'domcontentloaded' });
    await drawn('box_dbpm vs box_obpm · 2026');
    await chart.scrollIntoViewIfNeeded();
    const mb = await chart.locator('canvas').boundingBox();
    const times = [];
    const frameMs = async () => times.push(Number(await chart.getAttribute('data-frame-ms')));
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
      await frameMs();
    }
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(mb.x + mb.width / 2 + i * 12, mb.y + mb.height / 2 + i * 4);
      await page.waitForTimeout(80);
      await frameMs();
    }
    await page.mouse.up();
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    await page.waitForTimeout(150);
    await frameMs();
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`scatter T2 frame: ${await chart.getAttribute('data-marks')} marks, draw ms median ${sorted[sorted.length >> 1]}, max ${sorted.at(-1)} (${times.join(' ')})`);
    if (sorted[sorted.length >> 1] > 16) fail(`a zoom or pan frame takes ${sorted[sorted.length >> 1]} ms (median) to draw`);
    await page.waitForTimeout(1200);
  }
};
export default scatter;
