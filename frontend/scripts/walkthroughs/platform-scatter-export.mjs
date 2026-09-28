// /platform/scatter (P4 T4): Export PNG downloads the chart as it stands, redrawn at the export's
// fixed size (never the viewer's layout) at 2x, in the page's theme on its card colour: the page
// title, a subtitle (source, season, the highlight chips in their colours, "zoomed" off the base
// view), the plot, and a footer linking the view with when its data last changed (/v1/meta). The
// button waits for the plot. The PNG is decoded in the page and sampled: the title and footer
// bands carry ink, the background is the card, the plot holds mark-coloured pixels, and with a
// BOS highlight zoomed 2x a BOS mark sits, in chart-cat-1, where the zoomed domain puts it.
// The PNGs are kept beside the clips as evidence.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).
import { readFile } from 'node:fs/promises';

const INDEX = '/platform/scatter?season=2026&x=o_rapm&y=d_rapm';
const NAME = 'nba_player_impact_d_rapm_vs_o_rapm_2026.png';
// The export's geometry (lib/platform/viz/scatterDraw.ts, lib/platform/svgExport.ts): a 960 CSS px
// box holding the 928 x 600 px plot (16 px in from each side) between two 18 px axis rows, under
// the 16 + 34 px title and a 20 px subtitle row, over a 30 px footer, at 2 device px per CSS px.
const S = 2;
const W = 960;
const TOP = 16 + 34 + 20;
const H = TOP + 600 + 2 * 18 + 30;
const ROWS = /\/api\/platform\/query\/run\?.*limit=50000/;

const scatterExport = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const chart = page.getByTestId('scatter-canvas');
  const button = page.getByRole('button', { name: 'Export PNG' });
  const width = page.viewportSize()?.width ?? 0;
  let scheme = '';

  /** Export and keep the file; the page's record of what it drew; the PNG decoded in the page
   *  (window.__png), its size returned. */
  const exportNow = async (tag) => {
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    if (await page.getByTestId('scatter-error').count()) fail(`the export failed: ${await page.getByTestId('scatter-error').innerText()}`);
    const name = download.suggestedFilename();
    const path = `${process.env.OUT ?? 'img/walkthrough'}/${scheme}-${width}-${tag}-${name}`;
    await download.saveAs(path);
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.naturalWidth, img.naturalHeight];
      c.getContext('2d').drawImage(img, 0, 0);
      window.__png = c;
      return [c.width, c.height];
    }, `data:image/png;base64,${(await readFile(path)).toString('base64')}`);
    return { name, path, size, meta: JSON.parse(await chart.getAttribute('data-export')) };
  };
  /** A theme token's colour, as the page resolves it. */
  const token = (v) =>
    page.evaluate((v) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${v})`;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number);
      probe.remove();
      return rgb;
    }, v);
  /** Pixels of the decoded PNG in a box of CSS px: those within `tol` of `rgb` (or, with
   *  `not`, those farther), and one sample. */
  const count = (bx, rgb, tol, not = false) =>
    page.evaluate(
      ({ bx, rgb, tol, not, S }) => {
        const d = window.__png.getContext('2d').getImageData(bx.x * S, bx.y * S, bx.w * S, bx.h * S).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const near = Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol;
          if (near !== not) n++;
        }
        return n;
      },
      { bx, rgb, tol, not, S }
    );
  const pixel = (x, y) => page.evaluate(({ x, y }) => [...window.__png.getContext('2d').getImageData(x, y, 1, 1).data], { x: Math.round(x), y: Math.round(y) });
  /** How far along card -> `mark` a pixel sits (1 = the mark at full opacity), and how far off that line. */
  const along = (px, mark, card) => {
    const d = mark.map((v, i) => v - card[i]);
    const p = px.slice(0, 3).map((v, i) => v - card[i]);
    const t = p.reduce((a, v, i) => a + v * d[i], 0) / d.reduce((a, v) => a + v * v, 0);
    return { t, off: Math.hypot(...p.map((v, i) => v - t * d[i])) };
  };

  // The button waits for the plot: disabled while the season's rows load (held 1.5 s here).
  await page.route(ROWS, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto(`${base}${INDEX}`, { waitUntil: 'domcontentloaded' });
  scheme = (await page.evaluate(() => document.documentElement.classList.contains('dark'))) ? 'dark' : 'light';
  await page.getByTestId('scatter-note').filter({ hasText: 'Loading' }).waitFor({ timeout: 60_000 });
  if (!(await button.isDisabled())) fail('Export PNG is enabled while the rows load');
  await page.getByTestId('scatter-title').filter({ hasText: 'd_rapm vs o_rapm · 2026' }).waitFor({ timeout: 120_000 });
  await page.unroute(ROWS);
  await page.waitForTimeout(600);
  if (await button.isDisabled()) fail('Export PNG is disabled with the plot drawn');
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const [card, mark, muted] = [await token('--color-card'), await token('--color-chart-cat-1'), await token('--color-muted-foreground')];

  // (a) the file name. (b) It decodes at the export's size, whatever the viewport, and the
  // download itself proves the canvas was not tainted (toBlob throws on a tainted one).
  const plain = await exportNow('plain');
  const m = plain.meta;
  if (plain.name !== NAME || !/^[a-z0-9_]+\.png$/.test(plain.name)) fail(`export file name ${plain.name}`);
  if (plain.size[0] !== W * S || plain.size[1] !== H * S) fail(`the PNG is ${plain.size.join('x')}, not ${W * S}x${H * S}`);
  if (m.scale !== S || m.top !== TOP || m.box.w !== W || m.top + m.box.h + 30 !== H) fail(`export geometry ${JSON.stringify(m)}`);
  if (m.title !== 'd_rapm vs o_rapm · 2026') fail(`export title ${m.title}`);
  if (m.subtitle.map((r) => r.text).join('|') !== 'NBA player impact|2026') fail(`export subtitle ${JSON.stringify(m.subtitle)}`);
  if (!/^sportsdataverse\.org\/platform\/scatter\?season=2026&x=o_rapm&y=d_rapm · data as of \d{4}-\d\d-\d\d \d\d:\d\d UTC$/.test(m.footer)) fail(`export footer ${m.footer}`);
  if (m.marks !== Number(await chart.getAttribute('data-marks'))) fail(`the export drew ${m.marks} marks, the page ${await chart.getAttribute('data-marks')}`);

  // (c) The background is the card at every corner, opaque; the title and footer bands carry
  // ink; the plot holds mark-coloured (chart-cat-1) pixels.
  const corners = [await pixel(1, 1), await pixel(W * S - 2, 1), await pixel(1, H * S - 2), await pixel(W * S - 2, H * S - 2)];
  if (!corners.every((p) => p.slice(0, 3).join() === card.join() && p[3] === 255)) fail(`the PNG background is not the card ${card}: ${JSON.stringify(corners)}`);
  const ink = {
    title: await count({ x: 16, y: 16, w: 600, h: 26 }, card, 24, true),
    subtitle: await count({ x: 16, y: 48, w: 600, h: 16 }, card, 24, true),
    footer: await count({ x: 16, y: H - 24, w: 600, h: 18 }, card, 24, true),
    marks: await count({ x: m.plot.x0 + m.plot.l, y: m.plot.y0 + m.plot.t, w: m.plot.w - m.plot.l - m.plot.r, h: m.plot.h - m.plot.t - m.plot.b }, mark, 12),
  };
  if (ink.title < 500) fail(`the title band is blank (${ink.title} ink pixels)`);
  if (ink.subtitle < 300) fail(`the subtitle band is blank (${ink.subtitle} ink pixels)`);
  if (ink.footer < 300) fail(`the footer band is blank (${ink.footer} ink pixels)`);
  if (ink.marks < 5000) fail(`the plot holds ${ink.marks} mark-coloured pixels`);
  console.log(`scatter export ${scheme}/${width}: ${plain.name} ${plain.size.join('x')}; card ${card}; ink px title ${ink.title}, subtitle ${ink.subtitle}, footer ${ink.footer}; chart-cat-1 px ${ink.marks}; ${m.footer}`);
  await page.waitForTimeout(600);

  // (e) BOS highlighted, zoomed 2x: the subtitle says so, the exported domain is the one on
  // screen, and an isolated BOS mark in view is chart-cat-1 where that domain puts it in the
  // PNG, an isolated other mark muted and faded.
  await page.goto(`${base}${INDEX}&hl=BOS`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('scatter-legend').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(400);
  const onScreen = JSON.parse(await chart.getAttribute('data-plot'));
  if (onScreen.k !== 2) fail(`Zoom in left k ${onScreen.k}`);
  await button.scrollIntoViewIfNeeded();
  const hl = await exportNow('bos-zoomed');
  const z = hl.meta;
  if (z.k !== 2 || JSON.stringify([z.x, z.y]) !== JSON.stringify([onScreen.x, onScreen.y])) fail(`exported ${JSON.stringify([z.k, z.x, z.y])}, on screen ${JSON.stringify([onScreen.k, onScreen.x, onScreen.y])}`);
  const sub = z.subtitle.map((r) => r.text + (r.color ? `(${r.color})` : '')).join('|');
  if (sub !== 'NBA player impact|2026|BOS(var(--color-chart-cat-1))|zoomed') fail(`zoomed subtitle ${sub}`);
  const rows = await page.evaluate(async () =>
    (await (await fetch('/api/platform/query/run?schema=nba&table=player_impact&season=2026&season_type=Regular+Season&limit=50000')).json()).data
  );
  const [mx, my] = [Number(await chart.getAttribute('data-median-x')), Number(await chart.getAttribute('data-median-y'))];
  const [pw, ph] = [z.plot.w - z.plot.l - z.plot.r, z.plot.h - z.plot.t - z.plot.b];
  // plot-local CSS px, as the label boxes; the plot box sits at (x0, y0) in the PNG
  const sx = (x) => z.plot.l + ((x - z.x[0]) / (z.x[1] - z.x[0])) * pw;
  const sy = (y) => z.plot.t + (1 - (y - z.y[0]) / (z.y[1] - z.y[0])) * ph;
  const placed = rows.filter((r) => Number.isFinite(r.o_rapm) && Number.isFinite(r.d_rapm)).map((r) => ({ r, x: sx(r.o_rapm), y: sy(r.d_rapm) }));
  // clear of every other mark, the plot edge, the grid, the median lines and every label
  const clear = (q) =>
    q.x > z.plot.l + 8 && q.x < z.plot.l + pw - 8 && q.y > z.plot.t + 8 && q.y < z.plot.t + ph - 8 &&
    placed.every((o) => o === q || Math.hypot(o.x - q.x, o.y - q.y) > 12) &&
    [...z.xt, mx].every((t) => Math.abs(sx(t) - q.x) > 6) &&
    [...z.yt, my].every((t) => Math.abs(sy(t) - q.y) > 6) &&
    z.labels.every((l) => q.x < l.x - 6 || q.x > l.x + l.w + 6 || q.y < l.y - 6 || q.y > l.y + l.h + 6);
  const bos = placed.find((q) => q.r.team_abbreviation === 'BOS' && clear(q));
  const other = placed.find((q) => q.r.team_abbreviation !== 'BOS' && clear(q));
  if (!bos || !other) fail('no isolated BOS mark or other mark in the zoomed view to sample');
  const b = along(await pixel((z.plot.x0 + bos.x) * S, (z.plot.y0 + bos.y) * S), mark, card);
  const o = along(await pixel((z.plot.x0 + other.x) * S, (z.plot.y0 + other.y) * S), muted, card);
  if (b.t < 0.9 || b.off > 12) fail(`${bos.r.player_name} (BOS) is not chart-cat-1 in the export (t ${b.t.toFixed(2)}, off ${b.off.toFixed(1)})`);
  if (o.t < 0.08 || o.t > 0.25 || o.off > 12) fail(`${other.r.player_name} is not faded in the export (t ${o.t.toFixed(2)}, off ${o.off.toFixed(1)})`);
  console.log(`scatter export ${scheme}/${width} BOS 2x: x ${z.x.map((v) => v.toFixed(3))} y ${z.y.map((v) => v.toFixed(3))}, ${z.marks} marks in view; ${bos.r.player_name} t ${b.t.toFixed(2)}, ${other.r.player_name} t ${o.t.toFixed(2)}`);
  await page.waitForTimeout(800);
};
export default scatterExport;
