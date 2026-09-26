import type { Db, ObjectId } from "mongodb";
import type { Answers } from "../content/survey.ts";
import type { Identity } from "./identity.ts";
import type { Profile } from "./survey.ts";

/**
 * One document per /join or /survey questionnaire submission — APPEND-ONLY.
 * The person record holds the latest identity and answers; this is the history
 * that makes an overwrite through an unverified email visible instead of silent.
 * Deleted only with the person (lib/review.ts removePerson).
 */
export type ResponseDoc = {
  _id: ObjectId;
  personId: ObjectId;
  source: "join" | "survey";
  createdAt: Date;
  identity: Identity;
  answers: Answers;
  profile: Profile;
};

const col = (db: Db) => db.collection<ResponseDoc>("responses");

export async function insertResponse(db: Db, doc: Omit<ResponseDoc, "_id">): Promise<ObjectId> {
  return (await col(db).insertOne(doc as ResponseDoc)).insertedId as ObjectId;
}

export async function deleteResponsesForPerson(db: Db, personId: ObjectId): Promise<number> {
  return (await col(db).deleteMany({ personId })).deletedCount;
}

export async function ensureResponseIndexes(db: Db): Promise<void> {
  await col(db).createIndex({ personId: 1, createdAt: -1 });
}
