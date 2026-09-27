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
  assert.ok(sql.includes(`ILIKE '%o''brien%' ESCAPE '\\'`), sql);
});

test('a "contains" value with LIKE wildcards matches only the literal, not a pattern', () => {
  // "10%_off" must not become a pattern that also matches "10XXXoff" or similar:
  // the user's own % and _ are escaped, only OUR bounding %...% stay wildcards.
  const sql = buildSql('src', [{ column: 'code', op: 'contains', value: '10%_off' }], 10);
  assert.ok(sql.includes(`ILIKE '%10\\%\\_off%' ESCAPE '\\'`), sql);
  // simulate what ESCAPE '\' means: only a literal "10%_off" satisfies the pattern
  const pattern = /^.*10%_off.*$/; // the DuckDB-side semantics once \% and \_ are un-escaped
  assert.ok(pattern.test('has 10%_off in it'));
  assert.ok(!/^.*10X{3}off.*$/.test('has 10%_off in it')); // sanity: not a loose wildcard match
});

test('a bare backslash in a "contains" value is escaped so it cannot smuggle a wildcard', () => {
  const sql = buildSql('src', [{ column: 'name', op: 'contains', value: 'a\\%b' }], 10);
  assert.ok(sql.includes(`ILIKE '%a\\\\\\%b%' ESCAPE '\\'`), sql);
});

test('columns are interpolated bare, safe only because the caller enforces COLUMN first', () => {
  // buildSql trusts its caller; viewState.ts's COLUMN pattern is what keeps a
  // quote out of a column name before it ever reaches here (see the other test
  // in viewState.test.ts: a quote in a filter key never becomes a column).
  const sql = buildSql('src', [{ column: 'week', op: '>=', value: '3' }], 10);
  assert.ok(sql.includes('"week" >= 3'), sql);
});
