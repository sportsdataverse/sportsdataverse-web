import { NextResponse } from "next/server";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { connectToDatabase } from "@lib/mongodb";
import { ObjectId } from "mongodb";
import { auth } from "@lib/auth";
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

// Writes require an authenticated sportsdataverse GitHub org member.
async function requireWriter(): Promise<
  { actor: string; deny: null } | { actor: null; deny: NextResponse }
> {
  const session = await auth();
  if (!session?.isOrgMember) {
    return {
      actor: null,
      deny: NextResponse.json(
        {
          message:
            "Unauthorized: sign in with a sportsdataverse GitHub org account to modify packages.",
          success: false,
        },
        { status: 401 }
      ),
    };
  }
  return { actor: session.login ?? "unknown", deny: null };
}

export async function GET() {
  return getPkgs();
}

export async function POST(req: Request) {
  const { actor, deny } = await requireWriter();
  if (deny) return deny;
  return addPkg(await req.json().catch(() => ({})), actor);
}

export async function PUT(req: Request) {
  const { actor, deny } = await requireWriter();
  if (deny) return deny;
  return updatePkg(await req.json().catch(() => ({})), actor);
}

export async function DELETE(req: Request) {
  const { deny } = await requireWriter();
  if (deny) return deny;
  return deletePkg(await req.json().catch(() => ({})));
}

// Getting all pkgs (public, read-only).
async function getPkgs() {
  try {
    const { db } = await connectToDatabase();
    const pkgs = await db
      .collection("packages")
      .find({})
      .sort({ published: -1 })
      .toArray();
    return NextResponse.json({
      message: JSON.parse(JSON.stringify(pkgs)),
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}

// Adding a new package.
async function addPkg(rawBody: unknown, actor: string) {
  const parsed = packageSchema.safeParse(parseBody(rawBody));
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
      // Create-time default (org members are trusted → publish immediately).
      published: parsed.data.published ?? true,
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("packages").insertOne(doc);
    return NextResponse.json({
      message: "Package added successfully",
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

// Updating an existing package by _id (any org member; validated fields only).
async function updatePkg(rawBody: unknown, actor: string) {
  const { _id, ...rest } = parseBody(rawBody);
  if (!_id || typeof _id !== "string" || !ObjectId.isValid(_id)) {
    return NextResponse.json(
      {
        message: "A valid _id is required to update a package.",
        success: false,
      },
      { status: 400 }
    );
  }
  const parsed = packageUpdateSchema.safeParse(rest);
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
    const result = await db.collection("packages").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { ...parsed.data, updatedBy: actor, updatedAt: new Date().toISOString() } }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: "Package not found.", success: false },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Package updated successfully", success: true });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}

// Deleting a package by _id.
async function deletePkg(rawBody: unknown) {
  const body = parseBody(rawBody);
  const id =
    typeof body._id === "string"
      ? body._id
      : typeof rawBody === "string" && ObjectId.isValid(rawBody.trim())
        ? rawBody.trim()
        : undefined;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json(
      {
        message: "A valid _id is required to delete a package.",
        success: false,
      },
      { status: 400 }
    );
  }
  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("packages")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { message: "Package not found.", success: false },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Package deleted successfully", success: true });
  } catch (error: any) {
    return NextResponse.json(
      { message: new Error(error).message, success: false },
      { status: 500 }
    );
  }
}
