import type { Metadata } from "next";
import { dataApi } from "@lib/platform/orch";
import QueryBuilder from "@components/platform/QueryBuilder";

export const metadata: Metadata = { title: "Query" };

export default async function QueryPage() {
  const res = await dataApi("/v1/schemas");
  const schemas: string[] = res.ok ? (await res.json()).schemas : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Query</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and export any warehouse table — the same{" "}
          <code className="font-mono text-xs">data.sportsdataverse.org</code>{" "}
          API your personal key hits, with the equivalent curl for every query.
        </p>
      </div>
      <QueryBuilder schemas={schemas} />
    </div>
  );
}
