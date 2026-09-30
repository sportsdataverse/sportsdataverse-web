import type { Metadata } from "next";
import { requireOrgMember } from "@lib/platform/auth";
import PeopleClient from "./PeopleClient";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PlatformPeoplePage() {
  const session = await requireOrgMember();
  if (!session) return null;
  return <PeopleClient isAdmin={session.role === "admin"} />;
}
