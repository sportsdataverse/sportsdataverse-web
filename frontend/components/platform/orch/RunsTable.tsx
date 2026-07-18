"use client";

import useSWR from "swr";
import Link from "next/link";
import fetcher from "@lib/fetcher";
import type { RunRef } from "@lib/platform/orch-types";
import { isTerminal } from "@lib/platform/orch-types";
import { StatusBadge } from "@components/platform/widgets";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/table";
import { Skeleton } from "@components/ui/skeleton";

/** Recent orchestrator runs — polls fast (5s) while anything is live, slow
 *  (60s) when the list is quiet. */
export default function RunsTable() {
  const { data, isLoading } = useSWR<RunRef[]>(
    "/api/platform/orch/runs?limit=25",
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.some((r) => !isTerminal(r.state)) ? 5_000 : 60_000,
      revalidateOnFocus: false,
    }
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (!data?.length) {
    return (
      <p className="py-8 text-center font-mono text-sm text-muted-foreground">
        no runs yet — trigger one above
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">State</TableHead>
          <TableHead>Run</TableHead>
          <TableHead className="hidden md:table-cell">Run id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((run) => (
          <TableRow key={run.run_id} className="group">
            <TableCell>
              <StatusBadge status={run.state} />
            </TableCell>
            <TableCell>
              <Link
                href={`/platform/pipelines/runs/${run.run_id}`}
                className="font-medium transition-colors group-hover:text-primary"
              >
                {run.name || run.run_id.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
              {run.run_id}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
