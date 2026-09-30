import type { Metadata } from "next";
import { ogMetadata } from "@lib/ogSummary";
import { requireOrgMember } from "@lib/platform/auth";
import { dataApi } from "@lib/platform/orch";
import { parseGridView, parseQueryView, toSearchParams } from "@lib/platform/viewState";
import QueryBuilder from "@components/platform/QueryBuilder";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return ogMetadata("query", toSearchParams(await searchParams));
}

export default async function QueryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await requireOrgMember())) return null;
  const res = await dataApi("/v1/schemas");
  const schemas: string[] = res.ok ? (await res.json()).schemas : [];
  const sp = toSearchParams(await searchParams);

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
      <QueryBuilder
        schemas={schemas}
        initial={parseQueryView(sp, schemas)}
        initialGrid={parseGridView(sp)}
      />
    </div>
  );
}
