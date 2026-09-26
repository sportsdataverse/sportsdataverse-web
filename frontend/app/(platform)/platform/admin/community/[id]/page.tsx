import type { Metadata } from "next";
import PersonClient from "./PersonClient";

export const metadata: Metadata = { title: "Person" };

export default async function PlatformAdminCommunityPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonClient id={id} />;
}
