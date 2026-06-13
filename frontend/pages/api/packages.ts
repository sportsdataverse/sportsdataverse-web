import { NextApiRequest, NextApiResponse } from "next";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from "@lib/mongodb";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@lib/auth";
import { packageSchema, packageUpdateSchema } from "@lib/packageSchema";

/**
 * Coerce a request body to a plain object. Next parses JSON bodies into objects
 * when `Content-Type: application/json`; older callers sent a stringified body.
 * Either way we end up with an object (or `{}` on garbage).
 */
function parseBody(body: unknown): Record<string, any> {
  if (body == null) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body as Record<string, any>;
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET": {
      return getPkgs(req, res);
    }

    case "POST":
    case "PUT":
    case "DELETE": {
      // Writes require an authenticated sportsdataverse GitHub org member.
      const session = await getServerSession(req, res, authOptions);
      if (!session?.isOrgMember) {
        return res.status(401).json({
          message:
            "Unauthorized: sign in with a sportsdataverse GitHub org account to modify packages.",
          success: false,
        });
      }
      const actor = session.login ?? "unknown";
      if (req.method === "POST") return addPkg(req, res, actor);
      if (req.method === "PUT") return updatePkg(req, res, actor);
      return deletePkg(req, res);
    }

    default: {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res
        .status(405)
        .json({ message: "Method not allowed", success: false });
    }
  }
}

// Getting all pkgs (public, read-only).
async function getPkgs(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const { db } = await connectToDatabase();
    const pkgs = await db
      .collection("packages")
      .find({})
      .sort({ published: -1 })
      .toArray();
    return res.json({
      message: JSON.parse(JSON.stringify(pkgs)),
      success: true,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

// Adding a new package.
async function addPkg(
  req: NextApiRequest,
  res: NextApiResponse,
  actor: string
) {
  const parsed = packageSchema.safeParse(parseBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.flatten(),
      success: false,
    });
  }
  try {
    const { db } = await connectToDatabase();
    const now = new Date().toISOString();
    const doc = {
      ...parsed.data,
      // Create-time default (org members are trusted → publish immediately).
      published: parsed.data.published ?? true,
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("packages").insertOne(doc);
    return res.json({
      message: "Package added successfully",
      id: result.insertedId,
      success: true,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

// Updating an existing package by _id (any org member; validated fields only).
async function updatePkg(
  req: NextApiRequest,
  res: NextApiResponse,
  actor: string
) {
  const { _id, ...rest } = parseBody(req.body);
  if (!_id || typeof _id !== "string" || !ObjectId.isValid(_id)) {
    return res.status(400).json({
      message: "A valid _id is required to update a package.",
      success: false,
    });
  }
  const parsed = packageUpdateSchema.safeParse(rest);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.flatten(),
      success: false,
    });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res
      .status(400)
      .json({ message: "No valid fields to update.", success: false });
  }
  try {
    const { db } = await connectToDatabase();
    const result = await db.collection("packages").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...parsed.data, updatedBy: actor, updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "Package not found.", success: false });
    }
    return res.json({ message: "Package updated successfully", success: true });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

// Deleting a package by _id.
async function deletePkg(req: NextApiRequest, res: NextApiResponse) {
  const body = parseBody(req.body);
  const id =
    typeof body._id === "string"
      ? body._id
      : typeof req.body === "string" && ObjectId.isValid(req.body.trim())
        ? req.body.trim()
        : undefined;
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "A valid _id is required to delete a package.",
      success: false,
    });
  }
  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("packages")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "Package not found.", success: false });
    }
    return res.json({ message: "Package deleted successfully", success: true });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}
