import type { Metadata } from "next";
import ApiDocsClient from "./ApiDocsClient";

export const metadata: Metadata = { title: "API docs" };

export default function ApiDocsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="mb-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">API docs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Interactive reference for the SportsDataverse Data API, for org members.
        </p>
      </div>
      <ApiDocsClient />
    </div>
  );
}
