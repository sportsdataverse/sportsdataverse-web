"use client";

import useSWR from "swr";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import fetcher from "@lib/fetcher";
import type { PreflightReport } from "@lib/platform/orch-types";
import { Badge } from "@components/ui/badge";

/**
 * Package-freshness indicator. Reads the synchronous preflight audit (every SDV
 * package clone vs origin + installed version vs clone) and renders a compact
 * OK / N-stale badge. The same check runs as the first task of every pipeline
 * run — this just makes the current state visible before you trigger one.
 */
export default function EnvHealth() {
  const { data, error, isLoading } = useSWR<PreflightReport>(
    "/api/platform/orch/preflight",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 600_000 }
  );

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1 font-mono text-[10px]">
        <Loader2 className="size-3 animate-spin" /> env
      </Badge>
    );
  }
  if (error || !data) {
    return (
      <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
        env check unavailable
      </Badge>
    );
  }

  const stale = Object.entries(data.packages).filter(([, v]) => !v.ok);
  if (data.ok) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-status-success/40 font-mono text-[10px] text-status-success-ink dark:text-status-success"
        title={`All ${data.known.length} package clones current with origin and installed`}
      >
        <CheckCircle2 className="size-3" /> env current
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-status-running/40 font-mono text-[10px] text-status-running-ink dark:text-status-running"
      title={stale.map(([, v]) => v.findings.join("; ")).join("\n")}
    >
      <AlertTriangle className="size-3" />
      {stale.length} package{stale.length === 1 ? "" : "s"} stale
    </Badge>
  );
}
