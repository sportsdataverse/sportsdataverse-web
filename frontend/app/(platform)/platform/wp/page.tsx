import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { parseWpView, toSearchParams } from "@lib/platform/viewState";
import WpClient from "./WpClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("wp", toSearchParams(await searchParams));
}

export default async function PlatformWpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <WpClient initial={parseWpView(toSearchParams(await searchParams))} />;
}
