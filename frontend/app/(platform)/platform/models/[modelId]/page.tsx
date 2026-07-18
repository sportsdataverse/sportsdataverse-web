import type { Metadata } from "next";
import { listRuns } from "@lib/platform/runs";
import ModelDetailClient from "./ModelDetailClient";

type Params = { params: Promise<{ modelId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { modelId } = await params;
  return { title: modelId };
}

export default async function PlatformModelDetailPage({ params }: Params) {
  const { modelId } = await params;
  const runs = await listRuns({ model_id: modelId, limit: 50 }).catch(() => []);
  return <ModelDetailClient modelId={modelId} runs={runs} />;
}
