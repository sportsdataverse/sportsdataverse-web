import type { Db } from "mongodb";

/**
 * Fixed-window counter in Mongo (`rate_limits`), keyed `<key>:<window>`.
 * Mongo rather than memory because each Vercel invocation is its own process.
 * A TTL index on `expiresAt` deletes finished windows.
 */
export type RateLimitOpts = { limit: number; windowSec: number; now?: () => Date };

type Bucket = { _id: string; hits: number; expiresAt: Date };

export async function ensureRateLimitIndex(db: Db): Promise<void> {
  await db.collection<Bucket>("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export async function allowRequest(
  db: Db,
  key: string,
  opts: RateLimitOpts
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const now = (opts.now ?? (() => new Date()))();
  const windowMs = opts.windowSec * 1000;
  const bucket = Math.floor(now.getTime() / windowMs);
  const expiresAt = new Date((bucket + 1) * windowMs);
  const doc = await db.collection<Bucket>("rate_limits").findOneAndUpdate(
    { _id: `${key}:${bucket}` },
    { $inc: { hits: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: "after" }
  );
  const hits = doc?.hits ?? 1;
  return {
    allowed: hits <= opts.limit,
    remaining: Math.max(opts.limit - hits, 0),
    retryAfterSec: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  };
}
