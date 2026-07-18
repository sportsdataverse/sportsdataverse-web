import type { Metadata } from "next";
import { listModels } from "@lib/platform/runs";
import ModelsClient from "./ModelsClient";

export const metadata: Metadata = { title: "Models" };

export default async function PlatformModelsPage() {
  const models = await listModels().catch(() => []);
  return <ModelsClient models={models} />;
}
