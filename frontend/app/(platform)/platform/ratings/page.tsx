import type { Metadata } from "next";
import { parseRatingsView, toSearchParams } from "@lib/platform/viewState";
import RatingsClient from "./RatingsClient";

export const metadata: Metadata = { title: "Ratings" };

export default async function PlatformRatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RatingsClient initial={parseRatingsView(toSearchParams(await searchParams))} />;
}
