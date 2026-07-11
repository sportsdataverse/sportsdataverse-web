import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@lib/auth";
import { checkIngestToken, requireMember } from "@lib/platform/auth";
import { listDbStatuses, upsertDbStatus } from "@lib/platform/dbStatus";
import { dbStatusSchema } from "@lib/platform/schemas";

/**
 * sdv-data droplet Postgres heartbeat.
 *
 * GET  -> latest snapshot per source (org member).
 * POST -> upsert a snapshot (CI bearer token or org member). The droplet
 *         PUSHES status on a cron — the site never dials the database (its
 *         ports are closed to the public internet by design).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireMember(req, res);
    if (!actor) return;
    try {
      const statuses = await listDbStatuses();
      return res.json({ message: statuses, success: true });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Query failed",
        success: false,
      });
    }
  }

  if (req.method === "POST") {
    let actor: string | null = null;
    if (checkIngestToken(req)) {
      actor = "ci";
    } else {
      const session = await getServerSession(req, res, authOptions);
      if (session?.isOrgMember) actor = session.login ?? "unknown";
    }
    if (!actor) {
      return res.status(401).json({
        message:
          "Unauthorized: provide the platform ingest bearer token or sign in as a sportsdataverse org member.",
        success: false,
      });
    }

    const parsed = dbStatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten(),
        success: false,
      });
    }
    try {
      await upsertDbStatus(parsed.data, actor);
      return res.json({ message: "Status recorded", success: true });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Upsert failed",
        success: false,
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ message: "Method not allowed", success: false });
}
