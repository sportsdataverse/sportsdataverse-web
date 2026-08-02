"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ListFilter, X } from "lucide-react";
import { cn } from "@lib/utils";
import { columnTip } from "@lib/platform/glossary";

/**
 * Keyboard-first results grid for the platform data surfaces.
 *
 * - Arrow keys / PageUp / PageDown / Home / End move a roving cell focus
 *   (Ctrl+Home/End jump to the corners); clicking any cell selects and
 *   highlights its WHOLE row (Escape clears).
 * - A frozen `#` column keeps the original row number visible during
 *   horizontal scroll (sticky on both axes at the header corner).
 * - Column headers drag-and-drop to reorder the view; click a header (or
 *   press `f` on a cell) for a within-table per-column filter; `s` cycles
 *   asc → desc → off sorting. All client-side over the fetched rows.
 * - Headers carry glossary tooltips (lib/platform/glossary).
 * - `highlightIndex`/`onRowHover` link the grid to external visuals (e.g. a
 *   win-probability chart): hovering the chart highlights + scrolls to the
 *   row, hovering a row reports back its ORIGINAL index.
 */

export type GridProps = {
  columns: string[];
  /** Row-major cells; null renders as ∅. */
  rows: (string | null)[][];
  /** Optional dtype per column (folded into the header tooltip). */
  types?: Record<string, string>;
  /** Externally-driven row highlight (original row index), e.g. from a chart. */
  highlightIndex?: number | null;
  /** Fires with the ORIGINAL row index under the pointer (null on leave). */
  onRowHover?: (index: number | null) => void;
  /** Fires when a row is selected via click/focus. */
  onRowSelect?: (index: number | null) => void;
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

export default function ResultsGrid({
  columns,
  rows,
  types,
  highlightIndex,
  onRowHover,
  onRowSelect,
}: GridProps) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [filterOpen, setFilterOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [selectedRow, setSelectedRow] = useState<number | null>(null); // original index
  /** View order of column indices — drag-and-drop permutes this. */
  const [order, setOrder] = useState<number[]>([]);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrder(columns.map((_, i) => i));
    setFilters({});
    setSort(null);
    setSelectedRow(null);
  }, [columns]);

  const colOrder = order.length === columns.length ? order : columns.map((_, i) => i);

  /** Filtered + sorted view; each row keeps its ORIGINAL index for numbering,
   *  selection identity, and chart linking. */
  const view = useMemo(() => {
    let out = rows.map((cells, orig) => ({ cells, orig }));
    const active = Object.entries(filters).filter(([, v]) => v !== "");
    if (active.length) {
      out = out.filter(({ cells }) =>
        active.every(([c, v]) =>
          (cells[Number(c)] ?? "").toLowerCase().includes(v.toLowerCase())
        )
      );
    }
    if (sort) {
      out = [...out].sort(
        (a, b) =>
          compare(a.cells[sort.col], b.cells[sort.col]) * (sort.dir === "asc" ? 1 : -1)
      );
    }
    return out;
  }, [rows, filters, sort]);

  const viewIndexByOrig = useMemo(() => {
    const m = new Map<number, number>();
    view.forEach((v, i) => m.set(v.orig, i));
    return m;
  }, [view]);

  // Externally-driven highlight (chart hover): scroll the row into view.
  useEffect(() => {
    if (highlightIndex == null) return;
    const vi = viewIndexByOrig.get(highlightIndex);
    if (vi == null) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-row="${vi}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, viewIndexByOrig]);

  function focusCell(r: number, c: number) {
    const nr = Math.max(0, Math.min(view.length - 1, r));
    const nc = Math.max(0, Math.min(colOrder.length - 1, c));
    setFocus({ r: nr, c: nc });
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)
        ?.focus();
    });
  }

  function selectRow(viewRow: number | null) {
    const orig = viewRow == null ? null : (view[viewRow]?.orig ?? null);
    setSelectedRow(orig);
    onRowSelect?.(orig);
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
      const [nr, nc] = nav[e.key];
      focusCell(nr, nc);
      selectRow(Math.max(0, Math.min(view.length - 1, nr)));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusCell(e.ctrlKey ? 0 : r, 0);
      if (e.ctrlKey) selectRow(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusCell(e.ctrlKey ? view.length - 1 : r, colOrder.length - 1);
      if (e.ctrlKey) selectRow(view.length - 1);
      return;
    }
    if (e.key === "f") {
      e.preventDefault();
      setFilterOpen(colOrder[c]);
      requestAnimationFrame(() => filterInputRef.current?.focus());
      return;
    }
    if (e.key === "s") {
      e.preventDefault();
      cycleSort(colOrder[c]);
      return;
    }
    if (e.key === "Escape") {
      if (filters[colOrder[c]]) setFilters((f) => ({ ...f, [colOrder[c]]: "" }));
      else if (selectedRow != null) selectRow(null);
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

  function dropOn(target: number) {
    if (dragCol == null || dragCol === target) return;
    setOrder((o) => {
      const src = o.indexOf(dragCol);
      const dst = o.indexOf(target);
      if (src < 0 || dst < 0) return o;
      const next = [...o];
      next.splice(src, 1);
      next.splice(dst, 0, dragCol);
      return next;
    });
    setDragCol(null);
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "");

  return (
    <div className="flex min-w-0 flex-col gap-2">
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
          arrows navigate · click selects row · drag headers to reorder · <kbd>f</kbd> filters ·{" "}
          <kbd>s</kbd> sorts
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="scrollbar-visible max-h-[32rem] max-w-full rounded-lg border border-border/60"
        onMouseLeave={() => onRowHover?.(null)}
      >
        <table role="grid" className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th className="sticky left-0 z-30 w-10 whitespace-nowrap bg-muted px-2 py-2 text-right uppercase text-muted-foreground">
                #
              </th>
              {colOrder.map((ci) => {
                const name = columns[ci];
                return (
                  <th
                    key={name}
                    draggable
                    onDragStart={() => setDragCol(ci)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(ci)}
                    onDragEnd={() => setDragCol(null)}
                    className={cn(
                      "whitespace-nowrap px-0 py-0 align-top",
                      dragCol === ci && "opacity-40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => headerClick(ci)}
                      title={columnTip(name, types?.[name])}
                      className={cn(
                        "flex w-full cursor-grab items-center gap-1 px-3 py-2 uppercase text-muted-foreground hover:text-foreground active:cursor-grabbing",
                        (sort?.col === ci || filters[ci]) && "text-primary"
                      )}
                    >
                      <GripVertical className="size-3 opacity-40" />
                      {name}
                      {sort?.col === ci ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : null}
                      {filters[ci] ? <ListFilter className="size-3" /> : null}
                    </button>
                    {filterOpen === ci ? (
                      <div className="px-2 pb-2">
                        <input
                          ref={filterInputRef}
                          value={filters[ci] ?? ""}
                          placeholder={`filter ${name}…`}
                          onChange={(e) =>
                            setFilters((f) => ({ ...f, [ci]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape" || e.key === "Enter") {
                              if (e.key === "Escape")
                                setFilters((f) => ({ ...f, [ci]: "" }));
                              setFilterOpen(null);
                            }
                          }}
                          onBlur={() => setFilterOpen(null)}
                          className="w-full rounded border border-input bg-card px-2 py-1 font-mono text-[11px] normal-case text-foreground"
                        />
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {view.map(({ cells, orig }, r) => {
              const isSelected = selectedRow === orig;
              const isLinked = highlightIndex === orig;
              return (
                <tr
                  key={orig}
                  data-row={r}
                  onMouseEnter={() => onRowHover?.(orig)}
                  className={cn(
                    "border-t border-border/60 transition-colors",
                    isSelected && "bg-primary/15",
                    isLinked && !isSelected && "bg-score/15",
                    !isSelected && !isLinked && "hover:bg-muted/60"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 w-10 whitespace-nowrap px-2 py-1 text-right text-muted-foreground",
                      isSelected
                        ? "bg-primary/15"
                        : isLinked
                          ? "bg-score/15"
                          : "bg-card"
                    )}
                  >
                    {orig + 1}
                  </td>
                  {colOrder.map((ci, c) => (
                    <td
                      key={ci}
                      data-cell={`${r}-${c}`}
                      tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                      onKeyDown={(e) => onCellKeyDown(e, r, c)}
                      onFocus={() => setFocus({ r, c })}
                      onClick={() => selectRow(isSelected ? null : r)}
                      title={cells[ci] ?? ""}
                      className={cn(
                        "max-w-64 truncate whitespace-nowrap px-3 py-1 outline-none",
                        "focus:ring-1 focus:ring-inset focus:ring-primary"
                      )}
                    >
                      {cells[ci] === null ? "∅" : cells[ci]}
                    </td>
                  ))}
                </tr>
              );
            })}
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
