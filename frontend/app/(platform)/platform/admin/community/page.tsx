import type { Metadata } from "next";
import { Suspense } from "react";
import CommunityClient from "./CommunityClient";

export const metadata: Metadata = { title: "Community" };

// useSearchParams in the client needs a Suspense boundary
export default function PlatformAdminCommunityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <CommunityClient />
    </Suspense>
  );
}
