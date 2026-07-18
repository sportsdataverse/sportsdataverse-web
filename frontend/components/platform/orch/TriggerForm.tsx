"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import type { Pipeline, RunRef } from "@lib/platform/orch-types";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/select";
import { Badge } from "@components/ui/badge";
import { cn } from "@lib/utils";

/** Launch a pipeline run (or season-range backfill) through the Data API. */
export default function TriggerForm({ pipelines }: { pipelines: Pipeline[] }) {
  const router = useRouter();
  const [sport, setSport] = useState(pipelines[0]?.sport ?? "");
  const pipe = useMemo(
    () => pipelines.find((p) => p.sport === sport),
    [pipelines, sport]
  );
  const [stages, setStages] = useState<string[] | null>(null); // null = defaults
  const [start, setStart] = useState<number | "">("");
  const [end, setEnd] = useState<number | "">("");
  const [backfill, setBackfill] = useState(false);
  const [rescrape, setRescrape] = useState(false);
  const [refreshWarehouse, setRefreshWarehouse] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedStages = stages ?? pipe?.default_stages ?? [];
  const rescrapeAvailable = pipe?.stages.some(
    (s) => selectedStages.includes(s.key) && s.supports_rescrape
  );
  const warehouseAvailable = !!pipe?.warehouse_sport;

  function toggleStage(key: string) {
    const next = new Set(selectedStages);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // preserve the pipeline's declared order
    setStages(pipe?.stages.map((s) => s.key).filter((k) => next.has(k)) ?? []);
  }

  async function submit() {
    if (!pipe || start === "") return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/orch/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: pipe.sport,
          start,
          end: end === "" ? null : end,
          stages: stages, // null -> registry defaults
          rescrape: rescrapeAvailable ? rescrape : null,
          backfill,
          refresh_warehouse: warehouseAvailable ? refreshWarehouse : false,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail ?? detail?.message ?? `HTTP ${res.status}`);
      }
      const run = (await res.json()) as RunRef;
      toast.success(`Run ${run.name || run.run_id.slice(0, 8)} scheduled`, {
        description: `${pipe.sport} · ${selectedStages.join(" → ")}`,
      });
      router.push(`/platform/pipelines/runs/${run.run_id}`);
    } catch (err) {
      toast.error("Trigger failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!pipe) {
    return (
      <p className="font-mono text-sm text-muted-foreground">
        pipeline catalog unavailable
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-xs text-muted-foreground">sport</label>
          <Select
            value={sport}
            onValueChange={(v) => {
              setSport(v);
              setStages(null);
              setRescrape(false);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.sport} value={p.sport}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-xs text-muted-foreground">
            {backfill ? "start season" : "season"}
          </label>
          <Input
            type="number"
            className="w-28 font-mono"
            min={pipe.season_min}
            max={pipe.season_max}
            placeholder={String(pipe.season_max)}
            value={start}
            onChange={(e) =>
              setStart(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>
        {backfill ? (
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-xs text-muted-foreground">
              end season
            </label>
            <Input
              type="number"
              className="w-28 font-mono"
              min={pipe.season_min}
              max={pipe.season_max}
              placeholder={String(pipe.season_max)}
              value={end}
              onChange={(e) =>
                setEnd(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
        ) : null}
        <label className="flex items-center gap-2 pb-2 font-mono text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={backfill}
            onChange={(e) => setBackfill(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          backfill range
        </label>
        {rescrapeAvailable ? (
          <label className="flex items-center gap-2 pb-2 font-mono text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={rescrape}
              onChange={(e) => setRescrape(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            rescrape
          </label>
        ) : null}
        {warehouseAvailable ? (
          <label
            className="flex items-center gap-2 pb-2 font-mono text-xs text-muted-foreground"
            title={`After the run, re-ingest ${pipe.warehouse_sport} into the warehouse (data.sportsdataverse.org)`}
          >
            <input
              type="checkbox"
              checked={refreshWarehouse}
              onChange={(e) => setRefreshWarehouse(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            refresh warehouse
          </label>
        ) : null}
        <Button onClick={submit} disabled={busy || start === ""} className="gap-2">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {backfill ? "Start backfill" : "Run pipeline"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">stages:</span>
        {pipe.stages.map((s) => {
          const on = selectedStages.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleStage(s.key)}
              title={s.note ?? s.label}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
                on
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:text-foreground"
              )}
            >
              {s.key}
            </button>
          );
        })}
        {pipe.stages
          .filter((s) => selectedStages.includes(s.key))
          .flatMap((s) => s.rate_classes)
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((rc) => (
            <Badge key={rc} variant="outline" className="font-mono text-[10px]">
              {rc}
            </Badge>
          ))}
      </div>
    </div>
  );
}
