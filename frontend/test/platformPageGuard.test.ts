import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the /platform page-data leak found on 2026-09-29. The platform layout
// shows <SignInGate/> to anyone who is not an org member, but App Router
// renders a layout and its page in parallel and ships the page's output in the
// RSC payload even when the layout never displays it. Signed-out visitors were
// getting the DB inventory, the Data API schema list and the release listing.
// So every async page must await requireOrgMember() (lib/platform/auth.ts)
// FIRST, before any read, and return null without a member. node --test cannot
// load next-auth, so this is a source scan, in the style of
// test/personDataReaders.test.ts.
//
// Known limits (a text scan, not a parser):
// - only the default export's first `await` is checked. A read that is never
//   awaited (a sync page, or a promise handed to a child) is invisible, and so
//   is an async server component a page renders. Every component under
//   app/(platform) is a client component today: keep it that way, or guard it.
// - the default export must be written `export default [async] function`, or
//   the scan cannot find it; any other form fails the test.
// - pages under /platform/admin need the admin role for any server read, which
//   the org-member guard alone does not give. None of them reads server-side
//   today (their data comes through admin API routes).
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..'); // test/ -> frontend/
const PLATFORM_DIR = path.join(frontendRoot, 'app', '(platform)');

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(full, out);
    else if (entry.name === 'page.tsx') out.push(full);
  }
  return out;
}

const relOf = (file: string): string => path.relative(frontendRoot, file).split(path.sep).join('/');

const GUARD_IMPORT = /import\s*\{[^}]*\brequireOrgMember\b[^}]*\}\s*from\s*["']@lib\/platform\/auth["']/;

/** Why a page.tsx source is unguarded, or null when it is guarded (or sync). */
export function guardProblem(source: string): string | null {
  if (/export\s+default\s+function\b/.test(source)) return null; // sync: it cannot await a read
  const def = /export\s+default\s+async\s+function\b/.exec(source);
  if (!def) return 'write the default export as `export default async function` so this scan can check it';
  const body = source.slice(def.index);
  const first = /\bawait\b[\s(]*([\w$.]+)/.exec(body);
  if (!first) return null; // async but awaits nothing
  if (first[1] !== 'requireOrgMember') {
    return `its first await is \`${first[1]}\`: await requireOrgMember() before it`;
  }
  const ret = /\breturn\b\s*([^;\n]*)/.exec(body.slice(first.index));
  if (!ret || !/^null\b/.test(ret[1])) {
    return 'the first return after requireOrgMember() must be `return null` (the non-member branch)';
  }
  if (!GUARD_IMPORT.test(source)) return 'requireOrgMember must be imported from @lib/platform/auth';
  return null;
}

test('every async /platform page awaits requireOrgMember() first and returns null without a member', () => {
  const offenders: string[] = [];
  for (const file of pageFiles(PLATFORM_DIR)) {
    const problem = guardProblem(fs.readFileSync(file, 'utf8'));
    if (problem) offenders.push(`${relOf(file)}: ${problem}`);
  }
  assert.deepEqual(offenders, [], `a /platform page's server reads reach signed-out visitors through the RSC payload:\n${offenders.join('\n')}`);
});

test('the scan reaches the pages that leaked, and sees them as async', () => {
  const rels = new Set(pageFiles(PLATFORM_DIR).map(relOf));
  for (const name of ['database', 'query', 'datasets', 'explore']) {
    const rel = `app/(platform)/platform/${name}/page.tsx`;
    assert.ok(rels.has(rel), `${rel} is missing from the scan`);
    assert.match(fs.readFileSync(path.join(frontendRoot, rel), 'utf8'), /export\s+default\s+async\s+function/);
  }
});

test('guardProblem: guarded forms pass, an unguarded or late guard fails', () => {
  const imp = 'import { requireOrgMember } from "@lib/platform/auth";\n';
  const ok = (body: string) => guardProblem(`${imp}export default async function P() {\n${body}\n}`);
  assert.equal(ok('  if (!(await requireOrgMember())) return null;\n  const x = await listRuns();\n  return x;'), null);
  assert.equal(ok('  const session = await requireOrgMember();\n  if (!session) return null;\n  return session.role;'), null);
  assert.equal(guardProblem('export default function P() {\n  return 1;\n}'), null);
  assert.match(ok('  const x = await listRuns();\n  return x;') ?? '', /first await is `listRuns`/);
  assert.match(ok('  const sp = await searchParams;\n  if (!(await requireOrgMember())) return null;') ?? '', /first await is `searchParams`/);
  assert.match(ok('  await requireOrgMember();\n  return await listRuns();') ?? '', /return null/);
  assert.match(guardProblem('export default async function P() {\n  if (!(await requireOrgMember())) return null;\n}') ?? '', /imported/);
  assert.match(guardProblem('const P = async () => null;\nexport default P;') ?? '', /export default async function/);
});
