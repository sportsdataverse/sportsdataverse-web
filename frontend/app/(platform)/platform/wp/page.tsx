import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { parseWpView, toSearchParams } from "@lib/platform/viewState";
import WpClient from "./WpClient";

export const metadata: Metadata = { title: "Win probability" };

export default async function PlatformWpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <WpClient initial={parseWpView(toSearchParams(await searchParams))} />;
}
