import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  arcCornerY,
  courtFrame,
  COURTS,
  courtPaths,
  ESPN_HOOP,
  normalizeShot,
  RINK,
  RINK_GOAL_Y,
  rinkFrame,
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

const NHL_SHOT = (r: Row) => ['GOAL', 'SHOT', 'MISSED_SHOT'].includes(String(r.event_type)) && r.x_fixed != null;

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
  const shots = rows.filter(NHL_SHOT);
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
  // Pins the 89 ft goal and the y convention; the table's distance is to the nearer goal
  // too, so this cannot tell which end a shot from behind centre ice attacks.
  assert.equal(share('pwhl', rows, (s, r) => Math.abs(s.dist - Number(r.shot_distance)) < 0.1), 1);
  assert.ok(rows.filter((r) => Number(r.x_coord) < 0).length >= 30, 'both ends are exercised');
  assert.ok(rows.every((r) => normalizeShot('pwhl', r)!.y > 0));
  assert.deepEqual(
    rows.map((r) => normalizeShot('pwhl', r)!.made),
    rows.map((r) => r.goal === true)
  );
});

test('hockey handedness: x = +y_fixed at the home end, −y_fixed at the away end (a half turn); PWHL by the sign of x', () => {
  const nine = { y: 9, dist: Math.hypot(10, 9) };
  assert.deepEqual(normalizeShot('nhl', { event_type: 'SHOT', event_team_type: 'home', x_fixed: 80, y_fixed: 10 }), { x: 10, made: false, ...nine });
  assert.deepEqual(normalizeShot('nhl', { event_type: 'GOAL', event_team_type: 'away', x_fixed: -80, y_fixed: 10 }), { x: -10, made: true, ...nine });
  assert.deepEqual(normalizeShot('pwhl', { x_coord: 80, y_coord: 10, goal: false }), { x: 10, made: false, ...nine });
  assert.deepEqual(normalizeShot('pwhl', { x_coord: -80, y_coord: 10, goal: true }), { x: -10, made: true, ...nine });
  // and on every real row: the lateral coordinate is y_fixed signed by the end
  const shots = fixture('nhl-2025020001').filter(NHL_SHOT);
  assert.ok(shots.every((r) => normalizeShot('nhl', r)!.x === (r.event_team_type === 'home' ? 1 : -1) * Number(r.y_fixed)));
  const pwhl = fixture('pwhl-235');
  assert.ok(pwhl.every((r) => normalizeShot('pwhl', r)!.x === Math.sign(Number(r.x_coord)) * Number(r.y_coord)));
  // PWHL near centre ice folds to the nearer goal; x = 0 counts as attacking +x.
  assert.deepEqual(normalizeShot('pwhl', { x_coord: 0, y_coord: 3, goal: false }), { x: 3, y: 89, made: false, dist: Math.hypot(3, 89) });
  assert.deepEqual(normalizeShot('pwhl', { x_coord: 0.5, y_coord: 3, goal: false }), { x: 3, y: 88.5, made: false, dist: Math.hypot(3, 88.5) });
  assert.deepEqual(normalizeShot('pwhl', { x_coord: -0.5, y_coord: 3, goal: false }), { x: -3, y: 88.5, made: false, dist: Math.hypot(3, 88.5) });
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

// --- Court / Rink -----------------------------------------------------------------

test('courtFrame and rinkFrame: one feet→px scale, 1 px of slack, the hoop or goal at the origin', () => {
  assert.deepEqual(courtFrame('nba', 8), { viewBox: '-1 -1 402 378', transform: 'scale(8) translate(25 5.25)', paths: courtPaths(COURTS.nba) });
  assert.equal(courtFrame('mbb').viewBox, '-1 -1 402 378');
  assert.deepEqual(courtFrame('wbb', 2).paths, courtPaths(COURTS.wbb));
  assert.deepEqual(rinkFrame(5), { viewBox: '-1 -1 427 502', transform: 'scale(5) translate(42.5 11)', paths: rinkPaths() });
  assert.equal(rinkFrame().viewBox, '-1 -1 342 402');
});

/** Every JSX element in a component source: its tag and attributes (a string literal's text, else the source). */
function jsxElements(rel: string) {
  const text = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { tag: string; attrs: Map<string, string>; spread: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const attrs = new Map<string, string>();
      let spread = false;
      for (const a of n.attributes.properties) {
        if (ts.isJsxSpreadAttribute(a)) spread = true;
        else attrs.set(a.name.getText(sf), a.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : (a.initializer?.getText(sf) ?? ''));
      }
      out.push({ tag: n.tagName.getText(sf), attrs, spread });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { text, elements: out };
}

test('Court.tsx and Rink.tsx draw stroke-border paths only: no fill, no stroke colour, no colour at all', () => {
  for (const rel of ['../components/platform/viz/Court.tsx', '../components/platform/viz/Rink.tsx']) {
    const { text, elements } = jsxElements(rel);
    assert.deepEqual(
      elements.map((e) => e.tag),
      ['svg', 'g', 'path'],
      `${rel}: one svg, one g, one path (mapped over the frame's lines)`
    );
    const path = elements[2].attrs;
    assert.equal(path.get('className'), 'stroke-border', rel);
    assert.equal(path.get('fill'), 'none', rel);
    assert.equal(path.get('vectorEffect'), 'non-scaling-stroke', rel);
    for (const e of elements) {
      assert.ok(!e.spread, `${rel}: <${e.tag}> spreads attributes`);
      for (const name of ['stroke', 'style', 'color', 'opacity', 'strokeWidth']) assert.ok(!e.attrs.has(name), `${rel}: <${e.tag} ${name}>`);
      if (e.tag !== 'path') assert.ok(!e.attrs.has('fill'), `${rel}: <${e.tag} fill>`);
      if (e.tag !== 'svg') assert.ok(!e.attrs.has('className') || e.attrs.get('className') === 'stroke-border', `${rel}: <${e.tag}> className`);
    }
    assert.doesNotMatch(text, /(fill|stroke|bg|text)-(chart|primary|destructive|foreground|muted|card|popover|accent|secondary)/, `${rel}: colour token`);
    assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${rel}: literal colour`);
  }
});
