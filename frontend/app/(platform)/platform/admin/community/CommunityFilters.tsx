"use client";

import { DIMENSIONS, countryName, labelOf, type Count, type Dim } from "@lib/community";

type FilterOption = { value: string; label: string; count?: number };

const labelFor = (dim: Dim, value: string, fallback: string): string => (dim.key === "country" ? countryName(value) : fallback);

/** Option dimensions show every possible option (never just what's in the
 *  current results, or narrowing one filter would hide the box for another).
 *  Option-less dimensions (country, region, packages_*) take their choices
 *  from `options` — the unfiltered aggregate the list route computes over
 *  every person, never the current (possibly filtered) results, or ticking
 *  one value would hide every other one (I1). Any value the URL already has
 *  active is always included, even at count 0, so it can still be unticked
 *  once another filter makes the combined result empty. */
function optionsFor(dim: Dim, freeOptions: Record<string, Count[]>, active: Set<string>): FilterOption[] {
  if (dim.options) return dim.options;
  const counts = freeOptions[dim.key] ?? [];
  const byValue = new Map(counts.map((c) => [c.value, { value: c.value, label: labelFor(dim, c.value, c.label), count: c.count }]));
  for (const v of active) {
    if (!byValue.has(v)) byValue.set(v, { value: v, label: labelFor(dim, v, labelOf(dim, v)), count: 0 });
  }
  return [...byValue.values()];
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
  options,
  onToggle,
}: {
  searchParams: URLSearchParams;
  options: Record<string, Count[]>;
  onToggle: (key: string, value: string) => void;
}) {
  const groups = DIMENSIONS.map((dim) => {
    const active = new Set(searchParams.getAll(`f.${dim.key}`));
    return (
      <FilterGroup key={dim.key} dim={dim} options={optionsFor(dim, options, active)} active={active} onToggle={onToggle} />
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
