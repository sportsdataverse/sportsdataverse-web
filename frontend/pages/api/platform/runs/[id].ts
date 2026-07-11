import type { NextApiRequest, NextApiResponse } from "next";
import { requireMember } from "@lib/platform/auth";
import { deleteRun, getRun } from "@lib/platform/runs";

/** GET one run | DELETE one run (both org-member only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireMember(req, res);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";

  if (req.method === "GET") {
    const run = await getRun(id);
    if (!run) return res.status(404).json({ message: "Run not found", success: false });
    return res.json({ message: run, success: true });
  }

  if (req.method === "DELETE") {
    const deleted = await deleteRun(id);
    if (!deleted) return res.status(404).json({ message: "Run not found", success: false });
    return res.json({ message: "Run deleted", success: true });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ message: "Method not allowed", success: false });
}
