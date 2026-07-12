import { z } from "zod";

/**
 * Model-run tracking schemas (MongoDB `model_runs` collection).
 *
 * Runs are ingested either by a signed-in org member or by CI via the
 * `PLATFORM_INGEST_TOKEN` bearer token (see lib/platform/auth.ts). The server
 * stamps `created_by/created_at/updated_at`; client `_id` is ignored.
 */

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

/** An oracle gate — the org's evaluation currency (threshold vs observed). */
export const gateSchema = z.object({
  name: z.string().min(1).max(120),
  threshold: z.number(),
  observed: z.number(),
  comparison: z.enum(["gte", "lte"]).default("gte"),
  passed: z.boolean(),
});

export const artifactSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
});

export const runStatusValues = ["running", "completed", "failed"] as const;

export const modelRunSchema = z.object({
  model_id: z.string().regex(SLUG, "lowercase slug (a-z0-9_-)").max(80),
  sport: z.string().min(1).max(20),
  run_name: z.string().max(200).optional(),
  status: z.enum(runStatusValues).default("completed"),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  metrics: z.record(z.number()).default({}),
  gates: z.array(gateSchema).default([]),
  artifacts: z.array(artifactSchema).default([]),
  git: z
    .object({
      repo: z.string().max(200).optional(),
      branch: z.string().max(200).optional(),
      sha: z.string().max(64).optional(),
    })
    .optional(),
  tags: z.array(z.string().max(60)).default([]),
  notes: z.string().max(5000).optional(),
  started_at: z.string().datetime({ offset: true }).optional(),
  finished_at: z.string().datetime({ offset: true }).optional(),
});

export type Gate = z.infer<typeof gateSchema>;
export type ModelRunInput = z.infer<typeof modelRunSchema>;

/** A run as stored/returned (server-stamped metadata included). */
export type ModelRunDoc = ModelRunInput & {
  _id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * sdv-data droplet Postgres heartbeat (Mongo `db_status` collection, one doc
 * per `source`). The droplet cron PUSHES this — the site never dials the DB
 * (its ports are closed to the public internet by design).
 */
export const dbStatusSchema = z.object({
  source: z.string().regex(SLUG).max(60).default("sdv-db"),
  ok: z.boolean(),
  host_label: z.string().max(120).optional(),
  postgres_version: z.string().max(200).optional(),
  db_size_bytes: z.number().nonnegative().optional(),
  table_count: z.number().int().nonnegative().optional(),
  row_estimate: z.number().nonnegative().optional(),
  /** Per-dataset freshness, capped so a heartbeat stays small. */
  datasets: z
    .array(
      z.object({
        name: z.string().max(120),
        rows: z.number().nonnegative().optional(),
        /** When the dataset last gained rows (max of its event/load timestamp). */
        last_updated: z.string().datetime({ offset: true }).optional(),
        /** Human-readable identity of the newest row, e.g. "game_id=401628 (2026-01-13)". */
        latest_row: z.string().max(300).optional(),
      })
    )
    .max(200)
    .default([]),
  error: z.string().max(2000).optional(),
  collected_at: z.string().datetime({ offset: true }),
});

export type DbStatusInput = z.infer<typeof dbStatusSchema>;
export type DbStatusDoc = DbStatusInput & {
  _id: string;
  reported_by: string;
  received_at: string;
};

/** A saved Explore query (Mongo `explore_bookmarks`, owner-scoped). */
export const bookmarkSchema = z.object({
  name: z.string().min(1).max(120),
  tag: z.string().min(1).max(120),
  assets: z.array(z.string().max(200)).min(1).max(50),
  sql: z.string().min(1).max(10_000),
});

export type BookmarkInput = z.infer<typeof bookmarkSchema>;
export type BookmarkDoc = BookmarkInput & {
  _id: string;
  owner: string;
  created_at: string;
};

/** Registry aggregation row: one line per model_id. */
export type ModelSummary = {
  model_id: string;
  sport: string;
  run_count: number;
  latest_run_at: string;
  latest_status: (typeof runStatusValues)[number];
  gates_total: number;
  gates_passed: number;
};
