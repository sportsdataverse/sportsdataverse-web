"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@components/ui/input";
import { UNMAPPED, matchesReleaseFilter } from "@lib/ecosystemStatus";

/**
 * The only hydrated part of the release-freshness table: it shows or hides the
 * server-rendered rows (`tr[data-tag]`) of `#tableId` in place, so the table
 * itself ships as plain HTML and every row is there with the filter empty.
 */
export default function ReleaseTagFilter({
  tableId,
  producers,
  hasUnmapped,
  total,
}: {
  tableId: string;
  producers: string[];
  hasUnmapped: boolean;
  total: number;
}) {
  const [query, setQuery] = useState("");
  const [producer, setProducer] = useState("");
  const [shown, setShown] = useState(total);

  function apply(nextQuery: string, nextProducer: string) {
    setQuery(nextQuery);
    setProducer(nextProducer);
    let n = 0;
    document
      .querySelectorAll<HTMLTableRowElement>(`#${tableId} tbody tr[data-tag]`)
      .forEach((row) => {
        const hit = matchesReleaseFilter(
          { tag: row.dataset.tag ?? "", producer: row.dataset.producer || null },
          nextQuery.trim(),
          nextProducer
        );
        row.hidden = !hit;
        if (hit) n += 1;
      });
    setShown(n);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => apply(e.target.value, producer)}
          placeholder="Filter by tag or producer…"
          className="pl-8"
          aria-label="Filter release tags by tag or producer"
          aria-controls={tableId}
        />
      </div>
      <select
        value={producer}
        onChange={(e) => apply(query, e.target.value)}
        aria-label="Filter release tags by producer"
        aria-controls={tableId}
        className="h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 font-inter text-sm sm:w-auto"
      >
        <option value="">All producers</option>
        {producers.map((p) => (
          <option key={p} value={p}>
            {p.split("/").pop()}
          </option>
        ))}
        {hasUnmapped ? <option value={UNMAPPED}>Unmapped</option> : null}
      </select>
      <p aria-live="polite" className="font-mono text-xs text-muted-foreground">
        {shown === total ? `${total} tags` : `${shown} of ${total} tags`}
        {shown === 0 ? " — nothing matches" : ""}
      </p>
    </div>
  );
}
