import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import { parseLookupsView, toSearchParams } from "@lib/platform/viewState";
import LookupsClient from "./LookupsClient";

export const metadata: Metadata = { title: "Lookups" };

export default async function PlatformLookupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  return <LookupsClient initial={parseLookupsView(toSearchParams(await searchParams))} />;
}
