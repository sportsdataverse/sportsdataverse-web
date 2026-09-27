/**
 * Explore's SQL builder: turns a dataset source + filter rows into a DuckDB
 * SELECT. Pulled out of ExploreClient.tsx so it's plain, dependency-free
 * logic `node --test` can load directly (see viewState.ts).
 *
 * Security invariant: a filter VALUE reaches the SQL string only through
 * escapeSqlString()/sqlLiteral() (single quotes doubled); a filter COLUMN is
 * interpolated bare as `"${column}"`, which is safe only because every
 * caller has already checked it against viewState.ts's COLUMN pattern
 * (`^[A-Za-z_][\w.]*$`, which forbids quotes) — parseExploreView's
 * splitKey() enforces this for a URL-sourced filter, and the schema-derived
 * filter dropdown only ever offers real DESCRIBE column names. buildSql
 * itself does not re-validate the column: it trusts that contract.
 *
 * The "contains" (ILIKE) branch additionally escapes the value's OWN LIKE
 * wildcards (`\`, `%`, `_`) before wrapping it in the bounding `%...%`, with
 * `ESCAPE '\'` on the clause (DuckDB's LIKE/ILIKE grammar: a value containing
 * a literal `%` or `_` would otherwise itself act as a wildcard — "10%_off"
 * must match only that literal string, not "10XXXoff").
 */
export type Filter = { column: string; op: string; value: string };

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape a LIKE/ILIKE value's own wildcards so it matches only the literal. */
function escapeLikeWildcards(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function sqlLiteral(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value.trim())) return value.trim();
  return `'${escapeSqlString(value)}'`;
}

export function buildSql(source: string, filters: Filter[], limit: number): string {
  const where = filters
    .filter((f) => f.column && f.value !== "")
    .map((f) =>
      f.op === "contains"
        ? `CAST("${f.column}" AS VARCHAR) ILIKE '%${escapeSqlString(escapeLikeWildcards(f.value))}%' ESCAPE '\\'`
        : `"${f.column}" ${f.op} ${sqlLiteral(f.value)}`
    )
    .join("\n  AND ");
  return [
    `SELECT *`,
    `FROM ${source}`,
    where ? `WHERE ${where}` : null,
    `LIMIT ${Math.max(1, limit)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
