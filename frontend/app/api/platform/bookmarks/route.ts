import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { deleteBookmark, insertBookmark, listBookmarks } from "@lib/platform/bookmarks";
import { bookmarkSchema } from "@lib/platform/schemas";

/**
 * Saved Explore queries, scoped to the signed-in member.
 * GET -> own bookmarks | POST -> save one | DELETE ?id= -> remove own.
 */

export async function GET() {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  const actor = session.login ?? "unknown";
  try {
    return NextResponse.json({ message: await listBookmarks(actor), success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Database error",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  const actor = session.login ?? "unknown";
  try {
    const parsed = bookmarkSchema.safeParse((await req.json().catch(() => ({}))) ?? {});
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
    const id = await insertBookmark(parsed.data, actor);
    return NextResponse.json({ message: "Saved", id, success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Database error",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { session, deny } = await requireMemberApp();
  if (deny) return deny;
  const actor = session.login ?? "unknown";
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const deleted = await deleteBookmark(id, actor);
    if (!deleted) {
      return NextResponse.json({ message: "Not found", success: false }, { status: 404 });
    }
    return NextResponse.json({ message: "Deleted", success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Database error",
        success: false,
      },
      { status: 500 }
    );
  }
}
