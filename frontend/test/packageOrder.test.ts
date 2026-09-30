import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cranDoiHref, packageOrder } from '../lib/packageOrder.ts';

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

test('CRAN badge links the CRAN DOI for R packages on CRAN only', () => {
  assert.equal(cranDoiHref(r('hoopR')), 'https://doi.org/10.32614/CRAN.package.hoopR');
  assert.equal(cranDoiHref(r('sdvplotR')), null);
  assert.equal(cranDoiHref({ title: 'hoopR', repoType: 'Python' }), null);
});
