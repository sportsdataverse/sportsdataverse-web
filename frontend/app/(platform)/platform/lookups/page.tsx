import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { parseLookupsView, toSearchParams } from "@lib/platform/viewState";
import LookupsClient from "./LookupsClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("lookups", toSearchParams(await searchParams));
}

export default async function PlatformLookupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LookupsClient initial={parseLookupsView(toSearchParams(await searchParams))} />;
}
