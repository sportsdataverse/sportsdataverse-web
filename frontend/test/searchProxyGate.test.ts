import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The ⌘K search proxies (P12) front the Data API's /v1/search and the
// sportsdataverse-data release listing with the platform's server-side keys,
// so both are org-member only. A route-level test cannot load them — node
// --test cannot load anything that imports next-auth — so this is a source
// scan, in the style of test/personDataReaders.test.ts: each route must call
// requireMemberApp() and return its deny BEFORE it reads upstream.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROUTES: { rel: string; upstream: RegExp }[] = [
  { rel: 'app/api/platform/search/route.ts', upstream: /\bdataApi\s*\(/ },
  { rel: 'app/api/platform/datasets/tags/route.ts', upstream: /\blistRepoReleases\s*\(/ },
];

const GATE = /const \{ deny \} = await requireMemberApp\(\);\s*if \(deny\) return deny;/;

for (const { rel, upstream } of ROUTES) {
  test(`${rel} is member-gated before it reads upstream`, () => {
    const text = fs.readFileSync(path.join(frontendRoot, rel), 'utf8');
    const gate = text.search(GATE);
    assert.notEqual(gate, -1, `${rel} must call requireMemberApp() and return its deny`);
    const read = text.search(upstream);
    assert.notEqual(read, -1, `${rel} must read upstream with ${upstream}`);
    assert.ok(gate < read, `${rel} must gate (${gate}) before the upstream read (${read})`);
  });
}

test('the search proxy trims q to the Data API cap of 64 characters', () => {
  const text = fs.readFileSync(path.join(frontendRoot, 'app/api/platform/search/route.ts'), 'utf8');
  assert.match(text, /\.slice\(0,\s*64\)/, 'q must be trimmed to 64 characters (the Data API 400s longer) before it reaches the Data API');
});
