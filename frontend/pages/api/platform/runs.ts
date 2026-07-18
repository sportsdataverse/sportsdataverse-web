import type { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@lib/auth";
import { checkIngestToken, requireMember } from "@lib/platform/auth";
import { insertRun, listRuns } from "@lib/platform/runs";
import { modelRunSchema } from "@lib/platform/schemas";

/**
 * GET  -> run list, filters: ?model_id=&sport=&status=&limit= (org member).
 * POST -> ingest one run (org member session OR CI bearer token
 *         `Authorization: Bearer <PLATFORM_INGEST_TOKEN>`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireMember(req, res);
    if (!actor) return;
    const { model_id, sport, status, limit } = req.query;
    try {
      const runs = await listRuns({
        model_id: typeof model_id === "string" ? model_id : undefined,
        sport: typeof sport === "string" ? sport : undefined,
        status: typeof status === "string" ? status : undefined,
        limit: typeof limit === "string" ? Number(limit) || undefined : undefined,
      });
      return res.json({ message: runs, success: true });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Query failed",
        success: false,
      });
    }
  }

  if (req.method === "POST") {
    // CI token first (no session round trip); fall back to member session.
    let actor: string | null = null;
    if (checkIngestToken(req.headers.authorization)) {
      actor = "ci";
    } else {
      const session = await auth(req, res);
      if (session?.isOrgMember) actor = session.login ?? "unknown";
    }
    if (!actor) {
      return res.status(401).json({
        message:
          "Unauthorized: provide the platform ingest bearer token or sign in as a sportsdataverse org member.",
        success: false,
      });
    }

    const parsed = modelRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten(),
        success: false,
      });
    }
    try {
      const id = await insertRun(parsed.data, actor);
      return res.status(201).json({ message: "Run recorded", id, success: true });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Insert failed",
        success: false,
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ message: "Method not allowed", success: false });
}
