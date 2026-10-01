// /platform/scatter (P4 T3): marks=face draws a headshot for every plotted player with an ESPN id
// (cfb.passing 2025: dots until the atlas lands, then faces for >= 90 %, each a 22 px circle on a
// 2 px chart-cat-1 ring where its dot was; the hover label still works), every image request
// going to a.espncdn.com's combiner at 48 px (one per distinct id, never a full-size headshot);
// the Dots | Faces control (aria-pressed) switches back and forth without a reload (no new
// requests) and mirrors marks=face in the URL; an axis switch keeps the atlas (no new requests);
// nba.player_impact bridges NBA ids through nba.player_crosswalk (>= 80 % matched, the rest
// dots, counted in the note); cfb.ratings draws logos (the control reads "Logos"), the dark
// variant on the dark theme, and a theme switch swaps them; the PNG export in face mode is a
// file (the canvas is not tainted) with face pixels where the plot is; marks=dot and a link
// without marks draw no image at all.
// /platform is behind org sign-in, so this is recorded locally and is NOT listed on the PR's
// `Walkthrough steps:` line (CI has no session; the module throws there).

const CFB = '/platform/scatter?schema=cfb&table=passing&season=2025&marks=face';
const NBA = '/platform/scatter?schema=nba&table=player_impact&season=2026&marks=face';
const LOGOS = '/platform/scatter?schema=cfb&table=ratings&season=2025&x=adj_off_epa&y=adj_def_epa&marks=face';
const COMBINER = /^https:\/\/a\.espncdn\.com\/combiner\/i\?img=(\/i\/[^&]+)&w=48&h=48$/;

const sprites = async (page, base) => {
  if (!process.env.SDV_SESSION_COOKIE) throw new Error('set SDV_SESSION_COOKIE to a minted authjs.session-token');
  await page.context().addCookies([{ name: 'authjs.session-token', value: process.env.SDV_SESSION_COOKIE, url: base }]);
  const fail = (msg) => {
    throw new Error(msg);
  };
  const chart = page.getByTestId('scatter-canvas');
  const note = page.getByTestId('scatter-note');
  const width = page.viewportSize()?.width ?? 0;
  const theme = () => page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  // every ESPN request the page makes, by URL
  const espn = [];
  page.on('request', (r) => {
    if (/espncdn\.com/.test(r.url())) espn.push(r.url());
  });
  const apiRows = (params) =>
    page.evaluate(async (p) => (await (await fetch(`/api/platform/query/run?${new URLSearchParams(p)}`)).json()).data, params);
  const counts = async () => ({ marks: Number(await chart.getAttribute('data-marks')), faces: Number(await chart.getAttribute('data-faces')) });
  /** Marks, then faces once the atlas has landed (data-faces moves off 0 or the note says why not). */
  const facesDrawn = async (title) => {
    await page.getByTestId('scatter-title').filter({ hasText: title }).waitFor({ timeout: 120_000 });
    await page.waitForFunction(
      () => Number(document.querySelector('[data-testid="scatter-canvas"]').dataset.faces) > 0 || /unavailable/.test(document.querySelector('[data-testid="scatter-note"]').textContent),
      null,
      { timeout: 120_000 }
    );
    await page.waitForTimeout(400);
    return counts();
  };
  const plotBox = () => chart.evaluate((el) => ({ plot: JSON.parse(el.dataset.plot), w: el.clientWidth, h: el.querySelector('canvas').clientHeight }));
  const toPx = (x, y, { plot, w, h }) => ({
    px: plot.l + ((x - plot.x[0]) / (plot.x[1] - plot.x[0])) * (w - plot.l - plot.r),
    py: plot.t + (1 - (y - plot.y[0]) / (plot.y[1] - plot.y[0])) * (h - plot.t - plot.b),
  });
  /** Canvas pixels in a CSS-px box: how many are opaque (alpha > 200) and how many distinct colours. */
  const inkIn = (bx) =>
    chart.evaluate((el, bx) => {
      const c = el.querySelector('canvas');
      const dpr = c.width / c.clientWidth;
      const d = c.getContext('2d').getImageData(Math.round(bx.x * dpr), Math.round(bx.y * dpr), Math.round(bx.w * dpr), Math.round(bx.h * dpr)).data;
      const colours = new Set();
      let opaque = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200) {
          opaque++;
          colours.add((d[i] >> 4) * 4096 + (d[i + 1] >> 4) * 256 + (d[i + 2] >> 4));
        }
      }
      return { opaque, colours: colours.size, total: d.length / 4 };
    }, bx);
  const token = (v) =>
    page.evaluate((v) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${v})`;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number);
      probe.remove();
      return rgb;
    }, v);
  /** The share of a ring's device pixels (radius r CSS px about a mark) near `rgb`. */
  const ringShare = (pt, r, rgb) =>
    chart.evaluate(
      (el, { pt, r, rgb }) => {
        const c = el.querySelector('canvas');
        const dpr = c.width / c.clientWidth;
        const ctx = c.getContext('2d');
        let hit = 0;
        const n = 36;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const [x, y] = [Math.round((pt.px + r * Math.cos(a)) * dpr), Math.round((pt.py + r * Math.sin(a)) * dpr)];
          const [pr, pg, pb, pa] = ctx.getImageData(x, y, 1, 1).data;
          if (pa > 200 && Math.abs(pr - rgb[0]) < 40 && Math.abs(pg - rgb[1]) < 40 && Math.abs(pb - rgb[2]) < 40) hit++;
        }
        return hit / n;
      },
      { pt, r, rgb }
    );
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const facesButton = (name) => page.getByRole('group', { name: 'Marks' }).getByRole('button', { name, exact: true });

  // (a) cfb.passing 2025 with marks=face: dots first (the atlas is still loading), then faces for
  // at least 90 % of the plotted players; the ids are ESPN's, so no crosswalk is read.
  await page.goto(`${base}${CFB}`, { waitUntil: 'domcontentloaded' });
  const first = await facesDrawn('· 2025');
  if (first.faces / first.marks < 0.9) fail(`cfb.passing: ${first.faces} faces of ${first.marks} marks`);
  if ((await facesButton('Faces').getAttribute('aria-pressed')) !== 'true') fail('Faces is not pressed with marks=face');
  if (!new URL(page.url()).searchParams.get('marks')) fail('marks=face is not in the URL');
  const rows = await apiRows({ schema: 'cfb', table: 'passing', season: '2025', limit: '50000' });
  const ids = new Set(rows.map((r) => String(r.player_id)));
  const requested = espn.filter((u) => COMBINER.test(u));
  const bad = espn.filter((u) => !COMBINER.test(u));
  if (bad.length) fail(`ESPN requests off the 48 px combiner: ${bad.slice(0, 3).join(', ')}`);
  const reqIds = requested.map((u) => u.match(/full\/(\d+)\.png/)?.[1]).filter(Boolean);
  if (new Set(reqIds).size !== reqIds.length) fail('an id was requested more than once');
  if (reqIds.some((id) => !ids.has(id))) fail('a request for an id that is not in the rows');
  if (espn.some((u) => /crosswalk/.test(u))) fail('cfb read a crosswalk');
  const unmatched = rows.filter((r) => !reqIds.includes(String(r.player_id))).map((r) => r.player_id);
  console.log(`scatter T3 (a) cfb.passing 2025 ${width}: ${first.faces} faces of ${first.marks} marks (${((100 * first.faces) / first.marks).toFixed(1)} %), ${rows.length} rows, ${requested.length} combiner requests, one per id; unmatched ids ${unmatched.slice(0, 5).join(', ') || 'none'}; note "${await note.innerText()}"`);
  // A face is a 22 px disc on a 2 px chart-cat-1 ring where the dot would be: the plot's top
  // passer by the Y axis, measured where the domain puts him.
  const q = new URL(page.url()).searchParams;
  const [xcol, ycol] = [q.get('x'), q.get('y')];
  const plotted = rows.filter((r) => finite(r[xcol]) && finite(r[ycol]));
  const box = await plotBox();
  const at = plotted.map((r) => ({ r, ...toPx(r[xcol], r[ycol], box) }));
  const isolated = at.filter((p) => reqIds.includes(String(p.r.player_id)) && at.every((o) => o === p || Math.hypot(o.px - p.px, o.py - p.py) > 30));
  if (!isolated.length) fail('no isolated face to sample');
  const sample = isolated[0];
  const mark = await token('--color-chart-cat-1');
  const ring = await ringShare(sample, 12, mark);
  const disc = await inkIn({ x: sample.px - 9, y: sample.py - 9, w: 18, h: 18 });
  if (ring < 0.6) fail(`${sample.r.passer_player_name}: ring share ${ring} in chart-cat-1`);
  // a headshot PNG is transparent around the head: part opaque, many colours (a dot would be one)
  if (disc.opaque / disc.total < 0.3 || disc.colours < 8) fail(`${sample.r.passer_player_name}: the disc is not a photo (${disc.opaque}/${disc.total} opaque, ${disc.colours} colours)`);
  console.log(`scatter T3 (a) face: ${sample.r.passer_player_name} ring ${ring.toFixed(2)} chart-cat-1, disc ${disc.colours} colours`);
  // The hover label still works on a face.
  await chart.scrollIntoViewIfNeeded();
  const cbox = await chart.locator('canvas').boundingBox();
  await page.mouse.move(cbox.x + sample.px, cbox.y + sample.py, { steps: 6 });
  await page.getByTestId('scatter-hover').waitFor({ timeout: 5_000 });
  if (!(await page.getByTestId('scatter-hover').innerText()).includes(sample.r.passer_player_name)) fail('hover on a face labelled the wrong mark');
  await page.waitForTimeout(1200);
  await page.mouse.move(0, 0);
  // Frame time over 20 hover moves across the faces.
  const times = [];
  for (let i = 0; i < 20; i++) {
    const p = at[Math.floor((i * at.length) / 20)];
    await page.mouse.move(cbox.x + p.px, cbox.y + p.py);
    await page.waitForTimeout(60);
    times.push(Number(await chart.getAttribute('data-frame-ms')));
  }
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`scatter T3 (a) draw timing over 20 hover frames at ${first.faces} faces: p50 ${sorted[10].toFixed(2)} ms, p95 ${sorted[18].toFixed(2)} ms, max ${sorted[19].toFixed(2)} ms`);
  await page.mouse.move(0, 0);

  // (b) Dots | Faces: Dots draws no face and drops marks from the URL; Faces again reuses the
  // atlas (no new ESPN request); an axis switch keeps it too.
  const before = espn.length;
  await facesButton('Dots').click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('marks'));
  await page.waitForTimeout(300);
  if ((await counts()).faces !== 0) fail('Dots still drew faces');
  if ((await facesButton('Dots').getAttribute('aria-pressed')) !== 'true') fail('Dots is not pressed');
  await page.waitForTimeout(800);
  await facesButton('Faces').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get('marks') === 'face');
  await page.waitForTimeout(300);
  if ((await counts()).faces !== first.faces) fail('Faces again did not redraw the same faces');
  if (espn.length !== before) fail(`switching marks re-requested ${espn.length - before} images`);
  await page.getByLabel('Filter columns').fill('yards');
  await page.getByLabel('Y: yards', { exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get('y') === 'yards');
  await page.waitForTimeout(400);
  const after = await counts();
  if (after.faces / after.marks < 0.9 || espn.length !== before) fail(`axis switch: ${after.faces}/${after.marks} faces, ${espn.length - before} new requests`);
  await page.getByLabel('Filter columns').fill('');
  console.log(`scatter T3 (b) ${width}: Dots -> 0 faces, Faces -> ${first.faces} again, axis switch -> ${after.faces}/${after.marks}; 0 new requests`);
  await page.waitForTimeout(1000);

  // (c) nba.player_impact bridges through the crosswalk: at least 80 % matched, the rest dots.
  espn.length = 0;
  const xwalkRead = page.waitForRequest(/query\/run\?schema=nba&table=player_crosswalk/, { timeout: 60_000 });
  await page.goto(`${base}${NBA}`, { waitUntil: 'domcontentloaded' });
  const xreq = await xwalkRead;
  const nba = await facesDrawn('· 2026');
  const ratio = nba.faces / nba.marks;
  if (ratio < 0.8) fail(`nba.player_impact: ${nba.faces} faces of ${nba.marks} marks`);
  if (!/order=-season/.test(xreq.url()) || !/select=nba_player_id%2Cespn_athlete_id/.test(xreq.url())) fail(`crosswalk read ${xreq.url()}`);
  const nbaReqs = espn.filter((u) => COMBINER.test(u) && /headshots\/nba\//.test(u));
  if (espn.some((u) => !COMBINER.test(u))) fail('an NBA request off the combiner');
  console.log(`scatter T3 (c) nba.player_impact 2026 ${width}: ${nba.faces} faces of ${nba.marks} (${(100 * ratio).toFixed(1)} %), ${nbaReqs.length} nba headshot requests; note "${await note.innerText()}"`);
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  // (d) cfb.ratings: logos, the control reads "Logos", the dark variant on the dark theme, and a
  // theme switch swaps them (a second atlas; the light one's requests are light).
  espn.length = 0;
  await page.goto(`${base}${LOGOS}`, { waitUntil: 'domcontentloaded' });
  const logos = await facesDrawn('adj_def_epa vs adj_off_epa · 2025');
  if (logos.faces / logos.marks < 0.9) fail(`cfb.ratings: ${logos.faces} logos of ${logos.marks}`);
  if ((await facesButton('Logos').getAttribute('aria-pressed')) !== 'true') fail('the control does not read Logos for a team source');
  const dark = (await theme()) === 'dark';
  const logoReqs = espn.filter((u) => COMBINER.test(u));
  const variant = (u) => (/500-dark\//.test(u) ? 'dark' : 'light');
  if (!logoReqs.length || logoReqs.some((u) => variant(u) !== (dark ? 'dark' : 'light'))) fail(`${dark ? 'dark' : 'light'} theme requested ${logoReqs.filter((u) => variant(u) !== (dark ? 'dark' : 'light')).length} logos of the other variant`);
  console.log(`scatter T3 (d) cfb.ratings 2025 ${width} ${dark ? 'dark' : 'light'}: ${logos.faces} logos of ${logos.marks}, ${logoReqs.length} ${variant(logoReqs[0])} logo requests`);
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const toggle = page.getByRole('button', { name: 'Toggle theme' });
  if (await toggle.isVisible()) {
    espn.length = 0;
    await toggle.click();
    await page.waitForFunction((d) => document.documentElement.classList.contains('dark') !== d, dark);
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="scatter-canvas"]').dataset.faces) > 0, null, { timeout: 60_000 });
    await page.waitForTimeout(600);
    const swapped = espn.filter((u) => COMBINER.test(u));
    if (!swapped.length || swapped.some((u) => variant(u) !== (dark ? 'light' : 'dark'))) fail('the theme switch did not load the other logo variant');
    console.log(`scatter T3 (d) theme switch: ${swapped.length} ${variant(swapped[0])} logo requests, ${(await counts()).faces} logos`);
    await page.waitForTimeout(1200);
    await toggle.click();
    await page.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, dark);
    await page.waitForTimeout(600);
  }

  // (e) The PNG export in face mode: a file (toBlob did not throw: the canvas is not tainted),
  // at the export's size, with faces reported where the plot is.
  await page.goto(`${base}${CFB}`, { waitUntil: 'domcontentloaded' });
  const again = await facesDrawn('· 2025');
  const button = page.getByRole('button', { name: 'Export PNG' });
  await button.scrollIntoViewIfNeeded();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  if (await page.getByTestId('scatter-error').count()) fail(`the export failed: ${await page.getByTestId('scatter-error').innerText()}`);
  const path = `${process.env.OUT ?? 'img/walkthrough'}/${await theme()}-${width}-faces-${download.suggestedFilename()}`;
  await download.saveAs(path);
  const meta = JSON.parse(await chart.getAttribute('data-export'));
  if (meta.faces !== again.faces || meta.faces < 1) fail(`the export drew ${meta.faces} faces, the page ${again.faces}`);
  console.log(`scatter T3 (e) export ${width}: ${path} with ${meta.faces} faces of ${meta.marks} marks`);
  await page.waitForTimeout(800);

  // (f) marks=dot and a link without marks draw no image.
  for (const url of [CFB.replace('marks=face', 'marks=dot'), CFB.replace('&marks=face', '')]) {
    espn.length = 0;
    await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('scatter-title').filter({ hasText: '· 2025' }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(600);
    const c = await counts();
    if (c.faces !== 0 || espn.length) fail(`${url}: ${c.faces} faces, ${espn.length} ESPN requests`);
    if ((await facesButton('Dots').getAttribute('aria-pressed')) !== 'true') fail(`${url}: Dots is not pressed`);
  }
  console.log(`scatter T3 (f) ${width}: marks=dot and no marks: 0 faces, 0 ESPN requests`);
  await page.waitForTimeout(600);
};
export default sprites;
