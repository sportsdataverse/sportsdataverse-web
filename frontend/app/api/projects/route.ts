import { NextResponse } from "next/server";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from "@lib/mongodb";
import { ObjectId } from "mongodb";
import { auth } from "@lib/auth";
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

// Writes require an authenticated sportsdataverse GitHub org member.
async function requireWriter(): Promise<
  | { actor: string; isAdmin: boolean; deny: null }
  | { actor: null; isAdmin: false; deny: NextResponse }
> {
  const session = await auth();
  if (!session?.isOrgMember) {
    return {
      actor: null,
      isAdmin: false,
      deny: NextResponse.json(
        {
          message:
            "Unauthorized: sign in with a sportsdataverse GitHub org account to manage projects.",
          success: false,
        },
        { status: 401 }
      ),
    };
  }
  return {
    actor: session.login ?? "unknown",
    isAdmin: session.role === "admin",
    deny: null,
  };
}

export async function GET() {
  return getProjects();
}

export async function POST(req: Request) {
  const { actor, deny } = await requireWriter();
  if (deny) return deny;
  return addProject(await req.json().catch(() => ({})), actor);
}

export async function PUT(req: Request) {
  const { actor, isAdmin, deny } = await requireWriter();
  if (deny) return deny;
  return updateProject(await req.json().catch(() => ({})), actor, isAdmin);
}

export async function DELETE(req: Request) {
  const { actor, isAdmin, deny } = await requireWriter();
  if (deny) return deny;
  return deleteProject(await req.json().catch(() => ({})), actor, isAdmin);
}

// Getting all projects (public, read-only).
async function getProjects() {
  try {
    const { db } = await connectToDatabase();
    const projects = await db
      .collection("projects")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({
      message: JSON.parse(JSON.stringify(projects)),
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}

// Adding a new project (owned by the creator).
async function addProject(rawBody: unknown, actor: string) {
  const parsed = projectSchema.safeParse(parseBody(rawBody));
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: parsed.error.flatten(),
        success: false,
      },
      { status: 400 }
    );
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
    return NextResponse.json({
      message: "Project added successfully",
      id: result.insertedId,
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
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
      message: "You can only modify projects you created.",
    };
  }
  return { ok: true };
}

// Updating a project by _id (owner or admin; validated fields only).
async function updateProject(rawBody: unknown, actor: string, isAdmin: boolean) {
  const { _id, ...rest } = parseBody(rawBody);
  if (!_id || typeof _id !== "string" || !ObjectId.isValid(_id)) {
    return NextResponse.json(
      {
        message: "A valid _id is required to update a project.",
        success: false,
      },
      { status: 400 }
    );
  }
  const parsed = projectUpdateSchema.safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: parsed.error.flatten(),
        success: false,
      },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { message: "No valid fields to update.", success: false },
      { status: 400 }
    );
  }
  try {
    const { db } = await connectToDatabase();
    const auth = await authorizeMutation(db, _id, actor, isAdmin);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message, success: false }, { status: auth.status });
    }
    await db.collection("projects").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...parsed.data, updatedBy: actor, updatedAt: new Date().toISOString() } }
    );
    return NextResponse.json({ message: "Project updated successfully", success: true });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}

// Deleting a project by _id (owner or admin).
async function deleteProject(rawBody: unknown, actor: string, isAdmin: boolean) {
  const body = parseBody(rawBody);
  const id = typeof body._id === "string" ? body._id : undefined;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json(
      {
        message: "A valid _id is required to delete a project.",
        success: false,
      },
      { status: 400 }
    );
  }
  try {
    const { db } = await connectToDatabase();
    const auth = await authorizeMutation(db, id, actor, isAdmin);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message, success: false }, { status: auth.status });
    }
    await db.collection("projects").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ message: "Project deleted successfully", success: true });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}
