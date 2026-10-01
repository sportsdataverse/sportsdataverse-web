"use client";

import { Fragment, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, CircleMinus, CirclePlus, Flame, GripVertical, ListFilter, X } from "lucide-react";
import { cn } from "@lib/utils";
import { apiRows } from "@lib/platform/queryRun";
import { belowNote, belowQualifier, categoryOf, metricColumns, nSiblings, QUALIFIER_VOLUME, qualifierMin } from "@lib/platform/gridQualifier";
import { formatValue } from "@lib/platform/trends";
import { columnTip } from "@lib/platform/glossary";
import { revealInScroller } from "@lib/platform/scroll";
import { visibleRange, WINDOW_MIN } from "@lib/platform/gridVirtual";
import { identityColumn, labelColumn, pinIdentity, transposePinned } from "@lib/platform/gridCompare";
import { applyPreset, groupStarts, headerLabels, presetsFor, type Preset } from "@lib/platform/gridRegistry";
import {
  asPercentile,
  columnDomain,
  gridShade,
  nextTint,
  effectiveTint,
  pctSources,
  pctTint,
  type Domain,
  type PctSource,
  type TintMode,
} from "@lib/platform/scales";
import {
  compareCells,
  EMPTY_GRID,
  formatCell,
  gridByIndex,
  gridByName,
  MAX_PINS,
  type GridPin,
  type GridView,
} from "@lib/platform/viewState";

/**
 * Keyboard-first results grid for the platform data surfaces.
 *
 * Reading model
 * - Numeric cells carry a **bucketed diverging tint** measuring distance from
 *   the column's baseline (zero for signed metrics, the median otherwise), so a
 *   dense table reads as a heatmap before you read a single number. `h`
 *   cycles delta → percentile → off: percentile mode shades `X` by the
 *   producer's `X_pct` column (among qualifiers, null stays unshaded), and is
 *   skipped when the result carries no percentiles.
 * - Numerals are set in the condensed display face with `tabular-nums`, which
 *   is what lets columns stay narrow enough to scan many at once.
 *
 * Navigation
 * - Arrows / PageUp / PageDown / Home / End move a roving cell focus
 *   (Ctrl+Home/End jump to the corners); clicking a cell selects and highlights
 *   its whole row. A frozen `#` column keeps the original row number visible
 *   through horizontal scroll.
 * - `f` filters the focused column, `s` cycles its sort, `a`/`d` scroll
 *   horizontally by a viewport, `w`/`e` change row density, `h` cycles shading.
 *   The sticky status bar carries the legend so none of it is hidden knowledge.
 * - Above 200 filtered rows only the rows in view (plus overscan) are in the
 *   DOM, between two spacer rows; every row is exactly its density's height,
 *   which is what makes a row's place computable without rendering it.
 *
 * Linking
 * - `highlightIndex`/`onRowHover`/`onRowSelect` connect the grid to external
 *   visuals (a win-probability chart, a scatter) by ORIGINAL row index, so the
 *   link survives sorting and filtering.
 *
 * Comparing
 * - `p` pins the focused row, `c` the hovered one, the ⊕ in the `#` cell either
 *   by mouse; up to MAX_PINS. Pinned rows keep their place in the sort and show
 *   side by side in a tray under the grid; `z` shows only them. A result whose id
 *   column names every row once (pinIdentity) pins by that id, which rides in the
 *   URL as `grid.pin` and survives sort, filter, reload and a re-run; without one,
 *   pins are row indices for this session only.
 * - From `xl`, a rail beside the grid shows every value of the hovered (or
 *   focused) row, each producer percentile as a bar.
 *
 * Presets, separators and the frozen column (gridRegistry.ts)
 * - A pill per registry family with 2+ base columns in the result shows only
 *   that family's columns (`grid.preset=efficiency`), behind the frozen column;
 *   `All` restores every column. A 2px left border starts each family run in
 *   the displayed order, and a header reads the registry's short label with its
 *   side (`EPA/Play Off` / `EPA/Play Def`), the raw name in its tooltip.
 * - The frozen column is the label (the name), else the identity column: it
 *   sticks behind `#` through horizontal scroll whenever it is displayed first,
 *   which a preset guarantees and a drag may undo.
 *
 * Sample sizes and the qualifier
 * - An `X` with an `X_n` beside it marks its header `n`, and each cell's title
 *   carries its n.
 * - A CFB / NFL player leaderboard (`source`) gates its rows per team game
 *   (gridQualifier.ts); a row below the qualifier reads faded, unshaded, its
 *   identity and label cells full-strength, and `q` shows only the qualified
 *   (`grid.q=1`). Pinned rows always show; a selected or linked row, and the
 *   focused cell, read whole. The heat scale is then the qualified rows'. The
 *   gate is fetched for a single-season result only, after the grid renders.
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
  /** Sort / column filters / tint / pins / preset to start from (e.g. parsed from the URL); read
   *  on mount. Pins apply when their column is the result's pinIdentity; the ids the result
   *  lacks are dropped, and the status bar says how many. A preset the result lacks is dropped
   *  the same way. */
  initialView?: GridView;
  /** Fires with the view, keyed by column NAME, on mount and whenever sort /
   *  filters / tint / pins change. `pin` is null while pins are session-only (row
   *  indices). An effect dependency: pass a stable function (a state setter), or
   *  every render re-fires it. */
  onViewChange?: (view: GridView) => void;
  /** The Data API table the rows are (Query's, or the one an Explore file mirrors): a CFB / NFL
   *  player leaderboard fades the rows below its qualifier, which `q` hides. */
  source?: { schema: string; table: string } | null;
};

type Sort = { col: number; dir: "asc" | "desc" } | null;
/** Pins by `col`'s value (the result's pinIdentity), or by original row index
 *  (as a string) when `col` is null. `keys` is in pin order. */
type Pins = { col: string | null; keys: string[] };

/** Pins re-pointed at a (new) result: kept by id while the same id column still
 *  names every row, less the ids no longer in it; else none. */
function keepPins(p: Pins, columns: string[], rows: (string | null)[][]): Pins {
  const id = pinIdentity(columns, rows);
  const col = id < 0 ? null : columns[id];
  if (col === null || col !== p.col) return { col, keys: [] };
  const present = new Set(rows.map((r) => r[id]));
  return { col, keys: p.keys.filter((k) => present.has(k)) };
}

/** Says how many id pins a new result lost (a shared link's, a re-run's), rather than dropping them unseen. */
function missingNote(from: Pins, kept: Pins): string {
  const n = from.col === null ? 0 : from.keys.length - (kept.col === from.col ? kept.keys.length : 0);
  return n ? `${n} pinned ${n === 1 ? "row isn't" : "rows aren't"} in this result` : "";
}

const pinsOf = (v: GridView | undefined): Pins => ({ col: v?.pin?.col ?? null, keys: v?.pin?.values ?? [] });

/** The column that stays put through horizontal scroll: the label (the name a reader knows the
 *  row by), else the identity column, else none (-1). A sticky player_id alone tells a reader
 *  nothing, which is why the label comes first. */
const frozenColumn = (columns: string[]) => {
  const label = labelColumn(columns);
  return label >= 0 ? label : identityColumn(columns);
};
/** `preset` when the result offers it, else null. */
const keepPreset = (preset: string | null, presets: Preset[]) => (preset !== null && presets.some((p) => p.family === preset) ? preset : null);
/** The grid's `order` under `preset`: its columns behind the frozen one; without one, every column. */
function orderFor(columns: string[], presets: Preset[], preset: string | null): number[] {
  const p = presets.find((x) => x.family === preset);
  return p ? applyPreset(columns, frozenColumn(columns), p) : columns.map((_, i) => i);
}
/** Says a preset the result lacks (a link from another table) was dropped, rather than dropping it unseen. */
const presetNote = (from: string | null, kept: string | null) => (from !== null && kept === null ? `no ${from} preset for this result` : "");
const notes = (...parts: string[]) => parts.filter(Boolean).join(" · ");

const PAGE = 20;
const DENSITY = ["py-0.5", "py-1", "py-2"] as const;
/** Exact row height (px) per density; the tallest content + padding + border fits in each. */
const ROW_H = [24, 28, 36] as const;
const OVERSCAN = 10;

/** Scroll `box` just enough to show view row `r`, rendered or not: every row is
 *  `rowH` tall and the top spacer keeps the tbody's top at row 0's, so the tbody
 *  (which sits below the header) places any row. */
function revealRow(box: HTMLElement, body: HTMLElement, r: number, rowH: number) {
  const top = body.getBoundingClientRect().top + r * rowH;
  revealInScroller(box, { getBoundingClientRect: () => ({ top, bottom: top + rowH }) });
}

export default function ResultsGrid({
  columns,
  rows,
  types,
  highlightIndex,
  onRowHover,
  onRowSelect,
  initialView,
  onViewChange,
  source,
}: GridProps) {
  const start = gridByIndex(initialView ?? EMPTY_GRID, columns);
  const [filters, setFilters] = useState<Record<number, string>>(start.filters);
  const [filterOpen, setFilterOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>(start.sort);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [selectedRow, setSelectedRow] = useState<number | null>(null); // original index
  const [preset, setPreset] = useState<string | null>(() => keepPreset(start.preset, presetsFor(columns)));
  const [order, setOrder] = useState<number[]>(() => orderFor(columns, presetsFor(columns), start.preset));
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [tint, setTint] = useState<TintMode>(start.tint);
  /** `q`'s intent, kept while the result has no gate (yet), like `tint`'s. */
  const [qualified, setQualified] = useState(start.qualified);
  const [density, setDensity] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(512);
  const scrollFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);
  const focusPending = useRef(false);
  /** A body cell has focus, or had it until its row unmounted (tbody onFocus/onBlur). */
  const ownsFocus = useRef(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [pins, setPins] = useState<Pins>(() => keepPins(pinsOf(initialView), columns, rows));
  const [pinnedOnly, setPinnedOnly] = useState(false);
  /** The status bar's live message: a pin, an unpin, a refusal, pins a result lacks. */
  const [notice, setNotice] = useState(() => notes(missingNote(pinsOf(initialView), pins), presetNote(start.preset, preset)));
  /** A row the next view change keeps focused wherever it lands (`z`), by original index. */
  const followRow = useRef<number | null>(null);
  /** The focused cell's row, by original index (for the gate's arrival under `q`). */
  const focusedOrig = useRef<number | null>(null);
  const showInRail = useRef<(orig: number | null) => void>(null);

  // Re-point the view whenever the columns change (a new query result), by NAME:
  // a sort or filter follows its column to its new position, and drops out when
  // the column is gone. Columns are compared by CONTENT — QueryBuilder rebuilds
  // its array every render, and an identity check reset sort and filters on each
  // keystroke — so `cols` (the last content-distinct array) is also a stable
  // memo/effect dependency. Adjusted during render (React's documented pattern
  // for "reset state when a prop changes"), so there's no stale frame.
  const [cols, setCols] = useState(columns);
  if (cols.join("\u0001") !== columns.join("\u0001")) {
    const next = gridByIndex(gridByName({ sort, filters, tint, pin: null, qualified, preset }, cols), columns);
    setCols(columns);
    const nextPresets = presetsFor(columns);
    const keptPreset = keepPreset(preset, nextPresets);
    setPreset(keptPreset);
    setOrder(orderFor(columns, nextPresets, keptPreset));
    setFilters(next.filters);
    setSort(next.sort);
    setSelectedRow(null);
    const kept = keepPins(pins, columns, rows);
    setPins(kept);
    setNotice(notes(missingNote(pins, kept), presetNote(preset, keptPreset)));
  }
  // A rerun with the same columns keeps sort and filters, but the selected index
  // would point at a different row. Both row sources are stable per result.
  const [lastRows, setLastRows] = useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setSelectedRow(null);
    const kept = keepPins(pins, columns, rows);
    setPins(kept);
    setNotice(missingNote(pins, kept));
  }

  // Only ids reach the URL; row-index pins are this session's.
  const urlPin: GridPin | null = useMemo(
    () => (pins.col && pins.keys.length ? { col: pins.col, values: pins.keys } : null),
    [pins]
  );
  useEffect(() => {
    onViewChange?.(gridByName({ sort, filters, tint, pin: urlPin, qualified, preset }, cols));
  }, [sort, filters, tint, urlPin, qualified, preset, cols, onViewChange]);

  const idCol = pins.col === null ? -1 : cols.indexOf(pins.col);
  const origById = useMemo(() => new Map(idCol < 0 ? [] : rows.map((r, i) => [r[idCol], i])), [rows, idCol]);
  /** Pinned rows by ORIGINAL index, in pin order. */
  const pinned = useMemo(
    () =>
      pins.keys
        .map((k) => (idCol < 0 ? Number(k) : origById.get(k)))
        .filter((o): o is number => o !== undefined && o < rows.length),
    [pins, idCol, origById, rows.length]
  );
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);
  // The last unpin, however it happened, also leaves pinned-only.
  if (pinnedOnly && !pinned.length) setPinnedOnly(false);
  const onlyPinned = pinnedOnly && pinned.length > 0;
  const keepOnly = onlyPinned ? pinnedSet : null;

  const labelCol = labelColumn(cols);
  /** A row as the tray, the rail and the status bar name it. */
  const nameOf = (orig: number) => rowName(rows[orig], labelCol, idCol) ?? `Row ${orig + 1}`;
  /** The same with its row number, for a button's accessible name: "Ann, row 3" or "row 3". */
  const whoOf = (orig: number) => {
    const name = rowName(rows[orig], labelCol, idCol);
    return name == null ? `row ${orig + 1}` : `${name}, row ${orig + 1}`;
  };

  function togglePin(orig: number) {
    const key = idCol < 0 ? String(orig) : rows[orig][idCol]!;
    const n = pins.keys.length;
    if (pins.keys.includes(key)) {
      setPins({ ...pins, keys: pins.keys.filter((k) => k !== key) });
      setNotice(`Unpinned ${nameOf(orig)}, ${n - 1} of ${MAX_PINS}`);
    } else if (n >= MAX_PINS) {
      setNotice(`${MAX_PINS} rows pinned, the most: unpin one first`);
    } else {
      setPins({ ...pins, keys: [...pins.keys, key] });
      setNotice(`Pinned ${nameOf(orig)}, ${n + 1} of ${MAX_PINS}`);
    }
  }

  /** The displayed columns by original index: every column (as dragged), or a preset's subset
   *  behind the frozen one. A shorter order is fine; one naming a column twice or out of range
   *  (the last result's, for one render) shows every column. */
  const colOrder = useMemo(() => {
    const valid =
      order.length > 0 && order.length <= cols.length && new Set(order).size === order.length && order.every((i) => i >= 0 && i < cols.length);
    return valid ? order : cols.map((_, i) => i);
  }, [order, cols]);
  const presets = useMemo(() => presetsFor(cols), [cols]);
  const frozen = frozenColumn(cols);
  /** The displayed names: separators and header labels follow the DISPLAYED order, not the result's. */
  const displayed = useMemo(() => colOrder.map((ci) => cols[ci]), [colOrder, cols]);
  const groups = useMemo(() => groupStarts(displayed), [displayed]);
  const heads = useMemo(() => headerLabels(displayed), [displayed]);
  // The # column's width, which the frozen column sticks behind: w-10 is its floor, not its width
  // (the row number and the pin button grow it: 54 px at 100 rows, more at 10k).
  const hashRef = useRef<HTMLTableCellElement>(null);
  const [hashW, setHashW] = useState(40);
  useLayoutEffect(() => {
    const el = hashRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHashW(el.offsetWidth));
    ro.observe(el);
    setHashW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  function pickPreset(family: string | null) {
    const next = orderFor(cols, presets, family);
    setPreset(family);
    setOrder(next);
    // the focused column may be gone: the one tab stop must be a cell that exists
    setFocus((f) => ({ ...f, c: Math.min(f.c, next.length - 1) }));
    setNotice("");
  }

  /** The longest cell per column as shown (formatCell) over the whole result, for the windowed grid's sizer row. */
  // ponytail: formats every cell once per result (~75 ms at 10k x 20, ~1.9 s at 50k x 61). If big
  // pulls stall, size by the raw decimal cut to 3 places (never narrower than what formatCell shows).
  const widest = useMemo(() => {
    if (rows.length <= WINDOW_MIN) return null;
    const digits = (v: string) => v.replace(/\D/g, "").length;
    return cols.map((_, c) => {
      let w = "";
      for (const r of rows) {
        const v = formatCell(r[c]) ?? "∅";
        // ponytail: character count, not measured width; a tie goes to more digits (10.25 over -0.25).
        // Measure with a canvas if a proportional face ever makes the shorter string the wider one.
        if (v.length > w.length || (v.length === w.length && digits(v) > digits(w))) w = v;
      }
      return w;
    });
  }, [cols, rows]);
  /** Column → the producer percentile column that shades it, with its scale. */
  const pcts = useMemo(() => pctSources(cols, rows), [cols, rows]);
  const hasPct = pcts.size > 0;
  const shownTint = effectiveTint(tint, hasPct);
  const nOf = useMemo(() => nSiblings(cols), [cols]);

  // The leaderboard qualifier, a gate per team game (gridQualifier.ts) with its minimum read from
  // league_averages for the result's one season: the grid renders first, the rows fade when it lands.
  const board = source ? categoryOf(source.schema, source.table) : null;
  const unit = board ? QUALIFIER_VOLUME[board.category] : "";
  const volCol = cols.indexOf(unit);
  const gamesCol = cols.indexOf("team_games");
  const seasonCol = cols.indexOf("season");
  const seasons = useMemo(() => new Set(seasonCol < 0 ? [] : rows.map((r) => r[seasonCol])), [rows, seasonCol]);
  /** The first column the gate needs that the result lacks (a `select` can leave any out). */
  const missing = board ? [unit, "team_games", "season"].find((c) => !cols.includes(c)) : undefined;
  const gated = board !== null && !missing;
  const season = gated && seasons.size === 1 ? [...seasons][0] : null;
  const { data: qmin, error: qminError } = useSWR(
    season != null ? ["qualifier", source!.schema, board!.entity, board!.category, season] : null,
    ([, schema, entity, category, s]: string[]) =>
      apiRows({ schema, table: "league_averages", season: s, entity, category, select: "metric,qualifier_min,level", limit: "500" }).then(
        (r) => qualifierMin(r, schema)
      ),
    // one answer per season: a failure says "unavailable" rather than retrying behind the reader
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false }
  );
  /** Each row below the qualifier (true), at or above it (false), or unknown (null, never faded); null with no gate. */
  const below = useMemo(
    () => (qmin == null ? null : rows.map((r) => belowQualifier(r[volCol], r[gamesCol], qmin))),
    [rows, volCol, gamesCol, qmin]
  );
  const onlyQualified = qualified && below !== null;
  const qminText = qmin == null ? "" : formatValue(qmin, undefined, false);
  const perGame = `${qminText} ${unit} per team game`;
  /** What `q` says when it has nothing to do. */
  const qNote = !board
    ? "no qualifier for this table"
    : missing
      ? `no qualifier: ${missing} isn't in the selected columns`
      : season == null
        ? "qualifier shown for single-season results"
        : qminError
          ? "qualifier unavailable"
          : qmin === undefined
            ? "qualifier still loading"
            : `no qualifier for ${season}`;
  /** The columns a row below the qualifier fades, by type and name (never by the values' spread). */
  const metric = useMemo(() => metricColumns(cols, rows, types), [cols, rows, types]);

  /** One encoding domain per column over the result; once a gate lands, over its qualified rows (the rows
   *  below it go unshaded, and their 1-dropback extremes would stretch the scale), unless they can't scale
   *  a column alone (fewer than 4 values, or one value), which keeps the result's. */
  const domains = useMemo<(Domain | null)[]>(
    () =>
      cols.map((name, c) => {
        const all = columnDomain(rows.map((r) => r[c]), name);
        if (!all || !below) return all;
        return columnDomain(rows.filter((_, i) => below[i] !== true).map((r) => r[c]), name) ?? all;
      }),
    [cols, rows, below]
  );

  /** Filtered + sorted view; every row keeps its ORIGINAL index for numbering,
   *  selection identity, and external linking. */
  const view = useMemo(() => {
    let out = rows.map((cells, orig) => ({ cells, orig }));
    if (keepOnly) out = out.filter(({ orig }) => keepOnly.has(orig));
    // q: the rows below the qualifier go; a pinned row always shows
    if (onlyQualified) out = out.filter(({ orig }) => below![orig] !== true || pinnedSet.has(orig));
    const active = Object.entries(filters).filter(([, v]) => v !== "");
    // The raw cell, not the shown one: a grid.f link keeps its rows, and a shown
    // value is the raw one's prefix unless its last digit rounded up.
    if (active.length) {
      out = out.filter(({ cells }) =>
        active.every(([c, v]) =>
          (cells[Number(c)] ?? "").toLowerCase().includes(v.toLowerCase())
        )
      );
    }
    if (sort) {
      out = [...out].sort((a, b) => compareCells(a.cells[sort.col], b.cells[sort.col], sort.dir));
    }
    return out;
  }, [rows, filters, sort, keepOnly, onlyQualified, below, pinnedSet]);

  const viewIndexByOrig = useMemo(() => {
    const m = new Map<number, number>();
    view.forEach((v, i) => m.set(v.orig, i));
    return m;
  }, [view]);

  const rowH = ROW_H[density];
  const windowed = view.length > WINDOW_MIN;
  const win = visibleRange({ scrollTop, viewport, rowHeight: rowH, total: view.length, overscan: OVERSCAN });
  // The focused row (clamped: a filter can shrink the view under it) stays mounted outside the
  // window, between split spacers, so wheeling it out of view never drops focus; it also holds the
  // roving tab stop, so Tab can always enter the grid.
  const focusRow = Math.min(focus.r, view.length - 1);
  const focusCol = Math.min(focus.c, colOrder.length - 1);
  const shown: number[] = [];
  if (focusRow >= 0 && focusRow < win.start) shown.push(focusRow);
  for (let r = win.start; r < win.end; r++) shown.push(r);
  if (focusRow >= win.end) shown.push(focusRow);
  const tail = view.length - (shown.at(-1) ?? -1) - 1; // rows below the last one rendered

  /** Read the scroller into state. The sticky header covers the top of the box,
   *  so rows show in what's left of it; and it covers exactly the rows scrolled
   *  past, so the first row in view is still scrollTop / rowH. */
  function syncScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewport(el.clientHeight - (el.querySelector("thead")?.offsetHeight ?? 0));
  }
  // Becoming windowed (a filter cleared) moves no scrollbar, so no scroll event says where we are;
  // and a resize (a grid mounted hidden, then shown; a filter box opening in the header) changes
  // the room for rows without one either.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!windowed || !el) return;
    syncScroll();
    const ro = new ResizeObserver(syncScroll);
    ro.observe(el);
    const head = el.querySelector("thead");
    if (head) ro.observe(head);
    return () => ro.disconnect();
  }, [windowed]);

  // Externally-driven highlight (chart hover): bring the row into view in the
  // grid's own scroller, never the page, and render its window before paint.
  useLayoutEffect(() => {
    if (highlightIndex == null) return;
    const vi = viewIndexByOrig.get(highlightIndex);
    if (vi == null || !scrollerRef.current || !bodyRef.current) return;
    revealRow(scrollerRef.current, bodyRef.current, vi, rowH);
    if (windowed) syncScroll();
  }, [highlightIndex, viewIndexByOrig, rowH, windowed]);

  // Focus lands after the render that put its row in the window (see focusCell).
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    bodyRef.current?.querySelector<HTMLElement>(`[data-cell="${focus.r}-${focus.c}"]`)?.focus();
  }, [focus]);

  function focusCell(r: number, c: number) {
    const nr = Math.max(0, Math.min(view.length - 1, r));
    const nc = Math.max(0, Math.min(colOrder.length - 1, c));
    // Scroll first, even to a row that isn't rendered, and render that window
    // in the same pass as the focus change, so the cell exists when focused.
    if (scrollerRef.current && bodyRef.current) revealRow(scrollerRef.current, bodyRef.current, nr, rowH);
    if (windowed) syncScroll();
    focusPending.current = true;
    setFocus({ r: nr, c: nc });
  }

  // The gate landing under grid.q=1 drops rows: the focused row stays focused wherever it lands, as
  // with q. Before the effect below, which reads followRow in the same commit.
  const gateOn = below !== null;
  useLayoutEffect(() => {
    if (gateOn && qualified) followRow.current = focusedOrig.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on the gate's arrival only
  }, [gateOn]);

  // New rows or row heights (a sort, a filter, a density step) while a cell has focus: keep the
  // focused POSITION focused and in view. Rows are keyed by original index, so the focused row
  // itself moves, and out of the window it unmounts, which drops focus to <body>.
  // `z` names the row to keep instead: it stays focused wherever the new view puts it.
  useLayoutEffect(() => {
    const follow = followRow.current;
    followRow.current = null;
    if (ownsFocus.current && view.length) focusCell((follow == null ? undefined : viewIndexByOrig.get(follow)) ?? focus.r, focus.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a change of rows or height only, never a focus move
  }, [view, rowH]);

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
    // The letter keys are bare: Ctrl/Cmd+C copies, +P prints, +F finds, +Z undoes.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
      setTint(nextTint(shownTint, hasPct));
      return;
    }
    if (key === "p" || key === "c") {
      e.preventDefault();
      // c: the row under the pointer now (a scroll moves rows under a still pointer)
      const under = key === "c" ? bodyRef.current?.querySelector<HTMLElement>("tr[data-row]:hover") : null;
      const orig = key === "p" ? view[r]?.orig : under ? view[Number(under.dataset.row)]?.orig : undefined;
      if (orig == null) {
        setNotice("c pins the row under the pointer: none is");
        return;
      }
      // pinned-only: an unpin drops the row, so keep the focused row if it stays
      if (onlyPinned) followRow.current = view[r]?.orig ?? null;
      togglePin(orig);
      return;
    }
    if (key === "z") {
      e.preventDefault();
      if (!pinned.length) {
        setNotice("nothing pinned: p pins the focused row");
        return;
      }
      followRow.current = view[r]?.orig ?? null;
      setPinnedOnly((v) => !v);
      setNotice("");
      return;
    }
    if (key === "q") {
      e.preventDefault();
      if (below === null) {
        setNotice(qNote);
        return;
      }
      followRow.current = view[r]?.orig ?? null;
      setQualified((v) => !v);
      setNotice("");
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
    if (preset && (dragCol === frozen || target === frozen)) return; // a preset keeps the frozen column first
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
    // From xl the rail's column is always there, so the grid's width never moves when it fills.
    <div className="min-w-0 xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:items-start xl:gap-4">
      <div className="flex min-w-0 flex-col">
        {presets.length || activeFilters.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs">
            {presets.length ? (
              <div role="group" aria-label="Column presets" className="flex flex-wrap items-center gap-1.5">
                {[null, ...presets.map((p) => p.family)].map((family) => (
                  <button
                    key={family ?? "all"}
                    type="button"
                    aria-pressed={preset === family}
                    onClick={() => pickPreset(family)}
                    title={family === null ? "Every column, in the result's order" : `Only the ${family} columns, behind the name`}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wide transition-colors",
                      // weight as well as fill: the chosen one reads without colour
                      preset === family ? "bg-primary font-bold text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    {family ?? "All"}
                  </button>
                ))}
              </div>
            ) : null}
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

        {/* No scroll anchoring: it chased a sorted row's old DOM node, moving the view on a sort. */}
        <div
          ref={scrollerRef}
          className="scrollbar-visible max-h-[32rem] max-w-full rounded-t-lg border border-border/60 [overflow-anchor:none]"
          onMouseLeave={() => onRowHover?.(null)}
          onScroll={() => {
            if (!windowed || scrollFrame.current) return;
            scrollFrame.current = requestAnimationFrame(() => {
              scrollFrame.current = 0;
              syncScroll();
            });
          }}
        >
          {/* border-separate keeps cell borders painted under sticky headers,
              which border-collapse drops. */}
          <table role="grid" aria-rowcount={view.length + 1} className="w-max min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-20">
              <tr aria-rowindex={1}>
                <th
                  ref={hashRef}
                  className="sticky left-0 z-30 border-b border-r border-border/60 bg-muted px-2 py-2 text-right font-mono uppercase text-muted-foreground"
                >
                  #
                </th>
                {colOrder.map((ci, c) => {
                  const name = columns[ci];
                  const encoded =
                    shownTint === "delta" ? domains[ci] !== null : shownTint === "pct" && pcts.has(ci);
                  // The frozen column sticks when it is displayed first: always under a preset (applyPreset
                  // puts it there and dropOn keeps it); otherwise wherever the reader dragged it.
                  const stuck = c === 0 && ci === frozen;
                  const head = heads[c];
                  // the registry label, then the glossary's dtype and description; an unresolved column is the glossary tip alone
                  const tip = head.text === name ? columnTip(name, types?.[name]) : head.title + columnTip(name, types?.[name]).slice(name.length);
                  return (
                    <th
                      key={name}
                      data-col={name}
                      draggable={!(preset && stuck)}
                      onDragStart={() => setDragCol(ci)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => dropOn(ci)}
                      onDragEnd={() => setDragCol(null)}
                      style={stuck ? { left: hashW } : undefined}
                      className={cn(
                        // bold was the global th rule's (and the UA th default); say it here
                        "whitespace-nowrap border-b border-r border-border/60 p-0 align-top font-bold",
                        // opaque: a translucent tint on this sticky th let scrolled rows show through
                        sort?.col === ci ? "bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-muted))]" : "bg-muted",
                        groups.has(c) && "border-l-2 border-l-border",
                        stuck && "sticky z-30",
                        dragCol === ci && "opacity-40"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => headerClick(ci)}
                        title={tip}
                        className={cn(
                          "flex w-full cursor-grab items-center gap-1 px-3 py-2 font-mono uppercase text-muted-foreground hover:text-foreground active:cursor-grabbing",
                          (sort?.col === ci || filters[ci]) && "text-primary"
                        )}
                      >
                        <GripVertical className="size-3 opacity-30" />
                        {head.text}
                        {nOf.has(ci) ? (
                          <abbr title={`sample size in ${columns[nOf.get(ci)!]}`} className="text-[9px] font-normal normal-case no-underline">
                            n
                          </abbr>
                        ) : null}
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
            <tbody
              ref={bodyRef}
              onFocus={() => (ownsFocus.current = true)}
              onBlur={(e) => {
                const from = e.target;
                if (e.relatedTarget) {
                  // the filter box counts as leaving: its keystrokes change the rows
                  if (!e.currentTarget.contains(e.relatedTarget)) ownsFocus.current = false;
                } else {
                  // Focus went nowhere: a click on the page, another window; or the cell's row
                  // unmounted, which the restore effect has handled by the time this runs.
                  queueMicrotask(() => {
                    if (from.isConnected) ownsFocus.current = false;
                  });
                }
              }}
            >
              {/* flatMap: one flat list keyed by original index (a nested array is keyed by its
                  position, which remounts every row on each scroll and drops focus) */}
              {shown.flatMap((r, i) => {
                const { cells, orig } = view[r];
                const gap = r - (i ? shown[i - 1] + 1 : 0);
                const isSelected = selectedRow === orig;
                const isLinked = highlightIndex === orig;
                const isPinned = pinnedSet.has(orig);
                const faded = below?.[orig] === true;
                const why = faded ? belowNote(cells[volCol]!, cells[gamesCol]!, qmin!, unit) : undefined;
                const rowBg = isSelected
                  ? "bg-primary/15"
                  : isLinked
                    ? "bg-score/15"
                    : "";
                // opaque, like the sorted header: a translucent tint on a sticky cell lets horizontally
                // scrolled cells show through. The # cell and the frozen cell share it.
                const stickBg = isSelected
                  ? "bg-[color-mix(in_oklab,var(--color-primary)_15%,var(--color-card))]"
                  : isLinked
                    ? "bg-[color-mix(in_oklab,var(--color-score)_15%,var(--color-card))]"
                    : isPinned
                      ? "bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card))]"
                      : null;
                return [
                  // Keyed by place, not by the row after it: the only gaps are the leading one and the
                  // one beside the focused row kept mounted out of the window. A leading spacer re-keyed
                  // by a sort was deleted mid-commit, and the content it held up collapsed long enough
                  // to clamp scrollTop.
                  gap ? (
                    <tr key={i ? "gap-focus" : "gap-head"} aria-hidden style={{ height: gap * rowH }}>
                      <td colSpan={colOrder.length + 1} />
                    </tr>
                  ) : null,
                  <tr
                    key={orig}
                    data-row={r}
                    aria-rowindex={r + 2}
                    style={{ height: rowH }}
                    onMouseEnter={() => {
                      showInRail.current?.(orig);
                      onRowHover?.(orig);
                    }}
                    className={cn("group transition-colors", rowBg, !rowBg && "hover:bg-muted/60")}
                  >
                    <td
                      title={why}
                      className={cn(
                        "sticky left-0 z-10 w-10 border-b border-r border-border/40 px-2 text-right font-mono text-muted-foreground",
                        pad,
                        stickBg ?? "bg-card"
                      )}
                    >
                      {/* a 16px line at most, so the row keeps its exact height */}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          tabIndex={-1} // the roving tab stop stays on the cells
                          aria-label={`Pin ${whoOf(orig)}`}
                          aria-pressed={isPinned}
                          onMouseDown={(e) => e.preventDefault()} // and so does the focus
                          onClick={() => togglePin(orig)}
                          title={isPinned ? "Unpin (p)" : "Pin to compare (p)"}
                          className={cn(
                            // a 24px target around the 12px icon, drawn outside the row's layout
                            "relative rounded-sm before:absolute before:-inset-1.5 hover:text-primary",
                            isPinned ? "text-primary" : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-40"
                          )}
                        >
                          {isPinned ? <CircleMinus className="size-3" /> : <CirclePlus className="size-3" />}
                        </button>
                        {orig + 1}
                        {why ? <span className="sr-only">, {why}</span> : null}
                      </div>
                    </td>
                    {colOrder.map((ci, c) => {
                      const raw = cells[ci];
                      const numeric = domains[ci] !== null;
                      // below the qualifier: no heat (its extremes would draw the strongest buckets)
                      const shade = faded ? undefined : gridShade(shownTint, cells, ci, domains[ci], pcts.get(ci));
                      const n = nOf.get(ci);
                      const fades = faded && metric.has(ci);
                      // a name or an id, which columnDomain never shades: its only inline style is `left`
                      const stuck = c === 0 && ci === frozen;
                      return (
                        <td
                          key={ci}
                          data-cell={`${r}-${c}`}
                          tabIndex={focusRow === r && focusCol === c ? 0 : -1}
                          onKeyDown={(e) => onCellKeyDown(e, r, c)}
                          onFocus={() => {
                            focusedOrig.current = orig;
                            setFocus({ r, c });
                            showInRail.current?.(orig);
                          }}
                          onClick={() => selectRow(isSelected ? null : r)}
                          title={
                            (n === undefined ? (raw ?? "") : `${raw ?? "∅"} · n = ${cells[n] ?? "∅"}`) +
                            (fades ? ` · below the qualifier (${qminText} per team game)` : "")
                          }
                          style={stuck ? { left: hashW } : shade && !rowBg ? { backgroundColor: shade } : undefined}
                          className={cn(
                            "max-w-64 truncate whitespace-nowrap border-b border-r border-border/40 px-3 outline-none",
                            pad,
                            numeric
                              ? "font-display text-right text-[13px] tabular-nums"
                              : "font-mono",
                            groups.has(c) && "border-l-2 border-l-border",
                            // the frozen cell: sticky behind #, and opaque (sorted included) for the same reason as #
                            stuck && "sticky z-10",
                            stuck && (stickBg ?? (sort?.col === ci ? "bg-[color-mix(in_oklab,var(--color-muted)_40%,var(--color-card))]" : "bg-card")),
                            !stuck && sort?.col === ci && !shade && !rowBg && "bg-muted/40",
                            // below the qualifier the metrics recede (ids, names and text stay), at 60%:
                            // DESIGN.md's measured contrast. A selected or linked row, and the focused
                            // cell, read whole: their tints would take the faded text under 4.5:1.
                            fades && !rowBg && "opacity-60 focus:opacity-100",
                            "focus:ring-1 focus:ring-inset focus:ring-primary"
                          )}
                        >
                          {raw === null ? "∅" : formatCell(raw)}
                        </td>
                      );
                    })}
                  </tr>,
                ];
              })}
              {tail ? (
                <tr aria-hidden style={{ height: tail * rowH }}>
                  <td colSpan={colOrder.length + 1} />
                </tr>
              ) : null}
              {/* Sizer: a table sizes its columns to the rows it has, so without the result's
                  widest cells (here, zero-height and invisible) columns resize as the window moves.
                  Every cell clips: glyphs overflowing a zero line-height would add scroll height. */}
              {windowed && widest ? (
                <tr aria-hidden className="invisible leading-[0]">
                  {/* pl-6: the pin button and its gap */}
                  <td className="w-10 overflow-hidden border-r pl-6 pr-2 font-mono">{rows.length}</td>
                  {colOrder.map((ci, c) => (
                    <td
                      key={ci}
                      className={cn(
                        "max-w-64 truncate whitespace-nowrap border-r px-3",
                        domains[ci] !== null ? "font-display text-[13px] tabular-nums" : "font-mono",
                        groups.has(c) && "border-l-2 border-l-border" // the same 2 px, so the widths match
                      )}
                    >
                      {widest[ci]}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
          {view.length === 0 ? (
            <p className="py-6 text-center font-mono text-sm text-muted-foreground">
              {!onlyQualified
                ? "no rows match the column filters"
                : activeFilters.length
                  ? "no qualified row matches the column filters"
                  : "every row is below the qualifier: turn off qualified only to see them"}
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
          {pinned.length ? (
            <span className="text-foreground">
              {pinned.length} pinned{urlPin && onViewChange ? "" : ", this session only"}
              {onlyPinned ? (
                <>
                  {" "}· pinned only, <kbd>z</kbd> shows all
                </>
              ) : null}
            </span>
          ) : null}
          {onlyQualified ? <span className="text-foreground">qualified: ≥ {perGame}</span> : null}
          {preset ? <span className="text-foreground">preset: {preset} · All shows every column</span> : null}
          <span role="status" className="text-foreground empty:sr-only">
            {notice}
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
          <span className="hidden sm:inline">
            <kbd className="text-foreground">p</kbd> pin
          </span>
          <span className="hidden md:inline">
            <kbd className="text-foreground">c</kbd> pin hovered
          </span>
          <span className="hidden sm:inline">
            <kbd className="text-foreground">z</kbd> pinned only
          </span>
          <button
            onClick={() => setTint(nextTint(shownTint, hasPct))}
            className={cn(
              "ml-auto inline-flex items-center gap-1 uppercase hover:text-foreground",
              shownTint !== "off" && "text-primary"
            )}
            title="Shade cells: distance from the column baseline → producer percentile (X_pct) → off (h)"
          >
            <Flame className="size-3" />{" "}
            {shownTint === "pct" ? "percentile" : shownTint === "delta" ? "heat" : "no tint"} <kbd>h</kbd>
          </button>
          {below ? (
            <button
              onClick={() => setQualified((v) => !v)}
              aria-pressed={qualified}
              className={cn("uppercase hover:text-foreground", qualified && "text-primary")}
              title={`Show only the rows at or above the qualifier, ${perGame}; pinned rows always show (q)`}
            >
              qualified only <kbd>q</kbd>
            </button>
          ) : null}
        </div>

        {pinned.length ? (
          <PinTray
            columns={cols}
            rows={rows}
            pinned={pinned}
            pcts={pcts}
            colOrder={colOrder}
            heads={[labelCol, idCol]}
            nameOf={nameOf}
            whoOf={whoOf}
            onUnpin={togglePin}
          />
        ) : null}
      </div>
      <HoverRail ref={showInRail} columns={cols} colOrder={colOrder} rows={rows} pcts={pcts} label={labelCol} id={idCol} />
    </div>
  );
}

/** What heads a row in the tray and the rail: its label, else the id its pin is kept by
 *  (never an id that repeats); null when it has neither, and "Row N" stands alone. */
const rowName = (cells: (string | null)[], label: number, id: number) => cells[label] ?? cells[id] ?? null;

/** 38 → "38th". */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** The site's tables collapse borders, which the table paints: a sticky cell's own right border
 *  scrolls away under it. A shadow is the cell's own, so it stays at the edge. */
const STICKY_EDGE = "shadow-[inset_-1px_0_0_var(--color-border)]";

/**
 * The pinned rows side by side: a metric per row, a pinned row per column, in
 * pin order. A plain table (not role=grid), so the site's table rules draw it.
 * A metric with a producer percentile is shaded by it, as the grid's pct mode.
 */
function PinTray({
  columns,
  rows,
  pinned,
  pcts,
  colOrder,
  heads,
  nameOf,
  whoOf,
  onUnpin,
}: {
  columns: string[];
  rows: (string | null)[][];
  pinned: number[];
  pcts: Map<number, PctSource>;
  /** The grid's column order (dragged), which the metrics follow. */
  colOrder: number[];
  /** The label and pin-id columns: they head the tray, so they aren't metric rows. */
  heads: [number, number];
  nameOf: (orig: number) => string;
  whoOf: (orig: number) => string;
  onUnpin: (orig: number) => void;
}) {
  const place = new Map(colOrder.map((ci, i) => [columns[ci], i]));
  // a column a preset hides keeps its row, after the displayed ones
  const metrics = transposePinned(columns, rows, pinned, heads).sort(
    (a, b) => (place.get(a.metric) ?? Number.MAX_SAFE_INTEGER) - (place.get(b.metric) ?? Number.MAX_SAFE_INTEGER)
  );
  const named = (orig: number) => rowName(rows[orig], heads[0], heads[1]) != null;
  return (
    <section aria-label="Pinned rows" className="mt-3 min-w-0">
      <h3 className="mb-1.5 font-display text-sm font-bold uppercase text-muted-foreground">
        Pinned {pinned.length} of {MAX_PINS}
      </h3>
      {/* relative: the sr-only percentile text is absolute, and would escape the clip to widen the page */}
      <div className="scrollbar-visible relative max-h-[32rem] max-w-full overflow-auto rounded-lg">
        <table className="w-max min-w-full text-xs">
          <thead>
            <tr>
              <th scope="col" className={cn("sticky left-0 top-0 z-20 bg-muted font-mono uppercase text-muted-foreground", STICKY_EDGE)}>
                metric
              </th>
              {pinned.map((orig) => (
                <th key={orig} scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-muted text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-display text-[13px]">{nameOf(orig)}</span>
                    {named(orig) ? (
                      <span className="font-mono text-[10px] font-normal text-muted-foreground">#{orig + 1}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onUnpin(orig)}
                      aria-label={`Unpin ${whoOf(orig)}`}
                      className="rounded-sm text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ metric, values }) => {
              const src = pcts.get(columns.indexOf(metric));
              return (
                <tr key={metric}>
                  {/* the site rule pads and borders td only */}
                  <th scope="row" className={cn("sticky left-0 z-10 border border-border bg-card p-2 text-left font-mono font-normal text-muted-foreground", STICKY_EDGE)}>
                    {metric}
                  </th>
                  {values.map((v, j) => {
                    const pct = src ? rows[pinned[j]][src.col] : null;
                    const p = pct == null || pct === "" ? null : asPercentile(Number(pct), src!.scale);
                    return (
                      <td
                        key={pinned[j]}
                        style={src ? { backgroundColor: pctTint(pct, src.scale) } : undefined}
                        className="max-w-48 truncate whitespace-nowrap text-right font-display text-[13px] tabular-nums"
                        title={p != null ? `${v ?? "∅"} · ${ordinal(p)} percentile` : (v ?? "")}
                      >
                        {formatCell(v) ?? "∅"}
                        {p != null ? <span className="sr-only">, {ordinal(p)} percentile</span> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * The hovered (or focused) row in full, beside the grid from `xl`: every value,
 * and each producer percentile as a bar diverging from the 50th (left toward
 * `neg`, right toward `pos`) with its number. Its own state, so a hover
 * re-renders this, not the grid. It keeps the last row when the pointer leaves.
 */
const HoverRail = memo(function HoverRail({
  ref,
  columns,
  colOrder,
  rows,
  pcts,
  label,
  id,
}: {
  ref: React.Ref<(orig: number | null) => void>;
  columns: string[];
  colOrder: number[];
  rows: (string | null)[][];
  pcts: Map<number, PctSource>;
  label: number;
  id: number;
}) {
  const [orig, setOrig] = useState<number | null>(null);
  const aside = useRef<HTMLElement>(null);
  // below xl the rail is display:none (no offsetParent): a hover there re-renders nothing
  useImperativeHandle(ref, () => (o: number | null) => {
    if (aside.current?.offsetParent != null) setOrig(o);
  }, []);
  // a re-run: the index names another row now
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) {
    setSeen(rows);
    setOrig(null);
  }
  const cells = orig == null ? undefined : rows[orig];
  // every value, as the rail promises: the displayed columns first, then the ones a preset hides (as the tray)
  const shown = useMemo(() => {
    const seen = new Set(colOrder);
    return [...colOrder, ...columns.flatMap((_, i) => (seen.has(i) ? [] : [i]))];
  }, [colOrder, columns]);
  return (
    <aside
      ref={aside}
      aria-label="Row detail"
      className="scrollbar-visible relative hidden max-h-[34rem] overflow-y-auto rounded-lg border border-border/60 bg-card p-3 xl:block"
    >
      {cells && orig != null ? (
        <>
          <div className="mb-2">
            <p className="font-display text-base font-bold leading-tight">{rowName(cells, label, id) ?? `Row ${orig + 1}`}</p>
            {rowName(cells, label, id) != null ? (
              <p className="font-mono text-[10px] uppercase text-muted-foreground">row {orig + 1}</p>
            ) : null}
          </div>
          <dl className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-xs">
            {shown.map((c) => {
              const name = columns[c];
              const src = pcts.get(c);
              if (src?.col === c) return null; // an X_pct: drawn as its X's bar
              const raw = src ? cells[src.col] : null;
              const p = raw == null || raw === "" ? null : asPercentile(Number(raw), src!.scale);
              return (
                <Fragment key={name}>
                  <dt className="truncate font-mono text-muted-foreground" title={name}>
                    {name}
                  </dt>
                  <dd className="truncate text-right font-display text-[13px] tabular-nums" title={cells[c] ?? ""}>
                    {formatCell(cells[c]) ?? "∅"}
                  </dd>
                  {src ? (
                    <dd className="col-span-2 mb-1 flex items-center gap-2" title={`${columns[src.col]}: ${p == null ? "none" : ordinal(p)}`}>
                      <span className="relative h-1.5 flex-1 rounded-full bg-chart-div-mid">
                        {p != null ? (
                          <span
                            className={cn("absolute inset-y-0", p >= 50 ? "left-1/2 bg-chart-div-pos-3" : "right-1/2 bg-chart-div-neg-3")}
                            style={{ width: `${Math.abs(Math.min(100, Math.max(0, p)) - 50)}%` }}
                          />
                        ) : null}
                        <span className="absolute -inset-y-0.5 left-1/2 w-px bg-muted-foreground/60" />
                      </span>
                      <span className="w-14 text-right font-mono text-[10px] text-muted-foreground">
                        {p == null ? "∅" : ordinal(p)}
                        <span className="sr-only"> percentile</span>
                      </span>
                    </dd>
                  ) : null}
                </Fragment>
              );
            })}
          </dl>
        </>
      ) : (
        <p className="font-inter text-xs text-muted-foreground">Hover a row, or move the focus to one, to see all its values.</p>
      )}
    </aside>
  );
});
