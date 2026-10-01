import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { parseGridView, parseRatingsView, toSearchParams } from "@lib/platform/viewState";
import RatingsClient from "./RatingsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("ratings", toSearchParams(await searchParams));
}

export default async function PlatformRatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  const sp = toSearchParams(await searchParams);
  const grid = parseGridView(sp);
  return <RatingsClient initial={parseRatingsView(sp)} initialPin={grid.pin} initialPreset={grid.preset} initialBasis={grid.basis} />;
}
