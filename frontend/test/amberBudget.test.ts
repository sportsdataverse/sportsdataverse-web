import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards DESIGN.md's amber discipline: "the scoreboard amber appears in at most three places per view
// (ticker, one active marker, one underline)", and its ban on the repeated uppercase-tracked eyebrow.
// The budget was spent page by page until /about showed it 13 times, so this is a source scan of the
// public site, in the style of test/packageVisibilityReaders.test.ts: every use of the `score` colour
// (any utility, variant or opacity, or the raw token and hex values) and every `eyebrow` must sit in a
// file on the allow-list below, and no more often than the allow-list says.
//
// Scanned: ts/tsx/js/jsx/mjs/cjs, css and mdx under app, components, layout, lib, content, hooks, utils,
// styles, and the MDX roots posts, snippets and static_pages. In CSS, the two token DEFINITIONS
// (`--color-score: …`, `--color-score-ink: …` in @theme / :root / .dark) are not uses and are skipped;
// every `var(--color-score…)`, hex or rgb() of the amber is.
//
// Not scanned: the members' area (`app/(platform)`, `components/platform`, `lib/platform`), whose charts
// draw their crosshair in `score` (DESIGN.md "Chart colour" counts it toward that view's budget), and
// `app/api`, which renders no page (the OG image route draws its own amber); `test/`; `public/`.
//
// Known limit: a text scan. A class name or colour assembled at runtime from pieces ("bg-" + tone) is
// invisible to it; build class names from whole literals, as Tailwind needs anyway. Amber in a database
// or a remote document is out of its reach too.
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/

const SCAN_ROOTS = ['app', 'components', 'layout', 'lib', 'content', 'hooks', 'utils', 'styles', 'posts', 'snippets', 'static_pages'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'coverage', 'public', 'test']);
const SKIP_PATHS = ['app/(platform)', 'app/api', 'components/platform', 'lib/platform'];
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|css|mdx)$/;

// The only places the amber may appear on a public page, and how many uses each file may hold.
export const ALLOWED: Record<string, { uses: number; what: string }> = {
  'components/site/Ticker.tsx': { uses: 1, what: 'the ticker separators' },
  'components/site/SiteNav.tsx': { uses: 2, what: 'the active-page marker (flat links, Learn trigger)' },
  'components/site/PageHeader.tsx': { uses: 1, what: 'the page underline' },
  'components/site/HomeClient.tsx': { uses: 1, what: 'the home hero underline' },
};

// A Tailwind colour utility on the score token, whatever its variant prefix (`after:`, `dark:`, `md:hover:`)
// or opacity suffix (`/20`): text-score, bg-score/20, border-b-score, after:bg-score, dark:text-score-ink…
const UTILITY =
  /(?<![\w-])(?:text|bg|border(?:-[xytrblse])?|outline|ring(?:-offset)?|decoration|fill|stroke|from|via|to|shadow|inset-shadow|drop-shadow|accent|caret|divide|placeholder)-score(?:-ink)?(?![\w-])/g;
// The token or its values written out: bg-[var(--color-score)], style={{ color: "#ffb43c" }}, rgb(255 180 60).
const RAW = /--color-score(?:-ink)?(?![\w-])|#(?:ffb43c|8a5300)(?:[0-9a-f]{2})?(?![0-9a-f])|colors\.score(?:-ink)?\b|rgba?\(\s*255[\s,]+180[\s,]+60(?!\d)/gi;
const EYEBROW = /(?<![\w-])eyebrow(?![\w-])/g;

// A CSS custom-property declaration that DEFINES the token (not a use). Blanked, newline kept, so line numbers hold.
const TOKEN_DEFINITION = /^[ \t]*--color-score(?:-ink)?[ \t]*:[^;\n]*;?[ \t]*$/gm;

/** `file:line token` for every amber colour use and every eyebrow in one source text. */
export function amberUses(rel: string, text: string): string[] {
  if (rel.endsWith('.css')) text = text.replace(TOKEN_DEFINITION, '');
  const found: { at: number; token: string }[] = [];
  for (const re of [UTILITY, RAW, EYEBROW]) {
    for (const m of text.matchAll(re)) found.push({ at: m.index ?? 0, token: m[0] });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ at, token }) => `${rel}:${text.slice(0, at).split('\n').length} ${token}`);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

test('the amber and the eyebrow appear on the public site only where DESIGN.md allows', () => {
  const offenders: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(path.join(frontendRoot, root))) {
      const rel = path.relative(frontendRoot, file).split(path.sep).join('/');
      if (SKIP_PATHS.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
      const uses = amberUses(rel, fs.readFileSync(file, 'utf8'));
      if (uses.length > (ALLOWED[rel]?.uses ?? 0)) offenders.push(...uses);
    }
  }
  assert.deepEqual(offenders, [], `amber or eyebrow outside the budget:\n${offenders.join('\n')}`);
});

test('every allow-listed file still exists, so a rename cannot carry an allowance away', () => {
  for (const rel of Object.keys(ALLOWED)) assert.ok(fs.existsSync(path.join(frontendRoot, rel)), rel);
});

test('the scanner sees every way of writing the amber, and nothing else', () => {
  const hit = (s: string) => amberUses('x.tsx', s).map((u) => u.replace(/^x\.tsx:\d+ /, ''));
  for (const cls of ['text-score', 'bg-score', 'bg-score/20', 'border-score', 'border-b-score', 'after:bg-score',
    'dark:text-score-ink', 'text-score-ink', 'md:hover:decoration-score', 'fill-score', 'stroke-score',
    'ring-score', 'outline-score', 'shadow-score/40', 'from-score', 'caret-score']) {
    assert.deepEqual(hit(`<span className="x ${cls} y" />`).length, 1, cls);
  }
  assert.equal(hit('<span className="bg-[var(--color-score)]" />').length, 1, 'arbitrary value');
  assert.equal(hit('<span style={{ color: "#FFB43C" }} />').length, 1, 'hex, any case');
  assert.equal(hit('<span style={{ color: "#8a5300cc" }} />').length, 1, 'ink hex with alpha');
  assert.equal(hit('<span className="text-[rgb(255,180,60)]" />').length, 1, 'rgb');
  assert.equal(hit('<p className="eyebrow">x</p>').length, 1, 'the utility');
  assert.equal(hit('<PageHeader eyebrow="x" title="y" />').length, 1, 'the prop');
  for (const clean of ['scoreboard', 'bg-scoreboard', 'text-scored', 'highScore', 'score: 3', 'eyebrows',
    'text-status-running', '#ffb43d', 'var(--color-scoreboard)']) {
    assert.deepEqual(hit(clean), [], clean);
  }
});

test('in CSS the scanner flags uses of the amber and skips the token definitions', () => {
  const hit = (s: string) => amberUses('x.css', s).map((u) => u.replace(/^x\.css:\d+ /, ''));
  for (const css of ['a { color: var(--color-score); }', 'a { color: var(--color-score-ink) !important; }',
    'a { border-left: 4px solid var(--color-score) !important; }', 'a { color: #FFB43C; }', 'a { color: #8a5300; }',
    'a { background: rgba(255, 180, 60, 0.08); }', 'a { background: rgb(255,180,60); }',
    'a { background: rgba(255 , 180 , 60 / .1); }']) {
    assert.equal(hit(css).length, 1, css);
  }
  assert.deepEqual(hit('@theme {\n  --color-score: #ffb43c;\n  --color-score-ink: #8a5300;\n}\n.dark {\n  --color-score-ink: #ffb43c;\n}\n'), []);
  assert.deepEqual(amberUses('x.css', '@theme {\n  --color-score: #ffb43c;\n}\na { color: var(--color-score); }\n'), ['x.css:4 --color-score']);
  assert.deepEqual(hit('a { color: var(--color-scoreboard); --color-ring: #123456; }'), []);
});

test('the eyebrow utility is gone from the stylesheet', () => {
  const css = fs.readFileSync(path.join(frontendRoot, 'styles/globals.css'), 'utf8');
  assert.doesNotMatch(css, /@utility\s+eyebrow\b/);
});
