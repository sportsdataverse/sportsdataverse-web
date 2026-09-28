import type { Metadata } from "next";
import { parseScatterView, toSearchParams } from "@lib/platform/viewState";
import ScatterClient from "./ScatterClient";

export const metadata: Metadata = { title: "Scatter" };

export default async function PlatformScatterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ScatterClient initial={parseScatterView(toSearchParams(await searchParams))} />;
}
