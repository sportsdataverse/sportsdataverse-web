import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLLING } from '../content/rolling.ts';
import {
  activeSince,
  cardParams,
  deltaTone,
  formatUnits,
  movers,
  windowLabel,
  type RollingRow,
} from '../lib/platform/rolling.ts';
import { parseRollingView, rollingHref, rollingViewParams } from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('activeSince counts back from the as-of date, across a month', () => {
  assert.equal(activeSince('2026-09-26'), '2026-09-12');
  assert.equal(activeSince('2026-03-05', 7), '2026-02-26');
});

test('deltaTone greys a move under the noise threshold and colours one at or above it', () => {
  assert.equal(deltaTone(0.004, 0.01), 'text-muted-foreground');
  assert.equal(deltaTone(0.05, 0.01), 'text-status-success-ink dark:text-status-success');
  assert.equal(deltaTone(-0.05, 0.01), 'text-status-failed-ink dark:text-status-failed');
  assert.equal(deltaTone(-0.01, 0.01), 'text-status-failed-ink dark:text-status-failed');
});

test('formatUnits names the unit: EPA, or percentage points for a rate', () => {
  assert.equal(formatUnits(0.123, 'epa'), '+0.12 EPA');
  assert.equal(formatUnits(0.031, 'pct'), '+3.1 pp');
});

test('windowLabel pluralizes the unit', () => {
  assert.equal(windowLabel(100, 'dropback'), '100 dropbacks');
  assert.equal(windowLabel(50, 'carry'), '50 carries');
});

test('a card query filters the unit and full windows; active adds the date floor', () => {
  const m = ROLLING.cfb[0];
  const p = cardParams('cfb', m, 300, '2026', '2026-09-12', '-delta_prev', 5); // not windows[0]
  assert.deepEqual(
    [p.schema, p.table, p.season, p.metric, p.window_unit, p.window_n, p.entity_type, p.qualified, p.last_event_date__gte, p.order, p.limit],
    ['cfb', 'rolling_windows', '2026', m.metric, m.unit, '300', m.entity, 'true', '2026-09-12', '-delta_prev', '5']
  );
  assert.equal('last_event_date__gte' in cardParams('cfb', m, 50, '2026', null, 'cur', 3), false);
});

test('every configured entry has a noise threshold for exactly its windows', () => {
  for (const [league, entries] of Object.entries(ROLLING)) {
    for (const e of entries) {
      assert.deepEqual(Object.keys(e.noise).map(Number), e.windows, `${league} ${e.metric}/${e.unit}`);
      for (const v of Object.values(e.noise)) assert.ok(v > 0, `${league} ${e.metric}/${e.unit} noise ${v}`);
    }
  }
});

test('movers drops null deltas, never lists an entity twice, and ends on the biggest faller', () => {
  const row = (entity_id: string, delta_prev: number | null) => ({ entity_id, delta_prev }) as RollingRow;
  const { top, bottom } = movers(
    [row('a', 0.5), row('b', 0.2), row('c', null)],
    [row('d', -0.6), row('f', -0.4), row('b', 0.2), row('e', null)]
  );
  assert.deepEqual(top.map((r) => r.entity_id), ['a', 'b']);
  assert.deepEqual(bottom.map((r) => r.entity_id), ['f', 'd']);
});

test('RollingView round-trips, and a bare URL is the first configured metric', () => {
  const v = { league: 'nfl', metric: 'success_rate', unit: 'carry', win: { hero: 100, movers: 50 }, tab: 'coldest' as const, active: false };
  const qs = rollingViewParams(v).toString();
  assert.equal(qs, 'league=nfl&metric=success_rate&unit=carry&win.hero=100&tab=coldest&active=0');
  assert.deepEqual(parseRollingView(sp(qs)), v);
  const first = ROLLING.cfb[0];
  const w0 = first.windows[0];
  const bare = { league: 'cfb', metric: first.metric, unit: first.unit, win: { hero: w0, movers: w0 }, tab: 'best', active: true };
  assert.deepEqual(parseRollingView(sp('')), bare);
  assert.equal(rollingViewParams(parseRollingView(sp(''))).toString(), '');
});

test('RollingView falls back to the first configured metric and window', () => {
  const nfl0 = ROLLING.nfl[0];
  const w0 = nfl0.windows[0];
  const nflDefault = { league: 'nfl', metric: nfl0.metric, unit: nfl0.unit, win: { hero: w0, movers: w0 }, tab: 'best', active: true };
  assert.deepEqual(parseRollingView(sp('league=nfl&metric=cpoe&unit=dropback')), nflDefault); // unpublished metric
  assert.deepEqual(parseRollingView(sp('league=nfl&metric=epa&unit=punt')), nflDefault); // unpublished unit
  const target = ROLLING.cfb.find((m) => m.metric === 'epa' && m.unit === 'target')!;
  assert.equal(parseRollingView(sp('metric=epa&unit=target&win.hero=100')).win.hero, target.windows[0]); // 100 is a dropback window
  assert.deepEqual(parseRollingView(sp(`league=xfl&tab=hottest&active=yes&win.hero=${'9'.repeat(300)}`)), parseRollingView(sp('')));
});

test('win.<card> keeps only a window the card\'s unit publishes, per card, and drops unknown cards and values', () => {
  const dropback = ROLLING.cfb[0]; // windows 50/100/300
  assert.equal(dropback.unit, 'dropback');
  const v = parseRollingView(sp('win.hero=300&win.movers=100&win.foo=100&win.=50&window=300'));
  assert.deepEqual(v.win, { hero: 300, movers: 100 }); // each card its own window
  assert.equal(rollingViewParams(v).toString(), 'win.hero=300&win.movers=100'); // no foo, no page window
  // The page-level window is gone: `window=` is an unknown key, not a default for the cards.
  assert.deepEqual(parseRollingView(sp('window=300')).win, { hero: 50, movers: 50 });
  // Not a window of this unit, not a number, over-long: that card falls to its first window.
  for (const bad of ['30', '150', '0', '-50', 'abc', '', `${'0'.repeat(250)}100`]) {
    const w = parseRollingView(sp(`win.hero=${bad}&win.movers=300`)).win;
    assert.deepEqual(w, { hero: dropback.windows[0], movers: 300 }, `win.hero=${bad}`);
  }
  // A window is checked against the card's unit: 100 is a dropback window, not a target one.
  const target = parseRollingView(sp('metric=epa&unit=target&win.hero=60&win.movers=100'));
  assert.deepEqual(target.win, { hero: 60, movers: 30 });
  // The default window is omitted, so one card's switch never writes the other's key.
  assert.equal(rollingViewParams({ ...parseRollingView(sp('')), win: { hero: 50, movers: 300 } }).toString(), 'win.movers=300');
});

test('the overview link parses back to the view it was built from', () => {
  const views = [
    ...Object.keys(ROLLING).map((league) => parseRollingView(sp(`league=${league}`))), // the overview's default per league
    { league: 'nfl', metric: 'success_rate', unit: 'carry', win: { hero: 100, movers: 50 }, tab: 'coldest' as const, active: false },
  ];
  for (const v of views) {
    const url = new URL(rollingHref(v), 'https://example.org');
    assert.equal(url.pathname, '/platform/rolling');
    assert.deepEqual(parseRollingView(url.searchParams), v, rollingHref(v));
  }
  assert.equal(rollingHref(parseRollingView(sp(''))), '/platform/rolling'); // no dangling "?"
});
