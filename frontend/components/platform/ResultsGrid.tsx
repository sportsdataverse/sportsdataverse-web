"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Flame, GripVertical, ListFilter, X } from "lucide-react";
import { cn } from "@lib/utils";
import { columnTip } from "@lib/platform/glossary";
import { cellTint, columnDomain, type Domain } from "@lib/platform/scales";

/**
 * Keyboard-first results grid for the platform data surfaces.
 *
 * Reading model
 * - Numeric cells carry a **bucketed diverging tint** measuring distance from
 *   the column's baseline (zero for signed metrics, the median otherwise), so a
 *   dense table reads as a heatmap before you read a single number. Toggle with
 *   `h` when the shading is in the way.
 * - Numerals are set in the condensed display face with `tabular-nums`, which
 *   is what lets columns stay narrow enough to scan many at once.
 *
 * Navigation
 * - Arrows / PageUp / PageDown / Home / End move a roving cell focus
 *   (Ctrl+Home/End jump to the corners); clicking a cell selects and highlights
 *   its whole row. A frozen `#` column keeps the original row number visible
 *   through horizontal scroll.
 * - `f` filters the focused column, `s` cycles its sort, `a`/`d` scroll
 *   horizontally by a viewport, `w`/`e` change row density, `h` toggles heat.
 *   The sticky status bar carries the legend so none of it is hidden knowledge.
 *
 * Linking
 * - `highlightIndex`/`onRowHover`/`onRowSelect` connect the grid to external
 *   visuals (a win-probability chart, a scatter) by ORIGINAL row index, so the
 *   link survives sorting and filtering.
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
  /** Fires when a row is selected via click/keyboard. */
  onRowSelect?: (index: number | null) => void;
};

type Sort = { col: number; dir: "asc" | "desc" } | null;

const PAGE = 20;
const DENSITY = ["py-0.5", "py-1", "py-2"] as const;

function compare(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1; // nulls sink, both directions
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
  const [order, setOrder] = useState<number[]>([]);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [heat, setHeat] = useState(true);
  const [density, setDensity] = useState(1);
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

  /** One encoding domain per column, computed once over the full result. */
  const domains = useMemo<(Domain | null)[]>(
    () => columns.map((name, c) => columnDomain(rows.map((r) => r[c]), name)),
    [columns, rows]
  );

  /** Filtered + sorted view; every row keeps its ORIGINAL index for numbering,
   *  selection identity, and external linking. */
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

  // Externally-driven highlight (chart hover): bring the row into view.
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
      bodyRef.current?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)?.focus();
    });
  }

  function selectRow(viewRow: number | null) {
    const orig = viewRow == null ? null : (view[viewRow]?.orig ?? null);
    setSelectedRow(orig);
    onRowSelect?.(orig);
  }

  function scrollByViewport(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
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
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const toRow = e.key === "Home" ? 0 : view.length - 1;
      const toCol = e.key === "Home" ? 0 : colOrder.length - 1;
      focusCell(e.ctrlKey ? toRow : r, toCol);
      if (e.ctrlKey) selectRow(toRow);
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "f") {
      e.preventDefault();
      setFilterOpen(colOrder[c]);
      requestAnimationFrame(() => filterInputRef.current?.focus());
      return;
    }
    if (key === "s") {
      e.preventDefault();
      cycleSort(colOrder[c]);
      return;
    }
    if (key === "a" || key === "d") {
      e.preventDefault();
      scrollByViewport(key === "a" ? -1 : 1);
      return;
    }
    if (key === "h") {
      e.preventDefault();
      setHeat((v) => !v);
      return;
    }
    if (key === "w" || key === "e") {
      e.preventDefault();
      setDensity((d) => Math.max(0, Math.min(DENSITY.length - 1, d + (key === "e" ? 1 : -1))));
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
    if (filterOpen === c) cycleSort(c);
    else {
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
  const pad = DENSITY[density];

  return (
    <div className="flex min-w-0 flex-col">
      {activeFilters.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
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
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        className="scrollbar-visible max-h-[32rem] max-w-full rounded-t-lg border border-border/60"
        onMouseLeave={() => onRowHover?.(null)}
      >
        {/* border-separate keeps cell borders painted under sticky headers,
            which border-collapse drops. */}
        <table role="grid" className="w-max min-w-full border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 border-b border-border/60 bg-muted px-2 py-2 text-right font-mono uppercase text-muted-foreground">
                #
              </th>
              {colOrder.map((ci) => {
                const name = columns[ci];
                const encoded = heat && domains[ci] !== null;
                return (
                  <th
                    key={name}
                    draggable
                    onDragStart={() => setDragCol(ci)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(ci)}
                    onDragEnd={() => setDragCol(null)}
                    className={cn(
                      "whitespace-nowrap border-b border-border/60 bg-muted p-0 align-top",
                      sort?.col === ci && "bg-primary/10",
                      dragCol === ci && "opacity-40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => headerClick(ci)}
                      title={columnTip(name, types?.[name])}
                      className={cn(
                        "flex w-full cursor-grab items-center gap-1 px-3 py-2 font-mono uppercase text-muted-foreground hover:text-foreground active:cursor-grabbing",
                        (sort?.col === ci || filters[ci]) && "text-primary"
                      )}
                    >
                      <GripVertical className="size-3 opacity-30" />
                      {name}
                      {encoded ? (
                        <Flame className="size-2.5 opacity-40" aria-label="value-encoded" />
                      ) : null}
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
                          onChange={(e) => setFilters((f) => ({ ...f, [ci]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Escape" || e.key === "Enter") {
                              if (e.key === "Escape") setFilters((f) => ({ ...f, [ci]: "" }));
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
              const rowBg = isSelected
                ? "bg-primary/15"
                : isLinked
                  ? "bg-score/15"
                  : "";
              return (
                <tr
                  key={orig}
                  data-row={r}
                  onMouseEnter={() => onRowHover?.(orig)}
                  className={cn("transition-colors", rowBg, !rowBg && "hover:bg-muted/60")}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 w-10 border-b border-border/40 px-2 text-right font-mono text-muted-foreground",
                      pad,
                      isSelected ? "bg-primary/15" : isLinked ? "bg-score/15" : "bg-card"
                    )}
                  >
                    {orig + 1}
                  </td>
                  {colOrder.map((ci, c) => {
                    const raw = cells[ci];
                    const numeric = domains[ci] !== null;
                    const tint = heat ? cellTint(raw, domains[ci]) : undefined;
                    return (
                      <td
                        key={ci}
                        data-cell={`${r}-${c}`}
                        tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                        onKeyDown={(e) => onCellKeyDown(e, r, c)}
                        onFocus={() => setFocus({ r, c })}
                        onClick={() => selectRow(isSelected ? null : r)}
                        title={raw ?? ""}
                        style={tint && !rowBg ? { backgroundColor: tint } : undefined}
                        className={cn(
                          "max-w-64 truncate whitespace-nowrap border-b border-border/40 px-3 outline-none",
                          pad,
                          numeric
                            ? "font-display text-right text-[13px] tabular-nums"
                            : "font-mono",
                          sort?.col === ci && !tint && !rowBg && "bg-muted/40",
                          "focus:ring-1 focus:ring-inset focus:ring-primary"
                        )}
                      >
                        {raw === null ? "∅" : raw}
                      </td>
                    );
                  })}
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

      {/* Status bar — the hotkeys are only real if they're discoverable. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-b-lg border border-t-0 border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-status-success" />
          {view.length.toLocaleString("en-US")}
          {view.length !== rows.length ? ` / ${rows.length.toLocaleString("en-US")}` : ""} rows
        </span>
        <span className="hidden sm:inline">↑↓←→ move</span>
        <span className="hidden sm:inline">
          <kbd className="text-foreground">f</kbd> filter
        </span>
        <span className="hidden sm:inline">
          <kbd className="text-foreground">s</kbd> sort
        </span>
        <span className="hidden md:inline">
          <kbd className="text-foreground">a</kbd>/<kbd className="text-foreground">d</kbd> scroll
        </span>
        <span className="hidden md:inline">
          <kbd className="text-foreground">w</kbd>/<kbd className="text-foreground">e</kbd> density
        </span>
        <button
          onClick={() => setHeat((v) => !v)}
          className={cn(
            "ml-auto inline-flex items-center gap-1 uppercase hover:text-foreground",
            heat && "text-primary"
          )}
          title="Shade numeric cells by distance from the column baseline (h)"
        >
          <Flame className="size-3" /> heat <kbd>h</kbd>
        </button>
      </div>
    </div>
  );
}
