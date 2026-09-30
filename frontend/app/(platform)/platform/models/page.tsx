import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { listModels } from "@lib/platform/runs";
import ModelsClient from "./ModelsClient";

export const metadata: Metadata = { title: "Models" };

export default async function PlatformModelsPage() {
  if (!(await requireOrgMember())) return null;
  const models = await listModels().catch(() => []);
  return <ModelsClient models={models} />;
}
