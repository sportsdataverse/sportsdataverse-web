import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards CLAUDE.md's rule: "a person's location, answers and `responses` are
// never shown to non-admin members. ... Full per-person browsing ... is
// admin-only." A route-level test cannot check this: node --test cannot load
// anything that imports next-auth, and every route under app/api/platform
// does. So this is a source scan, in the style of
// test/stickerAddressReaders.test.ts (same file-walking approach, reused
// below).
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'coverage', 'public', 'test']);
const SOURCE = /\.(ts|tsx)$/;
// Everything that ships: app (routes + pages), lib (the person-data logic),
// components (the admin client). No content/data dirs — they hold no logic.
const SCAN_ROOTS = ['app', 'lib', 'components'];
const COMMUNITY_ADMIN_DIR = 'app/api/platform/admin/community';

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

function relOf(file: string): string {
  return path.relative(frontendRoot, file).split(path.sep).join('/');
}

function sourceFiles(): { rel: string; text: string }[] {
  const files: { rel: string; text: string }[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(path.join(frontendRoot, root))) {
      files.push({ rel: relOf(file), text: fs.readFileSync(file, 'utf8') });
    }
  }
  return files;
}

// A quoted string literal only — not a comment or a prose mention.
const RESPONSES_COLLECTION_LITERAL = /(["'])responses\1/;

// An import specifier ending in the given module name (relative, with or
// without the ".ts" extension the repo's tests use, or the "@lib/*" alias).
const importsModule = (text: string, moduleName: string): boolean =>
  new RegExp(`\\bfrom\\s+["'][^"']*/${moduleName}(?:\\.ts)?["']`).test(text);

const REQUIRE_MEMBER_APP = /\brequireMemberApp\b/;
const REQUIRE_ADMIN_APP_CALL = /requireAdminApp\s*\(/;

test('person data is admin-only: "responses" is named as a collection only in lib/responses.ts and lib/communityData.ts', () => {
  const ALLOWED = new Set(['lib/responses.ts', 'lib/communityData.ts']);
  const offenders: string[] = [];
  for (const { rel, text } of sourceFiles()) {
    if (ALLOWED.has(rel)) continue;
    if (RESPONSES_COLLECTION_LITERAL.test(text)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `the response history is admin-only: the "responses" collection name must be named only in lib/responses.ts and lib/communityData.ts, found in: ${offenders.join(', ')}`
  );
});

test('person data is admin-only: lib/communityData is imported only by files under app/api/platform/admin/community/', () => {
  const offenders: string[] = [];
  for (const { rel, text } of sourceFiles()) {
    if (rel.startsWith(`${COMMUNITY_ADMIN_DIR}/`)) continue;
    if (importsModule(text, 'communityData')) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `person data leaves the database only through admin routes: lib/communityData must be imported only by files under ${COMMUNITY_ADMIN_DIR}/, found in: ${offenders.join(', ')}`
  );
});

test('person data is admin-only: every community admin route.ts requires the admin role, never the member role', () => {
  const routeFiles = walk(path.join(frontendRoot, COMMUNITY_ADMIN_DIR)).filter((f) => path.basename(f) === 'route.ts');
  for (const file of routeFiles) {
    const rel = relOf(file);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, REQUIRE_ADMIN_APP_CALL, `the Community browser is admin-only: ${rel} must call requireAdminApp()`);
    assert.doesNotMatch(text, REQUIRE_MEMBER_APP, `the Community browser is admin-only: ${rel} must not import or call requireMemberApp — that would open person data to any org member`);
  }
});

test('person data is admin-only: no file that mentions requireMemberApp imports lib/communityData or lib/community', () => {
  const offenders: string[] = [];
  for (const { rel, text } of sourceFiles()) {
    if (!REQUIRE_MEMBER_APP.test(text)) continue;
    if (importsModule(text, 'communityData') || importsModule(text, 'community')) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `person data is admin-only: a file that uses requireMemberApp must not import lib/communityData or lib/community, found in: ${offenders.join(', ')}`
  );
});
