import type { Metadata } from "next";
import { auth } from "@lib/auth";
import PeopleClient from "./PeopleClient";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PlatformPeoplePage() {
  const session = await auth();
  return <PeopleClient isAdmin={session?.role === "admin"} />;
}
