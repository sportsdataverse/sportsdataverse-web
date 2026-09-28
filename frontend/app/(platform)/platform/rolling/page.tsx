import type { Metadata } from "next";
import { parseRollingView, toSearchParams } from "@lib/platform/viewState";
import RollingClient from "./RollingClient";

export const metadata: Metadata = { title: "Rolling form" };

export default async function PlatformRollingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <RollingClient initial={parseRollingView(toSearchParams(await searchParams))} />;
}
