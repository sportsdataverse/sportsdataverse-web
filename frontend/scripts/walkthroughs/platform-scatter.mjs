// /platform/scatter (P4 T1): the index link draws every row the Data API returns as a dot on a
// DPR-sized canvas, with dashed median lines at the medians of X and Y; hovering a mark labels
// it; the Table view lists the same rows; resizing keeps the canvas at 2x device pixels; no
// width scrolls sideways. Then: an X/Y pick from the rail, the rail filter, a team table named
// through a join, a column the source lacks falling back, and nulls counted in the note.
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
  /** A value's CSS px position in the canvas, from the plot box the component exposes. */
  const toPx = async (x, y) => {
    const { plot, w, h } = await chart.evaluate((el) => ({ plot: JSON.parse(el.dataset.plot), w: el.clientWidth, h: el.querySelector('canvas').clientHeight }));
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

  // (a) The index link draws every row the API returns, less rows missing x or y.
  await page.goto(`${base}${INDEX}`, { waitUntil: 'domcontentloaded' });
  const marks = await drawn('d_rapm vs o_rapm · 2026');
  const rows = await apiRows({ schema: 'nba', table: 'player_impact', season: '2026', season_type: 'Regular Season', limit: '50000' });
  const plotted = rows.filter((r) => finite(r.o_rapm) && finite(r.d_rapm));
  if (!rows.length || marks !== plotted.length) fail(`index link drew ${marks} marks; the API returned ${rows.length}, ${plotted.length} with both values`);
  if (new URL(page.url()).search !== '?season=2026&x=o_rapm&y=d_rapm') fail(`the URL did not settle on the view: ${page.url()}`);
  await page.waitForTimeout(1200);

  // (b) The crosshair sits at the medians: the value (polars) and the drawn amber lines.
  const [mx, my] = [Number(await chart.getAttribute('data-median-x')), Number(await chart.getAttribute('data-median-y'))];
  if (Math.abs(mx - MEDIAN_X) > 1e-9 || Math.abs(my - MEDIAN_Y) > 1e-9) fail(`medians ${mx}, ${my}; polars says ${MEDIAN_X}, ${MEDIAN_Y}`);
  const m = await toPx(MEDIAN_X, MEDIAN_Y);
  const [onX, offX, onY, offY] = [await amberShare('x', m.px), await amberShare('x', m.px + 6), await amberShare('y', m.py), await amberShare('y', m.py + 6)];
  if (onX < 0.4 || offX > 0.1 || onY < 0.4 || offY > 0.1) fail(`median lines not drawn at the medians: x ${onX} (6 px off ${offX}), y ${onY} (6 px off ${offY})`);

  // (d) Hovering a known player labels him; beyond 20 px nothing is labelled.
  const top = plotted.reduce((a, b) => (b.o_rapm > a.o_rapm ? b : a));
  if (top.player_name !== TOP_X) fail(`the top o_rapm is ${top.player_name}, the reference says ${TOP_X}`);
  const label = await hoverAt(await toPx(top.o_rapm, top.d_rapm));
  if (!label.includes(TOP_X) || !label.includes('OKC')) fail(`hover on ${TOP_X} read "${label}"`);
  await page.waitForTimeout(1500);
  const box = await chart.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3); // the plot's corner: no mark within 20 px
  await page.waitForTimeout(300);
  if (await page.getByTestId('scatter-hover').count()) fail('a hover label outside every mark');

  // A theme switch redraws: the top mark's centre pixel is chart-cat-1 of the theme in force.
  const topPx = await toPx(top.o_rapm, top.d_rapm);
  const markVsToken = (at = topPx) =>
    chart.evaluate((el, pt) => {
      const canvas = el.querySelector('canvas');
      const dpr = canvas.width / canvas.clientWidth;
      const [r, g, b] = canvas.getContext('2d').getImageData(Math.round(pt.px * dpr), Math.round(pt.py * dpr), 1, 1).data;
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-chart-cat-1)';
      el.appendChild(probe);
      const token = getComputedStyle(probe).color.match(/\d+/g).map(Number);
      probe.remove();
      return { pixel: [r, g, b], token, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' };
    }, at);
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
  const toggle = page.getByRole('button', { name: 'Toggle theme' });
  if (await toggle.isVisible()) {
    const was = await markVsToken();
    if (!same(was.pixel, was.token)) fail(`mark pixel ${was.pixel} is not chart-cat-1 ${was.token} (${was.theme})`);
    for (let flip = 0; flip < 2; flip++) {
      const prev = await markVsToken();
      await toggle.click();
      await page.waitForFunction((t) => document.documentElement.classList.contains('dark') !== (t === 'dark'), prev.theme);
      await page.waitForTimeout(400);
      const now = await markVsToken();
      if (same(now.token, prev.token) || !same(now.pixel, now.token)) fail(`after a theme switch the mark reads ${now.pixel}, the ${now.theme} token is ${now.token}`);
      await page.waitForTimeout(800);
    }
  }

  // (e) The Table view lists the same rows (full precision on data-value).
  await page.getByRole('button', { name: 'Table' }).click();
  const table = page.getByTestId('scatter-table');
  await table.waitFor();
  const listed = await table.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [tr.cells[0].textContent, ...[...tr.querySelectorAll('[data-value]')].map((td) => Number(td.dataset.value))].join('|'))
  );
  const want = plotted.map((r) => [r.player_name, r.o_rapm, r.d_rapm].join('|'));
  if (listed.length !== want.length || [...listed].sort().join('\n') !== [...want].sort().join('\n')) fail(`the table lists ${listed.length} rows that differ from the ${want.length} plotted`);
  await table.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Table' }).click();

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

  // A switch mid-load never paints the abandoned source: CFB ratings, then straight back.
  await page.getByLabel('Source').selectOption('cfb.ratings');
  await page.getByLabel('Source').selectOption('nba.player_impact');
  if ((await drawn('war vs o_rapm')) !== rows.filter((r) => finite(r.o_rapm) && finite(r.war)).length) fail('a quick source switch painted the wrong rows');

  // A team table is named through its join (cfb.team_info), never labelled by id.
  await page.goto(`${base}/platform/scatter?schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa`, { waitUntil: 'domcontentloaded' });
  const cfbMarks = await drawn('adj_def_epa vs adj_off_epa · 2025');
  const cfb = (await apiRows({ schema: 'cfb', table: 'ratings', season: '2025', limit: '50000' })).filter((r) => finite(r.adj_off_epa) && finite(r.adj_def_epa));
  if (cfbMarks !== cfb.length) fail(`cfb.ratings drew ${cfbMarks} of ${cfb.length}`);
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

  // ~10k marks (MBB player value 2026): the dense core near the medians is solid mark
  // colour, never washed out to surface by stacked rings.
  await page.goto(`${base}/platform/scatter?schema=mbb&table=player_value&season=2026&x=box_obpm&y=box_dbpm`, { waitUntil: 'domcontentloaded' });
  const mbbMarks = await drawn('box_dbpm vs box_obpm · 2026');
  const mbb = (await apiRows({ schema: 'mbb', table: 'player_value', season: '2026', limit: '50000' })).filter((r) => finite(r.box_obpm) && finite(r.box_dbpm));
  if (mbbMarks !== mbb.length) fail(`mbb.player_value drew ${mbbMarks} of ${mbb.length}`);
  const core = await toPx(Number(await chart.getAttribute('data-median-x')), Number(await chart.getAttribute('data-median-y')));
  const dense = await markVsToken({ px: core.px + 5, py: core.py + 5 });
  if (!same(dense.pixel, dense.token)) fail(`the dense core reads ${dense.pixel}, not the mark colour ${dense.token}`);
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
};
export default scatter;
