import { cache } from "react";
import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { getRun } from "@lib/platform/runs";
import RunDetailClient from "./RunDetailClient";

type Params = { params: Promise<{ id: string }> };

// Dedupes the Mongo read between generateMetadata and the page render.
const getRunCached = cache((id: string) => getRun(id).catch(() => null));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // the title names the model: a signed-out request for a valid run id must not learn it
  if (!(await requireOrgMember())) return { title: "Run" };
  const { id } = await params;
  const run = await getRunCached(id);
  return { title: run ? `${run.model_id} run` : "Run not found" };
}

export default async function PlatformRunDetailPage({ params }: Params) {
  if (!(await requireOrgMember())) return null;
  const { id } = await params;
  const run = await getRunCached(id);
  return <RunDetailClient run={run} />;
}
