import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { parseRollingView, toSearchParams } from "@lib/platform/viewState";
import RollingClient from "./RollingClient";

export const metadata: Metadata = { title: "Rolling form" };

export default async function PlatformRollingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <RollingClient initial={parseRollingView(toSearchParams(await searchParams))} />;
}
