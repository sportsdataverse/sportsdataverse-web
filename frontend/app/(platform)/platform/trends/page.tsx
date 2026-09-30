import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { parseTrendsView, toSearchParams } from "@lib/platform/viewState";
import TrendsClient from "./TrendsClient";

export const metadata: Metadata = { title: "Trends" };

export default async function PlatformTrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <TrendsClient initial={parseTrendsView(toSearchParams(await searchParams))} />;
}
