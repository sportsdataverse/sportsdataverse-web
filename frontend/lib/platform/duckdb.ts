/**
 * Client-only DuckDB-WASM engine for the /platform/explore exporter.
 *
 * Queries run entirely in the browser against GitHub release assets
 * (parquet/csv) over HTTP range reads — no server, no egress through Vercel.
 * The wasm bundle + worker load lazily from jsDelivr on first use, so the
 * page bundle stays light and Next never has to webpack the wasm.
 *
 * Never import this from server code.
 */

import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function initDb(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  // Same-origin worker shim around the CDN-hosted worker script.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

export type QueryResult = {
  columns: string[];
  /** Row-major values, stringified for display; null stays null. */
  rows: (string | null)[][];
  rowCount: number;
};

/** SELECT-source SQL for a set of release-asset URLs (parquet or csv). */
export function sourceFor(urls: string[]): string {
  const list = urls.map((u) => `'${u.replace(/'/g, "''")}'`).join(", ");
  const isCsv = urls.every((u) => /\.csv(\.gz)?$/i.test(u));
  return isCsv
    ? `read_csv_auto([${list}], union_by_name=true)`
    : `read_parquet([${list}], union_by_name=true)`;
}

function cellToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function runQuery(sql: string, maxRows = 500): Promise<QueryResult> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const columns = table.schema.fields.map((f) => f.name);
    const rows: (string | null)[][] = [];
    let count = 0;
    outer: for (const batch of table.batches) {
      for (let i = 0; i < batch.numRows; i++) {
        if (rows.length >= maxRows) break outer;
        const row: (string | null)[] = [];
        for (let c = 0; c < columns.length; c++) {
          row.push(cellToString(batch.getChildAt(c)?.get(i)));
        }
        rows.push(row);
      }
    }
    count = table.numRows;
    return { columns, rows, rowCount: count };
  } finally {
    await conn.close();
  }
}

/**
 * Run SQL over an in-memory rowset (e.g. rows returned by the Data API).
 * The rows are registered as a `result` view for the duration of the call, so
 * statements read naturally: `SELECT pos_team, avg(epa) FROM result GROUP BY 1`.
 */
export async function queryOverRows(
  rows: Record<string, unknown>[],
  sql: string,
  maxRows = 2000
): Promise<QueryResult> {
  const db = await getDb();
  const name = "__api_result.json";
  await db.registerFileText(name, JSON.stringify(rows));
  const conn = await db.connect();
  try {
    await conn.query(
      `CREATE OR REPLACE VIEW result AS SELECT * FROM read_json_auto('${name}')`
    );
    const table = await conn.query(sql);
    const columns = table.schema.fields.map((f) => f.name);
    const out: (string | null)[][] = [];
    outer: for (const batch of table.batches) {
      for (let i = 0; i < batch.numRows; i++) {
        if (out.length >= maxRows) break outer;
        const row: (string | null)[] = [];
        for (let c = 0; c < columns.length; c++) {
          row.push(cellToString(batch.getChildAt(c)?.get(i)));
        }
        out.push(row);
      }
    }
    return { columns, rows: out, rowCount: table.numRows };
  } finally {
    await conn.query("DROP VIEW IF EXISTS result").catch(() => undefined);
    await conn.close();
    await db.dropFile(name).catch(() => undefined);
  }
}

/** Escape one CSV cell per RFC 4180. */
function csvCell(value: string | null): string {
  if (value == null) return "";
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Run `sql` and stream the FULL result (no preview cap) into a CSV Blob.
 * Kept in JS rather than COPY TO so no wasm filesystem round trip is needed.
 */
export async function queryToCsvBlob(sql: string): Promise<{ blob: Blob; rowCount: number }> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const columns = table.schema.fields.map((f) => f.name);
    const parts: string[] = [columns.map(csvCell).join(",") + "\n"];
    for (const batch of table.batches) {
      const lines: string[] = [];
      for (let i = 0; i < batch.numRows; i++) {
        const row: string[] = [];
        for (let c = 0; c < columns.length; c++) {
          row.push(csvCell(cellToString(batch.getChildAt(c)?.get(i))));
        }
        lines.push(row.join(","));
      }
      if (lines.length) parts.push(lines.join("\n") + "\n");
    }
    return { blob: new Blob(parts, { type: "text/csv" }), rowCount: table.numRows };
  } finally {
    await conn.close();
  }
}
