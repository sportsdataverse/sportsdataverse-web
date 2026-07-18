import { NextResponse } from "next/server";
import { requireMemberApp } from "@lib/platform/auth";
import { deleteRun, getRun } from "@lib/platform/runs";

/** GET one run | DELETE one run (both org-member only). */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  try {
    const run = await getRun(id);
    if (!run) {
      return NextResponse.json(
        { message: "Run not found", success: false },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: run, success: true });
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

export async function DELETE(_req: Request, ctx: Ctx) {
  const { deny } = await requireMemberApp();
  if (deny) return deny;
  const { id } = await ctx.params;
  try {
    const deleted = await deleteRun(id);
    if (!deleted) {
      return NextResponse.json(
        { message: "Run not found", success: false },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Run deleted", success: true });
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
