import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
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
  return <ScatterClient initial={parseScatterView(toSearchParams(await searchParams))} />;
}
