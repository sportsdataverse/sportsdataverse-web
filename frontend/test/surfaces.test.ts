import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement, type ComponentType } from 'react';
import ReactDOMServer from 'react-dom/server';
import ts from 'typescript';
import {
  arcCornerY,
  COURTS,
  courtPaths,
  ESPN_HOOP,
  normalizeShot,
  RINK,
  RINK_GOAL_Y,
  rinkPaths,
  type ShotSource,
} from '../lib/platform/viz/surfaces.ts';

type Row = Record<string, unknown>;
const fixture = (name: string): Row[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/shots/${name}.json`, import.meta.url), 'utf8')).data;

/** The share of `rows` whose normalized shot satisfies `ok`; a row that normalizes to null fails. */
const share = (source: ShotSource, rows: Row[], ok: (s: NonNullable<ReturnType<typeof normalizeShot>>, r: Row) => boolean) =>
  rows.filter((r) => {
    const s = normalizeShot(source, r);
    return s !== null && ok(s, r);
  }).length / rows.length;

test('stats.nba: (0, 0) is the hoop; (-220, 50) is a corner three 22.6 ft out', () => {
  const rim = normalizeShot('nba_stats', { x_legacy: 0, y_legacy: 0, shot_result: 'Made' });
  assert.deepEqual(rim, { x: 0, y: 0, made: true, dist: 0 });
  const corner = normalizeShot('nba_stats', { x_legacy: -220, y_legacy: 50, shot_result: 'Missed' })!;
  assert.deepEqual([corner.x, corner.y, corner.made], [-22, 5, false]);
  assert.ok(Math.abs(corner.dist - 22.6) < 0.1, `dist ${corner.dist}`);
  for (const f of ['nba_stats-0022500013', 'wnba_stats-1022600022'] as const) {
    const rows = fixture(f);
    const src = f.split('-')[0] as ShotSource;
    // ≥ 95%: the table's own integer shot_distance is 0 on four 23 ft corner threes (a stats.nba glitch).
    assert.ok(share(src, rows, (s, r) => Math.abs(s.dist - Number(r.shot_distance)) <= 1.5) >= 0.95, f);
    assert.equal(rows.filter((r) => normalizeShot(src, r)!.made).length, rows.filter((r) => r.shot_result === 'Made').length);
  }
});

test('NBA arc meets the corner line 8.95 ft above the hoop; FIBA courts 4.66', () => {
  assert.ok(Math.abs(arcCornerY(COURTS.nba) - 8.95) < 0.01);
  assert.ok(Math.abs(arcCornerY(COURTS.wnba) - 4.66) < 0.01);
  assert.ok(courtPaths(COURTS.nba).some((d) => d.includes(`L -22 ${arcCornerY(COURTS.nba)} A 23.75 23.75`)));
  assert.equal(courtPaths(COURTS.mbb).length, courtPaths(COURTS.nba).length);
});

test('ESPN hoops: ≥ 90% of made layups and dunks land within 5 ft of the hoop in every fixture', () => {
  for (const f of ['nba-401873201', 'wnba-401857215', 'mbb-401858379', 'wbb-401858323'] as const) {
    const src = f.split('-')[0] as ShotSource;
    const rows = fixture(f).filter((r) => r.scoring_play === true && /layup|dunk/i.test(String(r.type_text)));
    assert.ok(rows.length >= 10, `${f}: ${rows.length} made layups/dunks`);
    const rate = share(src, rows, (s) => s.dist < 5);
    assert.ok(rate >= 0.9, `${f}: ${(rate * 100).toFixed(1)}% within 5 ft of (${ESPN_HOOP.x}, ${ESPN_HOOP.y})`);
  }
  assert.equal(normalizeShot('nba', { type_text: 'Free Throw - 1 of 2', coordinate_x_raw: 25, coordinate_y_raw: 13.75, scoring_play: true }), null);
  assert.equal(normalizeShot('mbb', { type_text: 'MadeFreeThrow', coordinate_x_raw: 25, coordinate_y_raw: 13.75, scoring_play: true }), null);
});

test('NHL: GOAL rows sit in the attacking zone and every shot reproduces the table shot_distance', () => {
  const rows = fixture('nhl-2025020001');
  const goals = rows.filter((r) => r.event_type === 'GOAL');
  assert.ok(goals.length >= 5);
  // Real goals come from up to 30+ ft out, so the end is pinned by the zone (64 ft to the
  // blue line): the wrong end would put an away goal 150 ft away.
  assert.ok(share('nhl', goals, (s) => s.dist < RINK_GOAL_Y - RINK.blueLine) >= 0.9);
  assert.ok(goals.every((r) => normalizeShot('nhl', r)!.made));
  const shots = rows.filter((r) => ['GOAL', 'SHOT', 'MISSED_SHOT'].includes(String(r.event_type)) && r.x_fixed != null);
  assert.ok(shots.length >= 80);
  assert.equal(share('nhl', shots, (s, r) => Math.abs(s.dist - Number(r.shot_distance)) < 0.1), 1);
  assert.ok(shots.filter((r) => r.event_team_type === 'away').length >= 30, 'both ends are exercised');
  assert.ok(shots.every((r) => normalizeShot('nhl', r)!.y > -RINK.goalLine), 'every shot is on the ice');
  assert.ok(share('nhl', shots, (s) => s.y > 0) >= 0.95, 'in front of the goal line, bar the odd wraparound');
  assert.equal(normalizeShot('nhl', rows.find((r) => r.event_type === 'FACEOFF')!), null);
  assert.equal(normalizeShot('nhl', rows.find((r) => r.event_type === 'BLOCKED_SHOT')!), null);
  assert.equal(typeof normalizeShot('nhl', goals[0])!.xg, 'number');
});

test('PWHL: goal rows sit in the attacking zone and every shot reproduces the table shot_distance', () => {
  const rows = fixture('pwhl-235');
  const goals = rows.filter((r) => r.goal === true);
  assert.ok(goals.length >= 5);
  assert.ok(share('pwhl', goals, (s) => s.dist < RINK_GOAL_Y - RINK.blueLine) >= 0.9);
  assert.equal(share('pwhl', rows, (s, r) => Math.abs(s.dist - Number(r.shot_distance)) < 0.1), 1);
  assert.ok(rows.filter((r) => Number(r.x_coord) < 0).length >= 30, 'both ends are exercised');
  assert.ok(rows.every((r) => normalizeShot('pwhl', r)!.y > 0));
  assert.deepEqual(
    rows.map((r) => normalizeShot('pwhl', r)!.made),
    rows.map((r) => r.goal === true)
  );
});

test('unusable coordinates are null, never NaN', () => {
  assert.equal(normalizeShot('nba_stats', { x_legacy: null, y_legacy: 5, shot_result: 'Made' }), null);
  assert.equal(normalizeShot('wnba_stats', { x_legacy: 'abc', y_legacy: 5 }), null);
  assert.equal(normalizeShot('wbb', { type_text: 'LayUpShot', coordinate_x_raw: null, coordinate_y_raw: 2, scoring_play: true }), null);
  assert.equal(normalizeShot('nhl', { event_type: 'SHOT', event_team_type: 'home', x_fixed: null, y_fixed: 1 }), null);
  assert.equal(normalizeShot('nhl', { event_type: 'SHOT', x_fixed: 80, y_fixed: 1 }), null, 'no team side, no end');
  assert.equal(normalizeShot('pwhl', { x_coord: '', y_coord: 1, goal: false }), null);
  const s = normalizeShot('pwhl', { x_coord: '80', y_coord: '-2', goal: true, xg: null })!;
  assert.deepEqual(s, { x: -2, y: 9, made: true, dist: Math.hypot(2, 9) });
  assert.ok(!('xg' in s));
});

// --- Court / Rink markup --------------------------------------------------------------
// node --test strips types but cannot load .tsx, so the components are transpiled here
// with the project's TypeScript and imported as a data: URL; bare specifiers are
// rewritten to file URLs because a data: module cannot resolve them.

const require = createRequire(import.meta.url);
async function loadTsx<P>(rel: string, name: string): Promise<ComponentType<P>> {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const js = ts
    .transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
    .outputText.replace(/from "@lib\/([^"]+)"/g, (_, p: string) => `from "${new URL(`../lib/${p}.ts`, import.meta.url).href}"`)
    .replace(/from "react\/jsx-runtime"/g, `from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return mod[name];
}

const PATHS = /<path\b[^>]*>/g;

function assertBorderLinesOnly(markup: string, paths: number, label: string) {
  const shapes = markup.match(PATHS) ?? [];
  assert.equal(shapes.length, paths, `${label}: one <path> per surface line`);
  for (const el of shapes) {
    assert.match(el, /class="stroke-border"/, `${label}: ${el}`);
    assert.match(el, /fill="none"/, `${label}: ${el}`);
    assert.doesNotMatch(el, /\sstroke="/, `${label}: no stroke colour`);
    assert.match(el, /vector-effect="non-scaling-stroke"/, `${label}: ${el}`);
  }
  assert.doesNotMatch(markup, /(fill|stroke)-(chart|primary|destructive|foreground|muted|card|popover)|#[0-9a-f]{3,8}\b|rgb\(/i, `${label}: no colours`);
  assert.doesNotMatch(markup, /fill="(?!none")/, `${label}: no fill colours`);
}

test('Court and Rink render stroke-border paths only, from one feet→px scale, children in feet', async () => {
  const Court = await loadTsx<{ court: string; scale?: number; children?: unknown }>('../components/platform/viz/Court.tsx', 'Court');
  for (const court of Object.keys(COURTS)) {
    const html = ReactDOMServer.renderToStaticMarkup(createElement(Court, { court }));
    assertBorderLinesOnly(html, courtPaths(COURTS.nba).length, court);
    assert.match(html, /viewBox="-1 -1 402 378"/);
    assert.match(html, /transform="scale\(8\) translate\(25 5\.25\)"/);
  }
  const Rink = await loadTsx<{ scale?: number; children?: unknown }>('../components/platform/viz/Rink.tsx', 'Rink');
  const rink = ReactDOMServer.renderToStaticMarkup(createElement(Rink, { scale: 5 }, createElement('circle', { cx: 0, cy: 10, r: 1 })));
  assertBorderLinesOnly(rink, rinkPaths().length, 'rink');
  assert.match(rink, /viewBox="-1 -1 427 502"/);
  assert.match(rink, /<circle cx="0" cy="10" r="1"><\/circle><\/g><\/svg>$/, 'children plot inside the feet frame');
});
