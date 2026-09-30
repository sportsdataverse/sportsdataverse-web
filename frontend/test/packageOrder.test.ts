import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cranDoi, cranHref, packageOrder } from '../lib/packageOrder.ts';

const r = (title: string) => ({ title, repoType: 'R' });

test('R section lists flagship, then CRAN packages, then the rest, alphabetical in each', () => {
  const titles = [r('sdvplotR'), r('wehoop'), r('cfbplotR'), r('sportsdataverse'), r('baseballr'), r('chessR')]
    .sort(packageOrder)
    .map((p) => p.title);
  assert.deepEqual(titles, ['sportsdataverse', 'baseballr', 'wehoop', 'cfbplotR', 'chessR', 'sdvplotR']);
});

test('CRAN tier is R-only: a same-named package in another ecosystem stays alphabetical', () => {
  const titles = [{ title: 'aaa', repoType: 'Python' }, { title: 'hoopR', repoType: 'Python' }]
    .sort(packageOrder)
    .map((p) => p.title);
  assert.deepEqual(titles, ['aaa', 'hoopR']);
});

test('CRAN link is the canonical package URL, DOI separate, for R packages on CRAN only', () => {
  assert.equal(cranHref(r('hoopR')), 'https://CRAN.R-project.org/package=hoopR');
  assert.equal(cranDoi(r('hoopR')), '10.32614/CRAN.package.hoopR');
  for (const p of [r('sdvplotR'), { title: 'hoopR', repoType: 'Python' }]) {
    assert.equal(cranHref(p), null);
    assert.equal(cranDoi(p), null);
  }
});
