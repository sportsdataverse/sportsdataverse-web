"use client";

import useSWR from "swr";
import fetcher from "@lib/fetcher";
import type { Limit } from "@lib/platform/orch-types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@components/ui/tooltip";
import { cn } from "@lib/utils";

/** Shared-rate-budget chips (stats_nba 0/1, proxybonanza 2/4, …). A saturated
 *  budget is the reason a queued run isn't starting — surface it. */
export default function BudgetBadges() {
  const { data } = useSWR<Limit[]>("/api/platform/orch/limits", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  if (!data?.length) return null;
  const writers = data.filter((l) => l.tag.startsWith("repo_writer:"));
  const shared = data.filter((l) => !l.tag.startsWith("repo_writer:"));
  const busyWriters = writers.filter((l) => l.active > 0).length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shared.map((l) => (
        <span
          key={l.tag}
          className={cn(
            "rounded-md border border-border/70 px-2 py-0.5 font-mono text-xs",
            l.active >= l.limit
              ? "border-status-running/50 bg-status-running/10 text-status-running"
              : "text-muted-foreground"
          )}
        >
          {l.tag} {l.active}/{l.limit}
        </span>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "rounded-md border border-border/70 px-2 py-0.5 font-mono text-xs",
              busyWriters > 0
                ? "border-status-running/50 bg-status-running/10 text-status-running"
                : "text-muted-foreground"
            )}
          >
            repo writers {busyWriters}/{writers.length}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono text-xs">
          {writers.map((l) => `${l.tag.replace("repo_writer:", "")} ${l.active}/${l.limit}`).join(" · ")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
