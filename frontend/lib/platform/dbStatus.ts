import { connectToDatabase } from "@lib/mongodb";
import type { DbStatusDoc, DbStatusInput } from "./schemas";

/**
 * Latest-snapshot store for pushed database heartbeats (`db_status`
 * collection, one doc per `source`, upserted). The sdv-data droplet cron is
 * the writer; the platform UI is the reader. Staleness is judged client-side
 * from `collected_at`.
 */

const COLLECTION = "db_status";

export async function upsertDbStatus(status: DbStatusInput, actor: string): Promise<void> {
  const { db } = await connectToDatabase();
  await db.collection(COLLECTION).updateOne(
    { source: status.source },
    { $set: { ...status, reported_by: actor, received_at: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function listDbStatuses(): Promise<DbStatusDoc[]> {
  const { db } = await connectToDatabase();
  const docs = await db.collection(COLLECTION).find({}).sort({ source: 1 }).toArray();
  return docs.map((doc: any) => ({ ...doc, _id: String(doc._id) }));
}
