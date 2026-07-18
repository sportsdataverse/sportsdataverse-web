import type { Metadata } from "next";
import { listDbStatuses } from "@lib/platform/dbStatus";
import DatabaseClient from "./DatabaseClient";

export const metadata: Metadata = { title: "Database" };

export default async function PlatformDatabasePage() {
  const statuses = await listDbStatuses().catch(() => []);
  return <DatabaseClient statuses={statuses} />;
}
