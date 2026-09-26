import type { Metadata } from "next";
import { Suspense } from "react";
import PersonClient from "./PersonClient";

export const metadata: Metadata = { title: "Person" };

// useSearchParams in the client (the "from" query it returns to) needs a Suspense boundary
export default async function PlatformAdminCommunityPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <PersonClient id={id} />
    </Suspense>
  );
}
