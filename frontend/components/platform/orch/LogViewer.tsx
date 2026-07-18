"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import fetcher from "@lib/fetcher";
import type { LogPage } from "@lib/platform/orch-types";
import { cn } from "@lib/utils";
import { Button } from "@components/ui/button";
import { ArrowDownToLine } from "lucide-react";

const LEVELS = ["ALL", "INFO", "WARNING", "ERROR"] as const;

const LEVEL_TONE: Record<string, string> = {
  ERROR: "text-status-failed",
  CRITICAL: "text-status-failed",
  WARNING: "text-status-running",
  DEBUG: "text-muted-foreground/60",
};

/** Live log tail for a run. Polls while the run is active; level filter and
 *  follow-tail are client-side. */
// ponytail: fetches the first 1000 lines in one page — plenty for these
// pipeline runs; switch to next_offset paging if logs outgrow that.
export default function LogViewer({
  runId,
  active,
}: {
  runId: string;
  active: boolean;
}) {
  const { data } = useSWR<LogPage>(
    `/api/platform/orch/runs/${runId}/logs?limit=1000`,
    fetcher,
    { refreshInterval: active ? 5_000 : 0, revalidateOnFocus: false }
  );
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("ALL");
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  const logs = (data?.logs ?? []).filter(
    (l) =>
      level === "ALL" ||
      l.level === level ||
      (level === "ERROR" && l.level === "CRITICAL")
  );

  useEffect(() => {
    if (follow && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logs.length, follow]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={cn(
              "rounded-md border border-border/70 px-2 py-0.5 font-mono text-[10px] transition-colors",
              level === l
                ? "border-primary/60 bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {logs.length} lines{active ? " · live" : ""}
        </span>
        <Button
          variant={follow ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 font-mono text-[10px]"
          onClick={() => setFollow((v) => !v)}
        >
          <ArrowDownToLine className="size-3" /> follow
        </Button>
      </div>
      <div
        ref={boxRef}
        className="h-80 overflow-auto rounded-lg border border-border/60 bg-[#0b0e12] p-3 font-mono text-xs leading-5 text-zinc-200"
      >
        {logs.length === 0 ? (
          <p className="text-zinc-500">no log lines yet</p>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="flex gap-3 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-zinc-500">
                {l.ts.slice(11, 19)}
              </span>
              <span
                className={cn(
                  "w-16 shrink-0",
                  LEVEL_TONE[l.level] ?? "text-status-scheduled"
                )}
              >
                {l.level}
              </span>
              <span>{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
