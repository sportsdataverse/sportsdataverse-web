"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ListFilter, X } from "lucide-react";
import { cn } from "@lib/utils";

/**
 * Keyboard-first results grid for the platform query surfaces.
 *
 * - Arrow keys / PageUp / PageDown / Home / End move a roving cell focus
 *   (Ctrl+Home/End jump to the corners), so a result set can be scanned
 *   without touching the mouse.
 * - Clicking a column header (or pressing `f` on any of its cells) opens a
 *   within-table filter for that column; `s` (or header re-click) cycles
 *   asc → desc → off sorting. Filtering and sorting are client-side over the
 *   already-fetched rows — the API round trip is untouched.
 * - `Escape` clears the active column filter, then focus.
 */

export type GridProps = {
  columns: string[];
  /** Row-major cells; null renders as ∅. */
  rows: (string | null)[][];
  /** Optional dtype per column (shown in the header tooltip). */
  types?: Record<string, string>;
};

type Sort = { col: number; dir: "asc" | "desc" } | null;

const PAGE = 20;

function compare(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1; // nulls last
  if (b === null) return -1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a.trim() !== "" && b.trim() !== "") {
    return na - nb;
  }
  return a.localeCompare(b);
}

export default function ResultsGrid({ columns, rows, types }: GridProps) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [filterOpen, setFilterOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const view = useMemo(() => {
    let out = rows;
    const active = Object.entries(filters).filter(([, v]) => v !== "");
    if (active.length) {
      out = out.filter((row) =>
        active.every(([c, v]) =>
          (row[Number(c)] ?? "").toLowerCase().includes(v.toLowerCase())
        )
      );
    }
    if (sort) {
      out = [...out].sort(
        (a, b) => compare(a[sort.col], b[sort.col]) * (sort.dir === "asc" ? 1 : -1)
      );
    }
    return out;
  }, [rows, filters, sort]);

  function focusCell(r: number, c: number) {
    const nr = Math.max(0, Math.min(view.length - 1, r));
    const nc = Math.max(0, Math.min(columns.length - 1, c));
    setFocus({ r: nr, c: nc });
    // Roving tabindex: the cell is rendered focusable; find and focus it.
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)
        ?.focus();
    });
  }

  function onCellKeyDown(e: React.KeyboardEvent, r: number, c: number) {
    const nav: Record<string, [number, number]> = {
      ArrowDown: [r + 1, c],
      ArrowUp: [r - 1, c],
      ArrowRight: [r, c + 1],
      ArrowLeft: [r, c - 1],
      PageDown: [r + PAGE, c],
      PageUp: [r - PAGE, c],
    };
    if (e.key in nav) {
      e.preventDefault();
      focusCell(...nav[e.key]);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusCell(e.ctrlKey ? 0 : r, e.ctrlKey ? 0 : 0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusCell(e.ctrlKey ? view.length - 1 : r, columns.length - 1);
      return;
    }
    if (e.key === "f") {
      e.preventDefault();
      setFilterOpen(c);
      requestAnimationFrame(() => filterInputRef.current?.focus());
      return;
    }
    if (e.key === "s") {
      e.preventDefault();
      cycleSort(c);
      return;
    }
    if (e.key === "Escape") {
      if (filters[c]) setFilters((f) => ({ ...f, [c]: "" }));
      else (e.target as HTMLElement).blur();
    }
  }

  function cycleSort(c: number) {
    setSort((s) =>
      s?.col !== c ? { col: c, dir: "asc" } : s.dir === "asc" ? { col: c, dir: "desc" } : null
    );
  }

  function headerClick(c: number) {
    if (filterOpen === c) {
      cycleSort(c);
    } else {
      setFilterOpen(c);
      requestAnimationFrame(() => filterInputRef.current?.focus());
    }
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>
          {view.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} rows
        </span>
        {activeFilters.map(([c, v]) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary"
          >
            {columns[Number(c)]} ~ “{v}”
            <button
              aria-label={`clear ${columns[Number(c)]} filter`}
              onClick={() => setFilters((f) => ({ ...f, [Number(c)]: "" }))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <span className="ml-auto hidden text-[10px] sm:inline">
          arrows navigate · click header or <kbd>f</kbd> filters · <kbd>s</kbd> sorts
        </span>
      </div>

      <div className="max-h-[32rem] overflow-auto rounded-lg border border-border/60">
        <table role="grid" className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {columns.map((name, c) => (
                <th key={name} className="whitespace-nowrap px-0 py-0 align-top">
                  <button
                    type="button"
                    onClick={() => headerClick(c)}
                    title={types?.[name] ? `${name} (${types[name]})` : name}
                    className={cn(
                      "flex w-full items-center gap-1 px-3 py-2 uppercase text-muted-foreground hover:text-foreground",
                      (sort?.col === c || filters[c]) && "text-primary"
                    )}
                  >
                    {name}
                    {sort?.col === c ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : null}
                    {filters[c] ? <ListFilter className="size-3" /> : null}
                  </button>
                  {filterOpen === c ? (
                    <div className="px-2 pb-2">
                      <input
                        ref={filterInputRef}
                        value={filters[c] ?? ""}
                        placeholder={`filter ${name}…`}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [c]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape" || e.key === "Enter") {
                            if (e.key === "Escape")
                              setFilters((f) => ({ ...f, [c]: "" }));
                            setFilterOpen(null);
                            focusCell(0, c);
                          }
                        }}
                        onBlur={() => setFilterOpen(null)}
                        className="w-full rounded border border-input bg-card px-2 py-1 font-mono text-[11px] normal-case text-foreground"
                      />
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {view.map((row, r) => (
              <tr key={r} className="border-t border-border/60">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    data-cell={`${r}-${c}`}
                    tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                    onKeyDown={(e) => onCellKeyDown(e, r, c)}
                    onFocus={() => setFocus({ r, c })}
                    title={cell ?? ""}
                    className={cn(
                      "max-w-64 truncate whitespace-nowrap px-3 py-1 outline-none",
                      "focus:bg-primary/15 focus:ring-1 focus:ring-inset focus:ring-primary"
                    )}
                  >
                    {cell === null ? "∅" : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 ? (
          <p className="py-6 text-center font-mono text-sm text-muted-foreground">
            no rows match the column filters
          </p>
        ) : null}
      </div>
    </div>
  );
}
