import type { Metadata } from "next";
import { parseTrendsView, toSearchParams } from "@lib/platform/viewState";
import TrendsClient from "./TrendsClient";

export const metadata: Metadata = { title: "Trends" };

export default async function PlatformTrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TrendsClient initial={parseTrendsView(toSearchParams(await searchParams))} />;
}
