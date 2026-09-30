import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { listDbStatuses } from "@lib/platform/dbStatus";
import DatabaseClient from "./DatabaseClient";

export const metadata: Metadata = { title: "Database" };

export default async function PlatformDatabasePage() {
  if (!(await requireOrgMember())) return null;
  const statuses = await listDbStatuses().catch(() => []);
  return <DatabaseClient statuses={statuses} />;
}
