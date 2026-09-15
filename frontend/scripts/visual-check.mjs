// Visual verification: shoot the {desktop, mobile} x {light, dark} matrix for a set of
// routes, so a change to any rendered page/component/style is reviewed the way people
// actually see it. See ../../CLAUDE.md "Visual verification".
//
//   BASE=https://sportsdataverse.org node scripts/visual-check.mjs / /packages
//   node scripts/visual-check.mjs                      # BASE defaults to localhost:3000
//
// Theme: next-themes runs with defaultTheme="dark" (app/providers.tsx), so emulating
// prefers-color-scheme alone never shows light mode. Each context seeds next-themes'
// `theme` key in localStorage before any script runs AND emulates the matching
// color scheme, which is what a visitor who picked that theme gets.
//
// Deliberately NOT a repo dependency (keeps `npm ci` lean): the driver is playwright-core,
// resolved from a local or global install (`npm i -g playwright-core`). It downloads no
// browser; it drives your installed Google Chrome, or $VISUAL_CHECK_EXECUTABLE. Exits
// non-zero if any route fails to load, so an error page never passes as a valid shot.
//
// For PR comments: VISUAL_CHECK_FORMAT=jpeg writes JPEGs (a full-page mobile shot stays a
// few hundred KB) and VISUAL_CHECK_THUMBS=1 adds an above-the-fold `-thumb` per combination.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

async function loadChromium() {
  try { return (await import('playwright-core')).chromium; } catch {}
  const req = createRequire(import.meta.url);
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  roots.push(...(process.env.NODE_PATH ?? '').split(':').filter(Boolean));
  for (const base of roots) {
    try { return req(join(base, 'playwright-core')).chromium; } catch {}
  }
  console.error('playwright-core not found. Install it (it downloads no browser): `npm i -g playwright-core`, then re-run.');
  process.exit(2);
}

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.env.OUT ?? 'img/visual';
const JPEG = process.env.VISUAL_CHECK_FORMAT === 'jpeg';
const THUMBS = Boolean(process.env.VISUAL_CHECK_THUMBS);
const shotOpts = JPEG ? { type: 'jpeg', quality: 80 } : {};
const ext = JPEG ? 'jpg' : 'png';
const passed = process.argv.slice(2);
const routes = passed.length ? passed : ['/', '/packages'];

// the review matrix -- never fewer than these four per route
const DEVICES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
const SCHEMES = ['light', 'dark'];

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-'));

const chromium = await loadChromium();
const args = process.env.VISUAL_CHECK_NO_SANDBOX ? ['--no-sandbox'] : [];
const launch = process.env.VISUAL_CHECK_EXECUTABLE
  ? { executablePath: process.env.VISUAL_CHECK_EXECUTABLE, args }
  : { channel: 'chrome', args };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(launch);
const shots = [];
const failures = [];
try {
  for (const device of DEVICES) {
    for (const scheme of SCHEMES) {
      const ctx = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        colorScheme: scheme,
        deviceScaleFactor: 2,
      });
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, scheme);
      // Vercel Preview deployments inject the Vercel Toolbar; keep it out of the shots
      await ctx.route(/^https:\/\/vercel\.live\//, (r) => r.abort());
      const page = await ctx.newPage();
      for (const route of routes) {
        const where = `${route} (${device.name}/${scheme})`;
        try {
          const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90_000 });
          if (res && res.status() >= 400) failures.push(`${where}: HTTP ${res.status()}`);
          await page.waitForTimeout(1200); // let client components mount + animations settle
          const applied = await page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
          if (applied !== scheme) failures.push(`${where}: page rendered ${applied}, not ${scheme}`);
        } catch (e) {
          failures.push(`${where}: ${e.message}`);
        }
        const stem = join(OUT, `${slug(route)}-${device.name}-${scheme}`);
        await page.screenshot({ ...shotOpts, path: `${stem}.${ext}`, fullPage: true });
        shots.push(`${stem}.${ext}`);
        if (THUMBS) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ ...shotOpts, path: `${stem}-thumb.${ext}` });
          shots.push(`${stem}-thumb.${ext}`);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`${shots.length} screenshots -> ${OUT}/`);
for (const s of shots) console.log('  ' + s);
if (failures.length) {
  console.error(`\n${failures.length} problem(s) — screenshots may be wrong:`);
  for (const f of failures) console.error('  ' + f);
  process.exitCode = 1;
}
