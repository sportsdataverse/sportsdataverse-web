import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import type { ModelRunDoc, ModelRunInput, ModelSummary } from "./schemas";

/**
 * MongoDB store for model runs (`model_runs` collection). Shared by the API
 * routes and getServerSideProps so pages can read without an internal HTTP
 * round trip. All returns are JSON-serializable (ObjectId → string).
 */

const COLLECTION = "model_runs";

function serialize(doc: any): ModelRunDoc {
  return { ...doc, _id: String(doc._id) };
}

export type RunFilters = {
  model_id?: string;
  sport?: string;
  status?: string;
  limit?: number;
};

export async function listRuns(filters: RunFilters = {}): Promise<ModelRunDoc[]> {
  const { db } = await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.model_id) query.model_id = filters.model_id;
  if (filters.sport) query.sport = filters.sport;
  if (filters.status) query.status = filters.status;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const docs = await db
    .collection(COLLECTION)
    .find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map(serialize);
}

export async function getRun(id: string): Promise<ModelRunDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const { db } = await connectToDatabase();
  const doc = await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
  return doc ? serialize(doc) : null;
}

export async function insertRun(run: ModelRunInput, actor: string): Promise<string> {
  const { db } = await connectToDatabase();
  const now = new Date().toISOString();
  const result = await db.collection(COLLECTION).insertOne({
    ...run,
    created_by: actor,
    created_at: now,
    updated_at: now,
  });
  return String(result.insertedId);
}

export async function deleteRun(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

/** Registry: one row per model_id, newest-run first. */
export async function listModels(): Promise<ModelSummary[]> {
  const { db } = await connectToDatabase();
  const rows = await db
    .collection(COLLECTION)
    .aggregate([
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: "$model_id",
          sport: { $first: "$sport" },
          run_count: { $sum: 1 },
          latest_run_at: { $first: "$created_at" },
          latest_status: { $first: "$status" },
          latest_gates: { $first: "$gates" },
        },
      },
      { $sort: { latest_run_at: -1 } },
    ])
    .toArray();
  return rows.map((row: any) => {
    const gates: { passed?: boolean }[] = Array.isArray(row.latest_gates) ? row.latest_gates : [];
    return {
      model_id: String(row._id),
      sport: row.sport ?? "unknown",
      run_count: row.run_count ?? 0,
      latest_run_at: row.latest_run_at ?? "",
      latest_status: row.latest_status ?? "completed",
      gates_total: gates.length,
      gates_passed: gates.filter((g) => g.passed === true).length,
    };
  });
}
