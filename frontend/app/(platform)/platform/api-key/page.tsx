import type { Metadata } from "next";
import ApiKeyPanel from "@components/platform/ApiKeyPanel";

export const metadata: Metadata = { title: "API key" };

export default function ApiKeyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="mb-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">API key</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personal access to the SportsDataverse Data API.
        </p>
      </div>
      <ApiKeyPanel />
    </div>
  );
}
