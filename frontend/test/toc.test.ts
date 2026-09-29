import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableOfContents } from '../lib/toc.ts';

// Expected slugs are the ids rehype-slug gives these headings when the post is rendered
// (components/mdx/MdxRenderer.tsx): github-slugger over the heading text, one slugger per document.

test('getTableOfContents: bold, code and link headings become plain-text labels', () => {
  const toc = getTableOfContents([
    '## **Our Authors**',
    '## The `sportsdataverse` meta-package',
    '## Follow the [SportsDataverse](https://twitter.com/SportsDataverse) on Twitter',
    '### **Our Contributors (they’re awesome)**',
  ].join('\n\n'));
  assert.deepEqual(toc, [
    { level: 0, heading: 'Our Authors', slug: 'our-authors' },
    { level: 0, heading: 'The sportsdataverse meta-package', slug: 'the-sportsdataverse-meta-package' },
    { level: 0, heading: 'Follow the SportsDataverse on Twitter', slug: 'follow-the-sportsdataverse-on-twitter' },
    { level: 1, heading: 'Our Contributors (they’re awesome)', slug: 'our-contributors-theyre-awesome' },
  ]);
});

test('getTableOfContents: an escaped ~ is unescaped and its spaces keep github-slugger\'s double hyphen', () => {
  const [entry] = getTableOfContents('### **NBA full play-by-play seasons (2002-2026) \\~ 1-2 minutes**');
  assert.equal(entry.heading, 'NBA full play-by-play seasons (2002-2026) ~ 1-2 minutes');
  assert.equal(entry.slug, 'nba-full-play-by-play-seasons-2002-2026--1-2-minutes');
});

test('getTableOfContents: repeated headings get -1, -2 like the rendered ids', () => {
  const toc = getTableOfContents('## Setup\n\n## Setup\n\n### Setup');
  assert.deepEqual(toc.map((t) => t.slug), ['setup', 'setup-1', 'setup-2']);
});

test('getTableOfContents: ## inside a fenced code block is not a heading', () => {
  const toc = getTableOfContents('## Install\n\n```r\n## a comment in R\nlibrary(hoopR)\n```\n\n## Usage');
  assert.deepEqual(toc.map((t) => t.heading), ['Install', 'Usage']);
});

test('getTableOfContents: an h1 is left out of the list but still counts toward the suffix', () => {
  const toc = getTableOfContents('# hoopR\n\n## hoopR\n\n## Citations');
  assert.deepEqual(toc, [
    { level: 0, heading: 'hoopR', slug: 'hoopr-1' },
    { level: 0, heading: 'Citations', slug: 'citations' },
  ]);
});

test('getTableOfContents: parses MDX like the renderer (imports, JSX, 4-space-indented headings)', () => {
  const toc = getTableOfContents([
    "import Tip from './Tip'",
    "# hoopR <a href='https://hoopr.sportsdataverse.org/'><img src='logo.png' /></a>",
    '<Tip>',
    '## Inside a component',
    '</Tip>',
    // CommonMark reads this as indented code; MDX (no indented code) renders it as an h4
    '    #### 33.9 sec elapsed',
  ].join('\n\n'));
  assert.deepEqual(toc, [
    { level: 0, heading: 'Inside a component', slug: 'inside-a-component' },
    { level: 2, heading: '33.9 sec elapsed', slug: '339-sec-elapsed' },
  ]);
});
