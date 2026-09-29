import type { Metadata } from "next";
import { parseGridView, parseRatingsView, toSearchParams } from "@lib/platform/viewState";
import RatingsClient from "./RatingsClient";

export const metadata: Metadata = { title: "Ratings" };

export default async function PlatformRatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = toSearchParams(await searchParams);
  return <RatingsClient initial={parseRatingsView(sp)} initialPin={parseGridView(sp).pin} />;
}
