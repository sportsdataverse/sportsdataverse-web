import type { NextApiRequest, NextApiResponse } from "next";
import { requireMember } from "@lib/platform/auth";
import { deleteBookmark, insertBookmark, listBookmarks } from "@lib/platform/bookmarks";
import { bookmarkSchema } from "@lib/platform/schemas";

/**
 * Saved Explore queries, scoped to the signed-in member.
 * GET -> own bookmarks | POST -> save one | DELETE ?id= -> remove own.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireMember(req, res);
  if (!actor) return;

  try {
    if (req.method === "GET") {
      return res.json({ message: await listBookmarks(actor), success: true });
    }

    if (req.method === "POST") {
      const parsed = bookmarkSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten(),
          success: false,
        });
      }
      const id = await insertBookmark(parsed.data, actor);
      return res.status(201).json({ message: "Saved", id, success: true });
    }

    if (req.method === "DELETE") {
      const id = typeof req.query.id === "string" ? req.query.id : "";
      const deleted = await deleteBookmark(id, actor);
      if (!deleted) return res.status(404).json({ message: "Not found", success: false });
      return res.json({ message: "Deleted", success: true });
    }
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Database error",
      success: false,
    });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ message: "Method not allowed", success: false });
}
