import { NextApiRequest, NextApiResponse } from "next";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from "@lib/mongodb";
import { ObjectId } from "mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@lib/auth";
import { projectSchema, projectUpdateSchema } from "@lib/projectSchema";

/**
 * Coerce a request body to a plain object. Next parses JSON bodies into objects
 * when `Content-Type: application/json`; tolerate a stringified body too.
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
      return getProjects(req, res);
    }

    case "POST":
    case "PUT":
    case "DELETE": {
      // Writes require an authenticated sportsdataverse GitHub org member.
      const session = await getServerSession(req, res, authOptions);
      if (!session?.isOrgMember) {
        return res.status(401).json({
          message:
            "Unauthorized: sign in with a sportsdataverse GitHub org account to manage projects.",
          success: false,
        });
      }
      const actor = session.login ?? "unknown";
      const isAdmin = session.role === "admin";
      if (req.method === "POST") return addProject(req, res, actor);
      if (req.method === "PUT") return updateProject(req, res, actor, isAdmin);
      return deleteProject(req, res, actor, isAdmin);
    }

    default: {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res
        .status(405)
        .json({ message: "Method not allowed", success: false });
    }
  }
}

// Getting all projects (public, read-only).
async function getProjects(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const { db } = await connectToDatabase();
    const projects = await db
      .collection("projects")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({
      message: JSON.parse(JSON.stringify(projects)),
      success: true,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

// Adding a new project (owned by the creator).
async function addProject(
  req: NextApiRequest,
  res: NextApiResponse,
  actor: string
) {
  const parsed = projectSchema.safeParse(parseBody(req.body));
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
      // Visible on /projects by default; members can hide via the pinned toggle.
      pinned: parsed.data.pinned ?? true,
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("projects").insertOne(doc);
    return res.json({
      message: "Project added successfully",
      id: result.insertedId,
      success: true,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

/** Fetch a project and authorize the actor as owner or admin. */
async function authorizeMutation(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  id: string,
  actor: string,
  isAdmin: boolean
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const existing = await db
    .collection("projects")
    .findOne({ _id: new ObjectId(id) });
  if (!existing) return { ok: false, status: 404, message: "Project not found." };
  const isOwner = existing.createdBy && existing.createdBy === actor;
  if (!isOwner && !isAdmin) {
    return {
      ok: false,
      status: 403,
      message: "You can only edit projects you created.",
    };
  }
  return { ok: true };
}

// Updating a project by _id (owner or admin; validated fields only).
async function updateProject(
  req: NextApiRequest,
  res: NextApiResponse,
  actor: string,
  isAdmin: boolean
) {
  const { _id, ...rest } = parseBody(req.body);
  if (!_id || typeof _id !== "string" || !ObjectId.isValid(_id)) {
    return res.status(400).json({
      message: "A valid _id is required to update a project.",
      success: false,
    });
  }
  const parsed = projectUpdateSchema.safeParse(rest);
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
    const auth = await authorizeMutation(db, _id, actor, isAdmin);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message, success: false });
    }
    await db.collection("projects").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...parsed.data, updatedBy: actor, updatedAt: new Date().toISOString() } }
    );
    return res.json({ message: "Project updated successfully", success: true });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}

// Deleting a project by _id (owner or admin).
async function deleteProject(
  req: NextApiRequest,
  res: NextApiResponse,
  actor: string,
  isAdmin: boolean
) {
  const body = parseBody(req.body);
  const id = typeof body._id === "string" ? body._id : undefined;
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "A valid _id is required to delete a project.",
      success: false,
    });
  }
  try {
    const { db } = await connectToDatabase();
    const auth = await authorizeMutation(db, id, actor, isAdmin);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message, success: false });
    }
    await db.collection("projects").deleteOne({ _id: new ObjectId(id) });
    return res.json({ message: "Project deleted successfully", success: true });
  } catch (error: any) {
    return res
      .status(500)
      .json({ message: new Error(error).message, success: false });
  }
}
