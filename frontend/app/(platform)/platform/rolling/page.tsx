import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { parseRollingView, toSearchParams } from "@lib/platform/viewState";
import RollingClient from "./RollingClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("rolling", toSearchParams(await searchParams));
}

export default async function PlatformRollingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RollingClient initial={parseRollingView(toSearchParams(await searchParams))} />;
}
