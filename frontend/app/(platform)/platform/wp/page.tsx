import type { Metadata } from "next";
import { parseWpView, toSearchParams } from "@lib/platform/viewState";
import WpClient from "./WpClient";

export const metadata: Metadata = { title: "Win probability" };

export default async function PlatformWpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <WpClient initial={parseWpView(toSearchParams(await searchParams))} />;
}
