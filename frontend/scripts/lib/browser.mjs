// Shared browser plumbing for visual-check.mjs and walkthrough.mjs: resolve playwright-core
// without making it a repo dependency, launch the installed Chrome, and open a context that
// renders the site the way a visitor who picked {device, scheme} sees it.
import { delimiter, join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export async function loadChromium() {
  try { return (await import('playwright-core')).chromium; } catch {}
  const req = createRequire(import.meta.url);
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  roots.push(...(process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean));
  for (const base of roots) {
    try { return req(join(base, 'playwright-core')).chromium; } catch {}
  }
  console.error('playwright-core not found. Install it (it downloads no browser): `npm i -g playwright-core`, then re-run.');
  process.exit(2);
}

export function launchOptions() {
  const args = process.env.VISUAL_CHECK_NO_SANDBOX ? ['--no-sandbox'] : [];
  return process.env.VISUAL_CHECK_EXECUTABLE
    ? { executablePath: process.env.VISUAL_CHECK_EXECUTABLE, args }
    : { channel: 'chrome', args };
}

// the review matrix -- never fewer than these four per route
export const DEVICES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];
export const SCHEMES = ['light', 'dark'];

export const slug = (r) => (r === '/' ? 'home' : r.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-'));

// Theme: next-themes runs with defaultTheme="dark" (app/providers.tsx), so emulating
// prefers-color-scheme alone never shows light mode. Seed next-themes' `theme` key in
// localStorage before any script runs AND emulate the matching color scheme.
export async function newThemedContext(browser, device, scheme, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    colorScheme: scheme,
    deviceScaleFactor: 2,
    ...extra,
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, scheme);
  // keep deployment-only requests out: the Vercel Toolbar (injected into Previews) and
  // Plausible (production only; a screenshot run must not count as a pageview)
  await ctx.route(/^https:\/\/(vercel\.live|plausible\.io)\//, (r) => r.abort());
  return ctx;
}

// Which theme the page actually rendered -- the class next-themes applied to <html>.
export const appliedScheme = (page) =>
  page.evaluate(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
