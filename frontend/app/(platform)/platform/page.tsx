import type { Metadata } from "next";
import { listDbStatuses } from "@lib/platform/dbStatus";
import { listModels, listRuns } from "@lib/platform/runs";
import OverviewClient from "./OverviewClient";

export const metadata: Metadata = { title: "Overview" };

export default async function PlatformOverviewPage() {
  // Mongo-only reads (fast); GitHub calls stay on their own tabs.
  const [models, recentRuns, dbStatuses] = await Promise.all([
    listModels().catch(() => []),
    listRuns({ limit: 8 }).catch(() => []),
    listDbStatuses().catch(() => []),
  ]);
  return <OverviewClient models={models} recentRuns={recentRuns} dbStatuses={dbStatuses} />;
}
