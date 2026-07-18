import { cache } from "react";
import type { Metadata } from "next";
import { getRun } from "@lib/platform/runs";
import RunDetailClient from "./RunDetailClient";

type Params = { params: Promise<{ id: string }> };

// Dedupes the Mongo read between generateMetadata and the page render.
const getRunCached = cache((id: string) => getRun(id).catch(() => null));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const run = await getRunCached(id);
  return { title: run ? `${run.model_id} run` : "Run not found" };
}

export default async function PlatformRunDetailPage({ params }: Params) {
  const { id } = await params;
  const run = await getRunCached(id);
  return <RunDetailClient run={run} />;
}
