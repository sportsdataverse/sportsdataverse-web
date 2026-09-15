// npm run test:scripts   (from frontend/; node:test, no dependencies)
// Each case is a real measurement from game-on-paper-app, where these rules were tuned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, verdicts } from './lighthouse-verdicts.mjs';

const run = (m, failing = []) => ({
  performance: 0.6, accessibility: 0.86, bestPractices: 0.96, seo: 1,
  fcp: 3000, lcp: 3500, tbt: 300, cls: 0.2, si: 3000, ttfb: 120, htmlKb: 111, jsKb: 146, dom: 14839,
  failing, shift: null, ...m,
});
const side = (runs, failing = []) => aggregate(runs.map((m) => run(m, failing)));
const lines = (base, head) => verdicts(base, head, 'mobile').map((v) => v.line);

test('identical HTML whose 3-run TBT ranges separated (329 → 232 ms) is not flagged', () => {
  assert.deepEqual(lines(side([{ tbt: 284 }, { tbt: 329 }, { tbt: 334 }]), side([{ tbt: 226 }, { tbt: 232 }, { tbt: 235 }])), []);
});

test('ranges separated by less than the floor are noise (CLS 0.825 vs 0.831–1.116)', () => {
  assert.deepEqual(lines(side([{ cls: 0.825 }, { cls: 0.825 }, { cls: 0.825 }]), side([{ cls: 0.831 }, { cls: 1.098 }, { cls: 1.116 }])), []);
});

test('overlapping ranges are never flagged, however large the median gap', () => {
  assert.deepEqual(lines(side([{ performance: 0.51 }, { performance: 0.69 }, { performance: 0.65 }]), side([{ performance: 0.55 }, { performance: 0.72 }, { performance: 0.57 }])), []);
});

test('real regressions are flagged, with newly failing audits', () => {
  const base = side([{ performance: 0.56, tbt: 473, cls: 0.229, lcp: 3800, htmlKb: 111 }, { performance: 0.57, tbt: 570, cls: 0.229, lcp: 3900, htmlKb: 111 }]);
  const head = side([{ performance: 0.40, tbt: 888, cls: 0.262, lcp: 4200, htmlKb: 168 }, { performance: 0.43, tbt: 1399, cls: 0.262, lcp: 4400, htmlKb: 168 }], ['select-name']);
  const out = lines(base, head).join('\n');
  for (const want of ['Regression, mobile Performance', 'Regression, mobile TBT', 'Regression, mobile LCP', 'Regression, mobile CLS', 'Regression, mobile HTML transfer', '`select-name`']) {
    assert.ok(out.includes(want), `missing: ${want}\n${out}`);
  }
});

test('improvements read as improvements', () => {
  const out = lines(side([{ tbt: 900 }, { tbt: 1000 }]), side([{ tbt: 400 }, { tbt: 450 }]));
  assert.equal(out.length, 1);
  assert.match(out[0], /Improvement, mobile TBT/);
});

test('server response is reported, never flagged (edge cache state differs between deployments)', () => {
  assert.deepEqual(lines(side([{ ttfb: 40 }, { ttfb: 45 }]), side([{ ttfb: 900 }, { ttfb: 950 }])), []);
});

test('an ignored audit (is-crawlable on a noindex Vercel Preview) is not reported as newly failing', () => {
  const base = side([{}, {}]);
  const head = side([{}, {}], ['is-crawlable', 'image-alt']);
  const out = verdicts(base, head, 'desktop', { ignoreAudits: ['is-crawlable'] }).map((v) => v.line).join('\n');
  assert.ok(!out.includes('is-crawlable'), out);
  assert.ok(out.includes('image-alt'), 'other newly failing audits still reported');
});

test('a handicapped base (production-only Plausible) drops timing improvements but keeps regressions and size findings', () => {
  const base = side([{ fcp: 1700, tbt: 200, jsKb: 146 }, { fcp: 1750, tbt: 210, jsKb: 146 }]);
  const head = side([{ fcp: 900, tbt: 600, jsKb: 200 }, { fcp: 950, tbt: 650, jsKb: 200 }]);
  const out = verdicts(base, head, 'mobile', { baseHandicapped: true }).map((v) => v.line).join('\n');
  assert.ok(!out.includes('FCP'), out);
  assert.ok(out.includes('Regression, mobile TBT'), out);
  assert.ok(out.includes('Regression, mobile JS transfer'), out);
});
