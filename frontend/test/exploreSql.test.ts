import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlLiteral, buildSql, type Filter } from '../lib/platform/exploreSql.ts';
import { parseExploreView, SQL_OP_BY_SUFFIX } from '../lib/platform/viewState.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('sqlLiteral doubles a single quote instead of passing it through raw', () => {
  assert.equal(sqlLiteral("it's"), "'it''s'");
});

test('sqlLiteral passes a bare number through unquoted', () => {
  assert.equal(sqlLiteral('42'), '42');
  assert.equal(sqlLiteral('-3.5'), '-3.5');
});

test('a URL filter value reaches SQL only through sqlLiteral escaping: the quote is doubled', () => {
  const hostile = "x' OR '1'='1";
  const view = parseExploreView(sp(`w.name=${encodeURIComponent(hostile)}`));
  const filters: Filter[] = view.filters.map((f) => ({
    column: f.column,
    op: SQL_OP_BY_SUFFIX[f.op],
    value: f.value,
  }));
  const sql = buildSql('src', filters, 100);
  const expectedLiteral = `'${hostile.replace(/'/g, "''")}'`;
  assert.ok(sql.includes(`"name" = ${expectedLiteral}`), sql);
  // never reaches SQL as a bare, unescaped literal
  assert.ok(!sql.includes(`= '${hostile}'`), sql);
});

test('a hostile "contains" value is quote-escaped inside the ILIKE pattern too', () => {
  const sql = buildSql('src', [{ column: 'name', op: 'contains', value: "o'brien" }], 10);
  assert.ok(sql.includes(`ILIKE '%o''brien%'`), sql);
});

test('columns are interpolated bare, safe only because the caller enforces COLUMN first', () => {
  // buildSql trusts its caller; viewState.ts's COLUMN pattern is what keeps a
  // quote out of a column name before it ever reaches here (see the other test
  // in viewState.test.ts: a quote in a filter key never becomes a column).
  const sql = buildSql('src', [{ column: 'week', op: '>=', value: '3' }], 10);
  assert.ok(sql.includes('"week" >= 3'), sql);
});
