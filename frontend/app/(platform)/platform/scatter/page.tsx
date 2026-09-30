import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { parseScatterView, toSearchParams } from "@lib/platform/viewState";
import ScatterClient from "./ScatterClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("scatter", toSearchParams(await searchParams));
}

export default async function PlatformScatterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <ScatterClient initial={parseScatterView(toSearchParams(await searchParams))} />;
}
