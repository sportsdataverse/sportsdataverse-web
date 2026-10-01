import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCATTER_SOURCES } from '../content/scatter.ts';
import { CELL, FACE, espnIds, idText, joinOnStringId, roundAtlas, spriteEntries, spriteLeague } from '../lib/platform/viz/sprites.ts';

const src = (schema: string, table: string) => SCATTER_SOURCES.find((s) => s.schema === schema && s.table === table)!;
const XWALK = [
  { key: '1629029', value: '3945274' },
  { key: '2544', value: '1966' },
  { key: '2544', value: 'dup-ignored' },
];

test('joinOnStringId matches a number id to its string key, leaves unmatched rows null, and throws on an object id', () => {
  assert.deepEqual(joinOnStringId([{ player_id: 1629029 }, { player_id: '2544' }, { player_id: 7 }, { player_id: null }], 'player_id', XWALK), [
    '3945274',
    '1966',
    null,
    null,
  ]);
  assert.throws(() => joinOnStringId([{ player_id: { id: 1 } }], 'player_id', XWALK), TypeError);
  assert.throws(() => joinOnStringId([{ player_id: [1] }], 'player_id', XWALK), TypeError);
});

test('idText: strings, numbers and bigints as text; null/undefined → null; "__proto__" is a plain key', () => {
  assert.equal(idText(5216796), '5216796');
  assert.equal(idText(5216796n), '5216796');
  assert.equal(idText('333'), '333');
  assert.equal(idText(null), null);
  assert.equal(idText(undefined), null);
  assert.throws(() => idText(true), TypeError);
  assert.deepEqual(joinOnStringId([{ id: '__proto__' }], 'id', [{ key: '__proto__', value: 'x' }]), ['x']);
});

test('espnIds: an ESPN-keyed source uses its own ids; a crosswalk source bridges through the crosswalk', () => {
  assert.deepEqual(espnIds(src('cfb', 'passing'), [{ player_id: 4880281 }, { player_id: null }], 'player_id', null), ['4880281', null]);
  assert.deepEqual(espnIds(src('nba', 'player_impact'), [{ player_id: 2544 }, { player_id: 1 }], 'player_id', XWALK), ['1966', null]);
  // the bridge is never skipped for a crosswalk source: no crosswalk rows → no ids
  assert.deepEqual(espnIds(src('nba_stats', 'player_season_stats'), [{ player_id: 2544 }], 'player_id', null), [null]);
});

test('every source that bridges names its crosswalk; nba_stats shares nba\'s', () => {
  assert.deepEqual(src('nba', 'player_impact').xwalk, { schema: 'nba', key: 'nba_player_id' });
  assert.deepEqual(src('nba_stats', 'player_season_stats').xwalk, { schema: 'nba', key: 'nba_player_id' });
  assert.deepEqual(src('wnba', 'player_impact').xwalk, { schema: 'wnba', key: 'wnba_player_id' });
  for (const s of SCATTER_SOURCES) if (!s.xwalk) assert.ok(spriteLeague(s.schema), `${s.schema}.${s.table}: no sprite league`);
  assert.equal(spriteLeague('nba_stats'), 'nba');
  assert.equal(spriteLeague('pg_catalog'), null);
});

test('spriteEntries: one combiner-sized headshot per distinct id for players, a light or dark logo for teams', () => {
  assert.equal(CELL, 48);
  assert.equal(FACE, 22);
  assert.deepEqual(spriteEntries(src('cfb', 'passing'), ['4880281', null, '4880281', '5216796'], false), [
    { id: '4880281', src: 'https://a.espncdn.com/combiner/i?img=/i/headshots/college-football/players/full/4880281.png&w=48&h=48' },
    { id: '5216796', src: 'https://a.espncdn.com/combiner/i?img=/i/headshots/college-football/players/full/5216796.png&w=48&h=48' },
  ]);
  assert.deepEqual(spriteEntries(src('nba_stats', 'player_season_stats'), ['1966'], true), [
    { id: '1966', src: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/1966.png&w=48&h=48' },
  ]);
  assert.deepEqual(spriteEntries(src('cfb', 'ratings'), ['130'], false), [
    { id: '130', src: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/130.png&w=48&h=48' },
  ]);
  assert.deepEqual(spriteEntries(src('mbb', 'ratings'), ['130'], true), [
    { id: '130', src: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500-dark/130.png&w=48&h=48' },
  ]);
});

test('roundAtlas: every frame once as a d-px circle on a grid scaled from the cell to d', () => {
  const calls: { op: string; args: unknown[] }[] = [];
  const ctx = new Proxy({}, { get: (_, k) => (...args: unknown[]) => calls.push({ op: String(k), args }) });
  const made: { width?: number; height?: number; getContext: () => unknown }[] = [];
  const doc = { createElement: () => { const c = { getContext: () => ctx }; made.push(c); return c; } };
  (globalThis as { document?: unknown }).document = doc;
  try {
    const atlas = { canvas: { width: 96, height: 48 } as HTMLCanvasElement, frames: { a: { x: 0, y: 0, w: 48, h: 48 }, b: { x: 48, y: 0, w: 48, h: 48 } } };
    const round = roundAtlas(atlas, 44);
    assert.deepEqual(round.frames, { a: { x: 0, y: 0, w: 44, h: 44 }, b: { x: 44, y: 0, w: 44, h: 44 } });
    assert.equal(made.length, 1);
    assert.deepEqual([made[0].width, made[0].height], [88, 44]);
    const draws = calls.filter((c) => c.op === 'drawImage');
    assert.equal(draws.length, 2);
    assert.equal(calls.filter((c) => c.op === 'clip').length, 2);
    // b: the source cell (48,0,48,48) cover-fit into its 44 px circle's box at (44,0)
    assert.deepEqual(draws[1].args, [atlas.canvas, 48, 0, 48, 48, 44, 0, 44, 44]);
    assert.deepEqual(calls.filter((c) => c.op === 'arc')[1].args, [66, 22, 22, 0, Math.PI * 2]);
  } finally {
    delete (globalThis as { document?: unknown }).document;
  }
});
