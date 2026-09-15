// Pure summary + verdict logic for lighthouse-compare.mjs, split out so the rules are
// pinned by `npm run test:scripts` (lighthouse-verdicts.test.mjs) without any deployment.
// Ported from game-on-paper-app, where each rule below was learned from a false flag.

export const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export const KEYS = ['performance', 'accessibility', 'bestPractices', 'seo', 'fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb', 'htmlKb', 'jsKb', 'dom'];

export function aggregate(runs = []) {
  const ok = runs.filter((r) => r && !r.error);
  const agg = { runs: ok.length, errors: runs.filter((r) => r?.error).map((r) => r.error) };
  for (const k of KEYS) {
    const v = ok.map((r) => r[k]).filter((x) => x != null);
    agg[k] = { median: median(v), min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null };
  }
  agg.failingAll = ok.length ? ok[0].failing.filter((id) => ok.every((r) => r.failing.includes(id))) : [];
  agg.failingAny = [...new Set(ok.flatMap((r) => r.failing))];
  const shifts = ok.map((r) => r.shift).filter(Boolean);
  agg.shift = shifts.sort((a, b) => shifts.filter((s) => s === b).length - shifts.filter((s) => s === a).length)[0] ?? null;
  return agg;
}

const LOWER_IS_BETTER = new Set(['fcp', 'lcp', 'tbt', 'cls', 'si', 'htmlKb', 'jsKb', 'dom']);
// A delta earns a bullet only when the gap between the base and PR run ranges is at
// least FLOOR (so ranges must separate, by a meaningful amount) AND the median moved by
// at least REL_FLOOR of the base. Merely non-overlapping ranges were not enough: 3 runs
// per side of byte-identical HTML separated TBT 329 → 232 ms (game-on-paper-app #247) and CLS by 0.006 (#250).
export const FLOOR = { performance: 0.03, fcp: 200, lcp: 200, tbt: 100, cls: 0.02, si: 250, htmlKb: 2, jsKb: 2, dom: 50 };
// Performance has no relative floor on purpose: it is already a 0-100 score, and a
// 3-point drop matters as much on a 40 page as on a 90 one (a relative floor would
// hide real drops exactly where pages are already slow).
export const REL_FLOOR = { fcp: 0.1, lcp: 0.1, tbt: 0.25, si: 0.1, cls: 0.1, htmlKb: 0.02, jsKb: 0.02, dom: 0.02 };
const TIMING = new Set(['performance', 'fcp', 'lcp', 'tbt', 'si']);
const LABEL = { performance: 'Performance', fcp: 'FCP', lcp: 'LCP', tbt: 'TBT', cls: 'CLS', si: 'Speed Index', htmlKb: 'HTML transfer', jsKb: 'JS transfer', dom: 'DOM elements' };

export function fmt(key, v) {
  if (v == null) return '–';
  if (['performance', 'accessibility', 'bestPractices', 'seo'].includes(key)) return String(Math.round(v * 100));
  if (['fcp', 'lcp', 'si'].includes(key)) return `${(v / 1000).toFixed(1)} s`;
  if (key === 'tbt' || key === 'ttfb') return `${Math.round(v).toLocaleString('en-US')} ms`;
  if (key === 'cls') return v.toFixed(3);
  if (key === 'htmlKb' || key === 'jsKb') return `${Math.round(v).toLocaleString('en-US')} KB`;
  return Math.round(v).toLocaleString('en-US');
}

export const withRange = (key, m) => (fmt(key, m.min) === fmt(key, m.max) ? fmt(key, m.median) : `${fmt(key, m.median)} (${fmt(key, m.min)}–${fmt(key, m.max)})`);

// opts.ignoreAudits: audits whose pass/fail reflects the deployment, not the code -- e.g.
// `is-crawlable` on a Vercel deployment URL, which always sends `X-Robots-Tag: noindex`.
// opts.baseHandicapped: the base side loads production-only resources the PR deployment never
// loads (Plausible), so base timings are slower for reasons outside the PR. Timing IMPROVEMENTS
// are then unreliable and dropped; regressions are kept (the handicap only makes them conservative).
export function verdicts(base, head, preset, opts = {}) {
  const ignored = new Set(opts.ignoreAudits ?? []);
  const out = [];
  for (const key of Object.keys(FLOOR)) {
    const b = base[key];
    const h = head[key];
    if (b.median == null || h.median == null) continue;
    const delta = h.median - b.median;
    // the space BETWEEN the two run ranges (<= 0 when they overlap) must itself clear the
    // absolute floor: ranges that merely don't touch (CLS 0.825 vs 0.831-1.116 in #250,
    // on a page whose CLS swings 0.56-1.13 with hydration timing) are still noise
    const gap = Math.max(h.min - b.max, b.min - h.max);
    if (gap < FLOOR[key]) continue;
    if (REL_FLOOR[key] && Math.abs(delta) < REL_FLOOR[key] * Math.abs(b.median)) continue;
    const worse = LOWER_IS_BETTER.has(key) ? delta > 0 : delta < 0;
    if (opts.baseHandicapped && !worse && TIMING.has(key)) continue;
    let line = `**${worse ? 'Regression' : 'Improvement'}, ${preset} ${LABEL[key]}:** ${withRange(key, b)} → ${withRange(key, h)}`;
    if (key === 'cls' && worse && head.shift) line += `. Largest shift: \`${head.shift}\``;
    out.push({ worse, line });
  }
  const newly = head.failingAll.filter((id) => !base.failingAny.includes(id) && !ignored.has(id));
  const fixed = base.failingAll.filter((id) => !head.failingAny.includes(id) && !ignored.has(id));
  if (newly.length) out.push({ worse: true, line: `**Newly failing audits, ${preset}:** ${newly.map((i) => `\`${i}\``).join(', ')}` });
  if (fixed.length) out.push({ worse: false, line: `**Audits now passing, ${preset}:** ${fixed.map((i) => `\`${i}\``).join(', ')}` });
  return out;
}
