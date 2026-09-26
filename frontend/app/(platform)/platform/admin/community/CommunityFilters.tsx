"use client";

import { DIMENSIONS, type Dim } from "@lib/community";
import type { Aggregate } from "./CommunityClient";

// Country codes have no fixed option list (content/geo.ts keeps only the
// codes); name them the way the rest of the app is told to — Intl.DisplayNames
// at render time, never a bundled name list.
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string): string => {
  try {
    return REGION_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
};

type FilterOption = { value: string; label: string; count?: number };

/** Option dimensions show every possible option (never just what's in the
 *  current results, or narrowing one filter would hide the box for another).
 *  Option-less dimensions (country, region, packages_*) only know what values
 *  exist from the current aggregates. */
function optionsFor(dim: Dim, aggByKey: Map<string, Aggregate>): FilterOption[] {
  if (dim.options) return dim.options;
  const counts = aggByKey.get(dim.key)?.counts ?? [];
  return counts.map((c) => ({ value: c.value, label: dim.key === "country" ? countryName(c.value) : c.label, count: c.count }));
}

function FilterGroup({
  dim,
  options,
  active,
  onToggle,
}: {
  dim: Dim;
  options: FilterOption[];
  active: Set<string>;
  onToggle: (key: string, value: string) => void;
}) {
  const checked = options.filter((o) => active.has(o.value)).length;
  return (
    <details className="rounded-md border border-border p-2" open={checked > 0}>
      <summary className="cursor-pointer font-inter text-sm font-medium">
        {dim.label}
        {checked ? ` (${checked})` : ""}
      </summary>
      {options.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No values yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {options.map((o) => (
            <li key={o.value}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active.has(o.value)}
                  onChange={() => onToggle(dim.key, o.value)}
                />
                <span className="truncate">
                  {o.label}
                  {o.count !== undefined ? ` (${o.count})` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function CommunityFilters({
  searchParams,
  aggregates,
  onToggle,
}: {
  searchParams: URLSearchParams;
  aggregates: Aggregate[];
  onToggle: (key: string, value: string) => void;
}) {
  const aggByKey = new Map(aggregates.map((a) => [a.key, a]));
  const groups = DIMENSIONS.map((dim) => {
    const active = new Set(searchParams.getAll(`f.${dim.key}`));
    return (
      <FilterGroup key={dim.key} dim={dim} options={optionsFor(dim, aggByKey)} active={active} onToggle={onToggle} />
    );
  });

  return (
    <>
      {/* Desktop: an always-open left column. */}
      <div className="hidden w-64 shrink-0 space-y-2 rounded-lg border border-border bg-card p-4 lg:block">
        <h2 className="font-barlow text-lg font-semibold">Filters</h2>
        <div className="space-y-2">{groups}</div>
      </div>
      {/* Mobile: the whole panel collapses too. */}
      <details className="rounded-lg border border-border bg-card p-4 lg:hidden">
        <summary className="cursor-pointer font-barlow text-lg font-semibold">Filters</summary>
        <div className="mt-3 space-y-2">{groups}</div>
      </details>
    </>
  );
}
