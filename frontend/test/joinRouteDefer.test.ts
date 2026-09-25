import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// app/api/join/route.ts imports `next-auth` (via @lib/auth), which `node --test`
// cannot load outside the Next build pipeline (see CLAUDE.md's node --test
// gotcha) — so, like test/packageVisibilityReaders.test.ts guards a reader it
// can't load either, this scans the route's source text instead of importing
// it, to guard the one thing that actually matters here: the route passes
// JoinDeps.defer, wired to Next's after(), so /join's Resend calls run after
// the response is sent rather than before it (lib/join.ts's own tests cover
// the behavior once `defer` is supplied; this covers that the live route
// supplies it at all).
const here = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(here, '..', 'app/api/join/route.ts');

test('the /join route imports after() from next/server and wires it as JoinDeps.defer', () => {
  const src = fs.readFileSync(routePath, 'utf8');
  assert.match(
    src,
    /import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*["']next\/server["']/,
    'after must be imported from next/server'
  );
  const start = src.indexOf('handleJoin(');
  assert.notEqual(start, -1, 'the route must call handleJoin');
  const end = src.indexOf('});', start);
  assert.notEqual(end, -1, "the handleJoin(...) call must close with '});'");
  const call = src.slice(start, end);
  assert.match(
    call,
    /defer:\s*\(\s*\w+\s*\)\s*=>\s*after\(\s*\w+\s*\)/,
    'the deps object passed to handleJoin must set defer to a function that calls after(...) with the same task'
  );
});
