import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { parseGridView, parseRatingsView, toSearchParams } from "@lib/platform/viewState";
import RatingsClient from "./RatingsClient";

export const metadata: Metadata = { title: "Ratings" };

export default async function PlatformRatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  const sp = toSearchParams(await searchParams);
  return <RatingsClient initial={parseRatingsView(sp)} initialPin={parseGridView(sp).pin} />;
}
