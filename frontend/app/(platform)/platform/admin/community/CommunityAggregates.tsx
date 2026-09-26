"use client";

import { DIMENSIONS, dimension, labelOf, type Dim } from "@lib/community";
import type { Aggregate, CrossTab } from "./CommunityClient";

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string): string => {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
};

const cellLabel = (dim: Dim, value: string): string => (dim.key === "country" ? countryName(value) : labelOf(dim, value));

const selectClass = "min-w-[12rem] rounded-md border border-input bg-card px-3 py-1.5 font-inter text-sm";

function CrossTabTable({ crossTab, xDim, yDim }: { crossTab: CrossTab; xDim: Dim; yDim: Dim }) {
  if (!crossTab) return null;
  if (crossTab.x.length === 0 || crossTab.y.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for that pair.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left font-inter text-sm">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2">
              {xDim.label}
            </th>
            {crossTab.y.map((yv) => (
              <th key={yv} scope="col" className="px-4 py-2">
                {cellLabel(yDim, yv)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crossTab.x.map((xv) => (
            <tr key={xv} className="border-t border-border">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                {cellLabel(xDim, xv)}
              </th>
              {crossTab.y.map((yv) => {
                const n = crossTab.cells[xv]?.[yv] ?? 0;
                return (
                  <td key={yv} className="px-4 py-2 text-right tabular-nums">
                    {n ? n.toLocaleString() : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CommunityAggregates({
  aggregates,
  crossTab,
  xKey,
  yKey,
  onSetX,
  onSetY,
}: {
  aggregates: Aggregate[];
  crossTab: CrossTab;
  xKey: string;
  yKey: string;
  onSetX: (key: string) => void;
  onSetY: (key: string) => void;
}) {
  const xDim = xKey ? dimension(xKey) : undefined;
  const yDim = yKey ? dimension(yKey) : undefined;

  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer font-barlow text-lg font-semibold">Aggregates</summary>
      <div className="mt-4 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {aggregates.map((a) => (
            <div key={a.key}>
              <h3 className="font-inter text-sm font-semibold">{a.label}</h3>
              {a.counts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {a.counts.map((c) => (
                    <li key={c.value} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">
                        {a.key === "country" ? countryName(c.value) : c.label}
                      </span>
                      <span className="tabular-nums">{c.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-3">
            <select value={xKey} onChange={(e) => onSetX(e.target.value)} className={selectClass}>
              <option value="">Cross-tab rows…</option>
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <select value={yKey} onChange={(e) => onSetY(e.target.value)} className={selectClass}>
              <option value="">Cross-tab columns…</option>
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {xDim && yDim ? <CrossTabTable crossTab={crossTab} xDim={xDim} yDim={yDim} /> : null}
        </div>
      </div>
    </details>
  );
}
