import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dataApi } from "@lib/platform/orch";
import type { Pipeline, RunDetail } from "@lib/platform/orch-types";
import RunDetailView from "@components/platform/orch/RunDetailView";

type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { id } = await params;
  return { title: `run ${id.slice(0, 8)}` };
}

export default async function PipelineRunPage({ params }: Ctx) {
  const { id } = await params;
  const [runRes, pipesRes] = await Promise.all([
    dataApi(`/v1/runs/${encodeURIComponent(id)}`),
    dataApi("/v1/pipelines"),
  ]);
  if (runRes.status === 404) notFound();
  if (!runRes.ok) {
    throw new Error(`data API returned ${runRes.status} for run ${id}`);
  }
  const initialRun = (await runRes.json()) as RunDetail;
  const pipelines = pipesRes.ok ? ((await pipesRes.json()) as Pipeline[]) : [];

  return (
    <RunDetailView runId={id} initialRun={initialRun} pipelines={pipelines} />
  );
}
