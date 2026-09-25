import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the thing that actually matters: every READ of the `packages`
// collection must use PUBLIC_PACKAGE_FILTER, or a stranger's unapproved
// submission reaches a public page. Reverting a reader to `find({})` passes
// tsc, lint and build with no other signal — this is the test that catches it.
//
// It checks each STATEMENT, not each file: from every `collection("packages")`
// to the `;` that ends it, a statement that reads must carry the filter. A file
// that already uses the filter once cannot hide a second, unfiltered read, and a
// write-only statement passes on its own — so a write path needs no exemption,
// and is caught the moment it starts reading.
//
// Known limit: a collection reached through a variable
// (`const c = db.collection("packages"); … c.find({})`) is invisible to a text
// scan. Keep `collection("packages")` and the read in one statement.
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/

// Everything that ships, whatever directory or extension it lives in: no list of
// directories to fall out of date. Tests, build output and dependencies are not served.
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'coverage', 'public', 'test']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// The only file allowed to read unfiltered, and why: the member CMS must see
// every document, including unapproved submissions, to review them.
const ALLOWLIST = new Set(['app/(site)/packages/manage/page.tsx']);

const COLLECTION = /collection\(\s*["']packages["']\s*\)/g;
const READ = /\.(find|findOne|findOneAndUpdate|findOneAndDelete|findOneAndReplace|countDocuments|estimatedDocumentCount|aggregate|distinct|watch)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

/** `file:line` for every statement that reads `packages` without the filter. */
export function unfilteredReads(rel: string, text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(COLLECTION)) {
    const start = m.index ?? 0;
    const end = text.indexOf(';', start);
    const statement = text.slice(start, end === -1 ? undefined : end);
    if (READ.test(statement) && !statement.includes('PUBLIC_PACKAGE_FILTER')) {
      found.push(`${rel}:${text.slice(0, start).split('\n').length}`);
    }
  }
  return found;
}

test('every read of the packages collection uses PUBLIC_PACKAGE_FILTER, except the member CMS', () => {
  const offenders: string[] = [];
  for (const file of walk(frontendRoot)) {
    const rel = path.relative(frontendRoot, file).split(path.sep).join('/');
    if (ALLOWLIST.has(rel)) continue;
    offenders.push(...unfilteredReads(rel, fs.readFileSync(file, 'utf8')));
  }
  assert.deepEqual(offenders, [], `reads packages without PUBLIC_PACKAGE_FILTER: ${offenders.join(', ')}`);
});

test('the scanner judges each statement, not each file', () => {
  // a file that already uses the filter once must not hide a second, bare read
  const mixed = [
    'const a = await db.collection("packages").find(PUBLIC_PACKAGE_FILTER).toArray();',
    'const b = await db.collection("packages").find({}).toArray();',
  ].join('\n');
  assert.deepEqual(unfilteredReads('x.ts', mixed), ['x.ts:2']);

  // writes pass on their own; a multi-line chain is one statement
  const writes = 'await db.collection("packages").insertOne(doc);\nawait db.collection("packages").updateOne({ _id }, { $set: s });';
  assert.deepEqual(unfilteredReads('w.ts', writes), []);
  const chain = 'const p = await db\n  .collection("packages")\n  .find(PUBLIC_PACKAGE_FILTER)\n  .toArray();';
  assert.deepEqual(unfilteredReads('c.ts', chain), []);

  // the read-and-write methods count as reads: they return documents
  assert.deepEqual(unfilteredReads('f.ts', 'await db.collection("packages").findOneAndUpdate({ _id }, u);'), ['f.ts:1']);
});
