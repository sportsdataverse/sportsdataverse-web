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
import { parseRollingView, rollingViewParams } from '../lib/platform/viewState.ts';

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
  const p = cardParams('cfb', m, 50, '2026', '2026-09-12', '-delta_prev', 5);
  assert.deepEqual(
    [p.schema, p.table, p.season, p.metric, p.window_unit, p.window_n, p.entity_type, p.qualified, p.last_event_date__gte, p.order, p.limit],
    ['cfb', 'rolling_windows', '2026', m.metric, m.unit, '50', m.entity, 'true', '2026-09-12', '-delta_prev', '5']
  );
  assert.equal('last_event_date__gte' in cardParams('cfb', m, 50, '2026', null, 'cur', 3), false);
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
  const v = { league: 'nfl', metric: 'success_rate', unit: 'carry', window_n: 100, tab: 'coldest' as const, active: false };
  const qs = rollingViewParams(v).toString();
  assert.equal(qs, 'league=nfl&metric=success_rate&unit=carry&window=100&tab=coldest&active=0');
  assert.deepEqual(parseRollingView(sp(qs)), v);
  const first = ROLLING.cfb[0];
  const bare = { league: 'cfb', metric: first.metric, unit: first.unit, window_n: first.windows[0], tab: 'best', active: true };
  assert.deepEqual(parseRollingView(sp('')), bare);
  assert.equal(rollingViewParams(parseRollingView(sp(''))).toString(), '');
});

test('RollingView falls back to the first configured metric and window', () => {
  const nfl0 = ROLLING.nfl[0];
  const nflDefault = { league: 'nfl', metric: nfl0.metric, unit: nfl0.unit, window_n: nfl0.windows[0], tab: 'best', active: true };
  assert.deepEqual(parseRollingView(sp('league=nfl&metric=cpoe&unit=dropback')), nflDefault); // unpublished metric
  assert.deepEqual(parseRollingView(sp('league=nfl&metric=epa&unit=punt')), nflDefault); // unpublished unit
  const target = ROLLING.cfb.find((m) => m.metric === 'epa' && m.unit === 'target')!;
  assert.equal(parseRollingView(sp('metric=epa&unit=target&window=100')).window_n, target.windows[0]); // 100 is a dropback window
  assert.deepEqual(parseRollingView(sp(`league=xfl&tab=hottest&active=yes&window=${'9'.repeat(300)}`)), parseRollingView(sp('')));
});
