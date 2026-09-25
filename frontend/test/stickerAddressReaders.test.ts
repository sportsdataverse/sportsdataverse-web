import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards CLAUDE.md's rule: "a postal address is read only by
// listOpenStickerRequests (frontend/lib/stickers.ts), whose only caller is the
// admin sticker route — never add another reader, and never put an address on
// people." A route-level test cannot check this: node --test cannot load
// anything that imports next-auth, and every route under app/api/platform
// does. So this is a source scan, in the style of
// test/packageVisibilityReaders.test.ts (same file-walking approach, reused
// below) — the regression it guards against is concrete: the binding spec's
// own route table once listed Stickers as a member-level tab under
// `/platform/people` (`requireWriter()`, any member), which is exactly the
// change that would show every open address to every org member. That change
// passes tsc, lint, build and test:lib today with no other signal.
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'coverage', 'public', 'test']);
const SOURCE = /\.(ts|tsx)$/;
// Everything that ships: app (routes + pages), lib (the address-bearing logic),
// components (the admin client). No content/data dirs — they hold no logic.
const SCAN_ROOTS = ['app', 'lib', 'components'];

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

// A quoted string literal only — not a comment or a prose mention of the
// collection name (lib/joinSchema.ts's doc comment mentions it unquoted).
const COLLECTION_LITERAL = /(["'])sticker_requests\1/;
const READER_FN = /\blistOpenStickerRequests\b/;

test('addresses are admin-only: "sticker_requests" is named only in lib/stickers.ts', () => {
  const offenders: string[] = [];
  for (const { rel, text } of sourceFiles()) {
    if (rel === 'lib/stickers.ts') continue;
    if (COLLECTION_LITERAL.test(text)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `addresses are admin-only: the "sticker_requests" collection name must be named only in lib/stickers.ts, found in: ${offenders.join(', ')}`
  );
});

test('addresses are admin-only: listOpenStickerRequests is used only by lib/stickers.ts and the admin sticker route', () => {
  const ALLOWED = new Set(['lib/stickers.ts', 'app/api/platform/admin/stickers/route.ts']);
  const offenders: string[] = [];
  for (const { rel, text } of sourceFiles()) {
    if (ALLOWED.has(rel)) continue;
    if (READER_FN.test(text)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `addresses are admin-only: listOpenStickerRequests must be used only by lib/stickers.ts (its definition) and the admin sticker route, found in: ${offenders.join(', ')}`
  );
});

test('addresses are admin-only: both sticker admin route files require the admin role, never the member role', () => {
  const ROUTE_FILES = [
    'app/api/platform/admin/stickers/route.ts',
    'app/api/platform/admin/stickers/[id]/[action]/route.ts',
  ];
  for (const rel of ROUTE_FILES) {
    const full = path.join(frontendRoot, rel);
    assert.ok(fs.existsSync(full), `addresses are admin-only: expected admin sticker route file at ${rel}`);
    const text = fs.readFileSync(full, 'utf8');
    assert.match(text, /requireAdminApp\s*\(/, `addresses are admin-only: ${rel} must call requireAdminApp()`);
    assert.doesNotMatch(text, /requireMemberApp/, `addresses are admin-only: ${rel} must not import or call requireMemberApp — that would open addresses to any org member`);
  }
});

test('addresses are admin-only: no sticker file lives under the member-level people routes', () => {
  const FORBIDDEN_DIRS = ['app/(platform)/platform/people', 'app/api/platform/people'];
  const offenders: string[] = [];
  for (const dir of FORBIDDEN_DIRS) {
    for (const file of walk(path.join(frontendRoot, dir))) {
      if (/sticker/i.test(path.basename(file))) offenders.push(relOf(file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `addresses are admin-only: no *sticker* file may live under the member-level people routes (they are not admin-gated), found: ${offenders.join(', ')}`
  );
});
