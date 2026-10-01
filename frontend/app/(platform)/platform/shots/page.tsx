import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { parseShotsView, toSearchParams } from "@lib/platform/viewState";
import ShotsClient from "./ShotsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("shots", toSearchParams(await searchParams));
}

export default async function PlatformShotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <ShotsClient initial={parseShotsView(toSearchParams(await searchParams))} />;
}
