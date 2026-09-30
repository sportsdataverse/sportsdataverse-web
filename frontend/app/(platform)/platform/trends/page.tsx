import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { parseTrendsView, toSearchParams } from "@lib/platform/viewState";
import TrendsClient from "./TrendsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("trends", toSearchParams(await searchParams));
}

export default async function PlatformTrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <TrendsClient initial={parseTrendsView(toSearchParams(await searchParams))} />;
}
