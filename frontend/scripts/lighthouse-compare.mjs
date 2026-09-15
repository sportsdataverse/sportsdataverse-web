// Lighthouse comparison of a PR's deployment against its base, the evidence CLAUDE.md
// "PR evidence" requires (and .github/workflows/pr-evidence.yml posts on every PR).
//
//   node scripts/lighthouse-compare.mjs \
//     --base-url https://sportsdataverse.org \
//     --head-url https://sportsdataverse-<hash>-sportsdataverse.vercel.app --shots / /packages
//
// Unlike game-on-paper (which builds both trees), this site already has a real deployment
// for every commit: Vercel builds a Preview per PR push and a Production deployment per
// merge to main, with every runtime secret configured. Measuring those deployments means
// no local build, no .env.local, and numbers that include Vercel's real serving (edge
// cache, compression, server rendering).
//
// For each route it warms both URLs twice (a cold serverless render or an edge cache
// miss would otherwise land on whichever side runs first), then runs Lighthouse `mobile`
// and `--preset=desktop` --runs times per side, alternating base and head so drift hits
// both. Every metric keeps its min-max run range; lighthouse-verdicts.mjs decides what
// is a real change. Writes <out>/summary.json and <out>/lighthouse.md (raw reports in
// <out>/reports/); --shots runs visual-check.mjs against the head URL into <out>/shots/.
//
// Not repo dependencies: lighthouse from frontend/node_modules, `npm root -g`, or NODE_PATH
// (`npm i -g lighthouse`); Chrome from CHROME_PATH or the installed Google Chrome. Set
// LIGHTHOUSE_NO_SANDBOX=1 in a root container or on an Ubuntu 24.04 runner.
import { parseArgs } from 'node:util';
import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, fmt, verdicts, withRange } from './lighthouse-verdicts.mjs';

const { values: opt, positionals: routes } = parseArgs({
  allowPositionals: true,
  options: {
    'base-url': { type: 'string' },
    'head-url': { type: 'string' },
    'base-label': { type: 'string', default: 'base' },
    'head-label': { type: 'string', default: 'PR' },
    runs: { type: 'string', default: '3' },
    presets: { type: 'string', default: 'mobile,desktop' },
    shots: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

const FRONTEND = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNS = Number(opt.runs);
const PRESETS = opt.presets.split(',').filter(Boolean);

function usage(msg) {
  console.error(`${msg}\nusage: node scripts/lighthouse-compare.mjs --base-url URL --head-url URL [--runs 3]
  [--presets mobile,desktop] [--shots] [--out dir] [--base-label text] [--head-label text] <route> [route...]`);
  process.exit(2);
}
const origin = (u, name) => {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    return usage(`--${name} must be an http(s) URL`);
  }
};
if (!opt['base-url'] || !opt['head-url']) usage('--base-url and --head-url are required');
const URLS = { base: origin(opt['base-url'], 'base-url'), head: origin(opt['head-url'], 'head-url') };
if (!routes.length) usage('at least one route is required');
if (!routes.every((r) => r.startsWith('/'))) usage('routes are paths starting with "/"');
if (!(RUNS >= 1)) usage('--runs must be >= 1');
if (!PRESETS.every((p) => p === 'mobile' || p === 'desktop')) usage(`unknown preset in --presets ${opt.presets}`);

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-'));
const owner = new Map();
for (const r of routes) {
  if (owner.has(slug(r)) && owner.get(slug(r)) !== r) usage(`routes ${owner.get(slug(r))} and ${r} map to the same file name "${slug(r)}"; pass only one`);
  owner.set(slug(r), r);
}

const OUT = resolve(opt.out ?? join(FRONTEND, 'img', 'lighthouse', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')));
mkdirSync(join(OUT, 'reports'), { recursive: true });
const say = (msg) => console.log(`[lighthouse-compare] ${msg}`);

function findLighthouse() {
  const roots = [join(FRONTEND, 'node_modules')];
  try {
    roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {}
  roots.push(...(process.env.NODE_PATH ?? '').split(':').filter(Boolean));
  for (const root of roots) {
    const cli = join(root, 'lighthouse', 'cli', 'index.js');
    if (existsSync(cli)) return cli;
  }
  console.error('lighthouse not found. Install it (not a repo dependency): `npm i -g lighthouse`, then re-run.');
  process.exit(2);
}
const LIGHTHOUSE = findLighthouse();
// The Vercel Toolbar (vercel.live feedback.js, sometimes a 35 KB iframe) is injected into every
// Preview and never into Production; it loads at low priority, so blocking it on both sides costs
// nothing (measured: preview /packages FCP 977-1147 ms blocked vs 1015-1135 ms unblocked).
//
// Do NOT block plausible.io, although it loads only in production: the page PRELOADS its script
// at high priority, and Lighthouse's simulated throttling treats a blocked high-priority request
// as a long stall -- production /packages FCP read 1716 ms blocked vs 1134 ms unblocked, which
// flagged a fake FCP "improvement" on #45. The 2 KB deferred script is left in as real weight.
const DEPLOYMENT_ONLY = ['*vercel.live*'];
// Third-party origins only Production loads (next-plausible runs only there). Lighthouse's simulated
// throttling counts the preloaded Plausible round trip in first paint, so a Production base reads
// ~0.8 s slower FCP than any Preview on identical code (#45); see baseHandicapped in the verdicts.
const PRODUCTION_ONLY_ORIGINS = ['plausible.io'];

// ---------------------------------------------------------------- warm + check
async function warm(side, route) {
  let res, body, ms;
  for (let i = 0; i < 2; i++) {
    const t0 = performance.now();
    res = await fetch(URLS[side] + route, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
    ms = performance.now() - t0;
    body = await res.text();
  }
  if (!res.ok) throw new Error(`${side} ${URLS[side]}${route}: HTTP ${res.status}`);
  const title = (body.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim();
  say(`${side} ${route}: ${res.status} "${title}" ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB, warm ${Math.round(ms)} ms`);
  const noindex = /noindex/i.test(res.headers.get('x-robots-tag') ?? '');
  return { status: res.status, title, bytes: Buffer.byteLength(body), warmMs: Math.round(ms), finalUrl: res.url, noindex };
}

// ---------------------------------------------------------------- lighthouse
function metrics(report) {
  const num = (id) => report.audits[id]?.numericValue ?? null;
  const items = report.audits['resource-summary']?.details?.items ?? [];
  const kb = (type) => (items.find((i) => i.resourceType === type)?.transferSize ?? 0) / 1024;
  const failing = [];
  for (const cat of Object.values(report.categories)) {
    for (const ref of cat.auditRefs) {
      if (ref.weight > 0 && report.audits[ref.id]?.score === 0) failing.push(ref.id);
    }
  }
  const cat = (id) => (report.categories[id]?.score ?? null);
  return {
    performance: cat('performance'), accessibility: cat('accessibility'), bestPractices: cat('best-practices'), seo: cat('seo'),
    fcp: num('first-contentful-paint'), lcp: num('largest-contentful-paint'), tbt: num('total-blocking-time'),
    cls: num('cumulative-layout-shift'), si: num('speed-index'), ttfb: num('server-response-time'),
    htmlKb: kb('document'), jsKb: kb('script'), dom: num('dom-size'),
    failing: [...new Set(failing)],
    shift: report.audits['layout-shifts']?.details?.items?.[0]?.node?.selector ?? null,
    // hosts other than the measured deployment's own, excluding requests blocked above
    origins: [...new Set((report.audits['network-requests']?.details?.items ?? [])
      .filter((i) => i.statusCode !== -1)
      .map((i) => { try { return new URL(i.url).hostname; } catch { return null; } })
      .filter((h) => h && h !== new URL(report.finalDisplayedUrl ?? report.requestedUrl).hostname
        && !/(^|\.)www\.sportsdataverse\.org$|^sportsdataverse\.org$/.test(h)))],
  };
}

function lighthouse(url, preset, reportPath) {
  const chromeFlags = ['--headless=new', '--disable-gpu'];
  if (process.env.LIGHTHOUSE_NO_SANDBOX || process.env.VISUAL_CHECK_NO_SANDBOX) chromeFlags.push('--no-sandbox');
  const args = [LIGHTHOUSE, url, '--output=json', `--output-path=${reportPath}`, '--quiet',
    `--chrome-flags=${chromeFlags.join(' ')}`, '--max-wait-for-load=90000',
    ...DEPLOYMENT_ONLY.map((p) => `--blocked-url-patterns=${p}`)];
  if (preset === 'desktop') args.push('--preset=desktop');
  return new Promise((ok) => {
    let stderr = '';
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !existsSync(reportPath)) return ok({ error: stderr.trim().split('\n').pop() || `exit ${code}` });
      try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));
        if (report.runtimeError) return ok({ error: report.runtimeError.message });
        ok(metrics(report));
      } catch (e) {
        ok({ error: e.message });
      }
    });
  });
}

// ---------------------------------------------------------------- markdown
function markdown(summary) {
  const lines = [`Base \`${summary.base.url}\` (${summary.base.label}) → PR \`${summary.head.url}\` (${summary.head.label}) · ${RUNS} run${RUNS > 1 ? 's' : ''} per preset, median (min–max) · both deployed on Vercel`];
  for (const route of routes) {
    const byPreset = summary.results[route];
    if (!byPreset) continue;
    lines.push('', `#### \`${route}\``, '');
    const cols = PRESETS.flatMap((p) => [`base ${p}`, `PR ${p}`]);
    lines.push(`| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    const cell = (p, t, key) => (byPreset[p][t][key].median == null ? '–' : withRange(key, byPreset[p][t][key]));
    const row = (label, fn) => lines.push(`| ${label} | ${PRESETS.flatMap((p) => ['base', 'head'].map((t) => fn(p, t))).join(' | ')} |`);
    row('Performance', (p, t) => cell(p, t, 'performance'));
    row('Accessibility', (p, t) => fmt('accessibility', byPreset[p][t].accessibility.median));
    row('Best Practices', (p, t) => fmt('bestPractices', byPreset[p][t].bestPractices.median));
    // every Vercel deployment URL (Preview AND a Production deployment's *.vercel.app URL) sends
    // X-Robots-Tag: noindex; only the custom domain is indexable
    const noindexSides = ['base', 'head'].filter((t) => summary.pages[t][route]?.noindex);
    row(noindexSides.length ? 'SEO¹' : 'SEO', (p, t) => fmt('seo', byPreset[p][t].seo.median));
    row('FCP / LCP', (p, t) => `${fmt('fcp', byPreset[p][t].fcp.median)} / ${fmt('lcp', byPreset[p][t].lcp.median)}`);
    row('TBT', (p, t) => cell(p, t, 'tbt'));
    row('CLS', (p, t) => cell(p, t, 'cls'));
    row('Speed Index', (p, t) => fmt('si', byPreset[p][t].si.median));
    row('Server response', (p, t) => cell(p, t, 'ttfb'));
    row('HTML / JS transfer', (p, t) => `${fmt('htmlKb', byPreset[p][t].htmlKb.median)} / ${fmt('jsKb', byPreset[p][t].jsKb.median)}`);
    row('DOM elements', (p, t) => fmt('dom', byPreset[p][t].dom.median));
    const ignoreAudits = noindexSides.length ? ['is-crawlable'] : [];
    const originsOf = (side) => new Set(PRESETS.flatMap((p) => (raw[route]?.[p]?.[side] ?? []).flatMap((m) => m?.origins ?? [])));
    const [baseOrigins, headOrigins] = [originsOf('base'), originsOf('head')];
    const baseOnly = [...baseOrigins].filter((h) => !headOrigins.has(h));
    const headOnly = [...headOrigins].filter((h) => !baseOrigins.has(h));
    const productionOnly = baseOnly.filter((h) => PRODUCTION_ONLY_ORIGINS.some((o) => h === o || h.endsWith(`.${o}`)));
    const baseHandicapped = productionOnly.length > 0;
    const found = PRESETS.flatMap((p) => verdicts(byPreset[p].base, byPreset[p].head, p, { ignoreAudits, baseHandicapped })).sort((a, b) => b.worse - a.worse);
    if (headOnly.length) found.unshift({ worse: true, line: `**New third-party origin${headOnly.length > 1 ? 's' : ''} on the PR:** ${headOnly.map((h) => `\`${h}\``).join(', ')}` });
    lines.push('');
    if (baseHandicapped) lines.push(`² The base loads ${productionOnly.map((h) => `\`${h}\``).join(', ')}, which only Production deployments load, so base timings read slower for reasons outside this PR. Timing improvements (Performance, FCP, LCP, TBT, Speed Index) are not reported; regressions still are.`, '');
    if (noindexSides.length) {
      const who = noindexSides.length === 2 ? 'Both deployments send' : `The ${noindexSides[0] === 'head' ? 'PR' : 'base'} deployment sends`;
      lines.push(`¹ ${who} \`X-Robots-Tag: noindex\` (every Vercel deployment URL does; only sportsdataverse.org is indexable), so Lighthouse\'s \`is-crawlable\` audit fails and SEO reads lower. That audit is left out of the verdicts.`, '');
    }
    if (found.length) for (const v of found) lines.push(`- ${v.worse ? '🔴' : '🟢'} ${v.line}`);
    else lines.push('- No change beyond run-to-run noise (run ranges overlap, or the change is below the reporting floor).');
    for (const p of PRESETS) for (const t of ['base', 'head']) for (const e of byPreset[p][t].errors) lines.push(`- ⚠️ failed run, ${t} ${p}: ${e}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- main
const failures = [];
const pages = { base: {}, head: {} };
const raw = {}; // raw[route][preset][side] = [run metrics]
try {
  for (const route of routes) for (const side of ['base', 'head']) pages[side][route] = await warm(side, route);

  for (const route of routes) {
    for (const preset of PRESETS) {
      for (let run = 0; run < RUNS; run++) {
        for (const side of run % 2 ? ['head', 'base'] : ['base', 'head']) {
          const report = join(OUT, 'reports', `${slug(route)}-${preset}-${side}-${run + 1}.json`);
          const m = await lighthouse(URLS[side] + route, preset, report);
          ((raw[route] ??= {})[preset] ??= {})[side] ??= [];
          raw[route][preset][side][run] = m;
          say(`${route} ${preset} ${side} run ${run + 1}/${RUNS}: ${m.error ? `ERROR ${m.error}` : `perf ${Math.round(m.performance * 100)}`}`);
        }
      }
    }
  }

  if (opt.shots) {
    say('head: screenshots (desktop/mobile x light/dark)');
    const code = await new Promise((ok) => {
      const child = spawn(process.execPath, [join(FRONTEND, 'scripts', 'visual-check.mjs'), ...routes], {
        stdio: 'inherit',
        env: { ...process.env, BASE: URLS.head, OUT: join(OUT, 'shots'), VISUAL_CHECK_FORMAT: 'jpeg', VISUAL_CHECK_THUMBS: '1' },
      });
      child.on('exit', ok);
    });
    if (code !== 0) failures.push(`visual-check exited ${code}`);
  }
} catch (e) {
  failures.push(e.message);
  console.error(`[lighthouse-compare] ${e.message}`);
}

const summary = {
  base: { url: URLS.base, label: opt['base-label'] },
  head: { url: URLS.head, label: opt['head-label'] },
  routes, presets: PRESETS, runs: RUNS, pages, results: {}, failures,
};
for (const [route, byPreset] of Object.entries(raw)) {
  for (const [preset, bySide] of Object.entries(byPreset)) {
    (summary.results[route] ??= {})[preset] = { base: aggregate(bySide.base), head: aggregate(bySide.head) };
  }
}
const cells = routes.flatMap((r) => PRESETS.map((p) => [r, p, summary.results[r]?.[p]]));
const complete = cells.every(([, , c]) => c && c.base.runs > 0 && c.head.runs > 0);
for (const [r, p, c] of cells) {
  for (const side of ['base', 'head']) {
    const got = c?.[side].runs ?? 0;
    if (got === RUNS) continue;
    const why = c?.[side].errors.length ? `: ${[...new Set(c[side].errors)].join('; ')}` : '';
    failures.push(`${r} ${p} ${side}: ${got}/${RUNS} Lighthouse runs succeeded${why}`);
  }
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'lighthouse.md'), complete ? markdown(summary) : `Lighthouse comparison incomplete:\n\n${failures.map((f) => `- ${f.split('\n')[0]}`).join('\n')}`);
say(`wrote ${join(OUT, 'lighthouse.md')} and summary.json`);
if (failures.length || !complete) process.exitCode = 1;
