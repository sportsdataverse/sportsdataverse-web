import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the thing that actually matters: every reader of the `packages`
// collection must be wired to PUBLIC_PACKAGE_FILTER. Reverting a reader to
// `find({})` / `countDocuments({})` passes tsc/lint/build with no other
// signal — this test is the one that would catch it (see task-1-review.md,
// Important finding 3 / the Ticker miss).
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/
const SCAN_DIRS = ['app', 'lib', 'components'];

const ALLOWLIST = new Set([
  // The member CMS: it must see every document, including unapproved
  // submissions, so it deliberately reads `packages` unfiltered.
  'app/(site)/packages/manage/page.tsx',
]);

// Files allowlisted because they only WRITE. If one of them ever gains a read,
// the allowlist would silently exempt that read from the filter forever — so
// assert they stay write-only. (The member CMS above reads on purpose.)
const WRITE_ONLY = new Set([
  // Task 2's submission insert. Same category as the writes in
  // app/api/packages/route.ts, which needs no entry only because that file
  // also holds the filtered GET.
  'lib/packageSubmission.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every packages-collection reader is wired to PUBLIC_PACKAGE_FILTER, except the allowlisted member CMS', () => {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(frontendRoot, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(frontendRoot, file).split(path.sep).join('/');
      const text = fs.readFileSync(file, 'utf8');
      if (!/collection\(\s*["']packages["']\s*\)/.test(text)) continue;
      if (WRITE_ONLY.has(rel)) {
        // a write-only file that gains a read is a new, unfiltered public reader
        if (/\.(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)\(/.test(text)) offenders.push(`${rel} (allowlisted as write-only, but reads)`);
        continue;
      }
      if (ALLOWLIST.has(rel)) continue;
      if (!text.includes('PUBLIC_PACKAGE_FILTER')) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `reads the packages collection without PUBLIC_PACKAGE_FILTER: ${offenders.join(', ')}`
  );
});
