// /platform/scatter (P4 T1): the index link draws every row the Data API returns as a dot on a
// DPR-sized canvas, with dashed median lines at the medians of X and Y; hovering or tapping a
// mark labels it; the Table view lists the same rows; resizing keeps the canvas at 2x device
// pixels; a theme switch redraws; no width scrolls sideways. Then: an X/Y pick from the rail,
// the rail filter, a team table named through a join, ranks last in the rail, a column the
// source lacks falling back, nulls counted in the note, a source switch mid-read never painting
// or erroring from the abandoned read, and college hoops kept to D-I (dense, translucent marks).
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
   *  and surface tokens. */
  const pixelAt = (pt) =>
    chart.evaluate((el, pt) => {
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
      return { pixel, mark: token('--color-chart-cat-1'), surface, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' };
    }, pt);
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
};
export default scatter;
