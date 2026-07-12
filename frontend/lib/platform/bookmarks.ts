import { ObjectId } from "mongodb";
import { connectToDatabase } from "@lib/mongodb";
import type { BookmarkDoc, BookmarkInput } from "./schemas";

/** Owner-scoped saved Explore queries (`explore_bookmarks` collection). */

const COLLECTION = "explore_bookmarks";

export async function listBookmarks(owner: string): Promise<BookmarkDoc[]> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(COLLECTION)
    .find({ owner })
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();
  // Whitelist the contract fields — a spread would leak anything else that
  // ever lands on the doc.
  return docs.map((d: any) => ({
    _id: String(d._id),
    name: d.name,
    tag: d.tag,
    assets: d.assets,
    sql: d.sql,
    owner: d.owner,
    created_at: d.created_at,
  }));
}

export async function insertBookmark(bookmark: BookmarkInput, owner: string): Promise<string> {
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).insertOne({
    ...bookmark,
    owner,
    created_at: new Date().toISOString(),
  });
  return String(result.insertedId);
}

/** Delete one of the owner's bookmarks; false when not found / not theirs. */
export async function deleteBookmark(id: string, owner: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id), owner });
  return result.deletedCount === 1;
}
