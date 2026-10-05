// A package's 1280x640 GitHub social preview image, in the SportsDataverse hex family: the
// starfield ground, the package hex on the left, and on the right a language tag, the
// package name in Russo One with the SDV blue-to-cyan gradient, a tagline and the docs URL.
//
//   node scripts/social-image.mjs --logo ../path/logo.png --name sdvplot --lang Python \
//     --tagline "Team logos, ... tables." --url sdvplot.sportsdataverse.org --out public/images/sdvplot-gh.png
//
// Renders an HTML template with playwright-core and the installed Chrome, resolved the way
// visual-check.mjs does (scripts/lib/browser.mjs; VISUAL_CHECK_EXECUTABLE / VISUAL_CHECK_NO_SANDBOX
// apply). The ground is public/images/sdv-blue-1200x1200.png with its centre band (the SDV mark)
// replaced by a feathered, gain-matched copy of its clean top strip -- the same patch the sdvplotR
// and sdvplot hexes apply (sdvplotR data-raw/hex_logo_common.R). Fonts come from public/fonts.
// Everything stays inside a 40 px margin: GitHub crops the image at small sizes.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadChromium, launchOptions } from './lib/browser.mjs';

const W = 1280, H = 640;
const { values: a } = parseArgs({
  options: Object.fromEntries(['logo', 'name', 'tagline', 'url', 'lang', 'out'].map((k) => [k, { type: 'string' }])),
});
const missing = ['logo', 'name', 'tagline', 'url', 'lang', 'out'].filter((k) => !a[k]);
if (missing.length) {
  console.error(`missing --${missing.join(', --')}`);
  process.exit(2);
}

const pub = new URL('../public/', import.meta.url);
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(path)).toString('base64')}`;
const sky = await dataUri(new URL('images/sdv-blue-1200x1200.png', pub), 'image/png');
const logo = await dataUri(a.logo, 'image/png');
const russo = await dataUri(new URL('fonts/russo-one/RussoOne-Regular.ttf', pub), 'font/ttf');
const barlow = (w) => dataUri(new URL(`fonts/Barlow/Barlow-${w}.woff2`, pub), 'font/woff2');
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Russo; src: url(${russo}); }
@font-face { font-family: Barlow; font-weight: 500; src: url(${await barlow(500)}); }
@font-face { font-family: Barlow; font-weight: 700; src: url(${await barlow(700)}); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #0b1a33; }
canvas { position: absolute; inset: 0; }
main { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 56px; }
main > img { height: 520px; flex: none; filter: drop-shadow(0 0 28px rgba(51, 70, 240, 0.5)); }
.text { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; min-width: 0; }
.lang { font: 700 22px/1 Barlow; letter-spacing: 0.08em; text-transform: uppercase; color: #9ccbff;
        border: 2px solid rgba(156, 203, 255, 0.6); border-radius: 999px; padding: 8px 18px; }
h1 { margin: 0; font: 400 112px/1.05 Russo; color: transparent; padding-bottom: 0.06em;
     background: linear-gradient(180deg, #3346f0 12%, #7fe6dc 92%); -webkit-background-clip: text; background-clip: text; }
.tagline { margin: 0; font: 500 34px/1.25 Barlow; color: #e9eef6; text-wrap: balance; max-width: 640px; }
.url { font: 700 28px/1 Barlow; color: #9ccbff; }
</style></head><body><canvas id="sky" width="${W}" height="${H}"></canvas><main>
<img src="${logo}" alt="">
<div class="text"><span class="lang">${esc(a.lang)}</span><h1>${esc(a.name)}</h1>
<p class="tagline">${esc(a.tagline)}</p><span class="url">${esc(a.url)}</span></div></main>
<script>
const img = new Image();
img.onload = () => {
  const n = 1200, src = document.createElement('canvas');
  src.width = src.height = n;
  const g = src.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, n, n), px = d.data, orig = px.slice();
  // sdvplotR's patch, in source pixels: rows 399-828, cols 159-1078 take rows 0-429, feathered 40/60 px
  const R0 = 399, NR = 430, C0 = 159, NC = 920;
  const ramp = (len, edge) => Array.from({ length: len }, (_, i) => Math.min(1, Math.min(i, len - 1 - i) / edge));
  const wr = ramp(NR, 40), wc = ramp(NC, 60), at = (r, c, k) => (r * n + C0 + c) * 4 + k;
  for (let k = 0; k < 3; k++) {
    let s = 0, t = 0;  // gain-match the clean strip to the ring around the mark (weight < 0.25)
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++)
      if (wr[r] * wc[c] < 0.25) { s += orig[at(r, c, k)]; t += orig[at(R0 + r, c, k)]; }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      const w = wr[r] * wc[c], i = at(R0 + r, c, k);
      px[i] = w * Math.min(255, orig[at(r, c, k)] * t / s) + (1 - w) * orig[i];
    }
  }
  g.putImageData(d, 0, 0);
  document.getElementById('sky').getContext('2d').drawImage(src, 0, 300, n, 600, 0, 0, ${W}, ${H});
  window.skyReady = true;
};
img.src = ${JSON.stringify(sky)};
</script></body></html>`;

const chromium = await loadChromium();
const browser = await chromium.launch(launchOptions());
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => window.skyReady === true && document.fonts.status === 'loaded');
  // the text must stay inside the 40 px safe margin
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('main > img, .text > *')].map((e) => e.getBoundingClientRect());
    return { left: Math.min(...r.map((b) => b.left)), top: Math.min(...r.map((b) => b.top)),
             right: Math.max(...r.map((b) => b.right)), bottom: Math.max(...r.map((b) => b.bottom)) };
  });
  if (box.left < 40 || box.top < 40 || box.right > W - 40 || box.bottom > H - 40) {
    throw new Error(`content leaves the 40 px safe area: ${JSON.stringify(box)}`);
  }
  await page.screenshot({ path: a.out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`wrote ${a.out} (${W} x ${H})`);
} finally {
  await browser.close();
}
