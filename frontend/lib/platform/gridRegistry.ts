/**
 * The metric registry as ResultsGrid reads it: column presets by family, group
 * separators over the displayed order, header labels that tell `_off` from
 * `_def`, and the basis toggle (per game / per play / per drive / total) that
 * shows a column's sibling variant in its place. Every helper takes the
 * resolver (and the family order or the bases) as an argument so a fixture
 * registry can drive the tests; the defaults are the generated metricRegistry.ts.
 */
import { columnTip } from "./glossary.ts";
import { METRICS, resolveMetric } from "./metricRegistry.ts";

/** What a helper needs of a resolved column (ResolvedMetric is one). `key` and `variants` are
 *  what the basis helpers read; a resolver without them never sources a sibling. */
export type Resolved = {
  family: string;
  short: string;
  label: string;
  side?: string;
  phase?: string;
  suffix?: string;
  key?: string;
  variants?: Record<string, string>;
};
export type Resolve = (column: string) => Resolved | null;

export type Preset = { family: string; columns: string[] };

/** The families in first-appearance order over the registry (efficiency first). */
export function familyOrder(metrics: Record<string, { family: string }> = METRICS): string[] {
  return [...new Set(Object.values(metrics).map((m) => m.family))];
}

/** `X_rank` → `X` when `X` is a result column; null for an orphan (or a registered `X_pct`). */
function baseOf(column: string, suffix: string, present: Set<string>): string | null {
  const suf = suffix.startsWith("_") ? suffix : `_${suffix}`;
  const base = column.endsWith(suf) ? column.slice(0, -suf.length) : null;
  return base !== null && present.has(base) ? base : null;
}

/** The families (registry order) with at least 2 BASE columns (resolved, no suffix) in the
 *  result. A preset's columns are every result column of the family in result order, each
 *  base followed by its `_pct` / `_rank` / `_n` siblings so pct shading and the n marker
 *  read beside their base. */
export function presetsFor(columns: string[], resolve: Resolve = resolveMetric, families: string[] = familyOrder()): Preset[] {
  const res = columns.map((c) => resolve(c));
  const present = new Set(columns);
  const siblings = new Map<string, string[]>();
  columns.forEach((c, i) => {
    const base = res[i]?.suffix ? baseOf(c, res[i].suffix, present) : null;
    if (base !== null) siblings.set(base, [...(siblings.get(base) ?? []), c]);
  });
  return families.flatMap((family) => {
    const out: string[] = [];
    let bases = 0;
    columns.forEach((c, i) => {
      const r = res[i];
      if (!r || r.family !== family) return;
      if (!r.suffix) {
        bases++;
        out.push(c, ...(siblings.get(c) ?? []));
      } else if (baseOf(c, r.suffix, present) === null) out.push(c);
    });
    return bases >= 2 ? [{ family, columns: out }] : [];
  });
}

/** Over the DISPLAYED columns, the index of the first column of each family run. A family
 *  that returns after another starts a new run; an unresolved column (an id, a name, text)
 *  never starts a run and never breaks one. */
export function groupStarts(displayed: string[], resolve: Resolve = resolveMetric): Set<number> {
  const out = new Set<number>();
  let last: string | null = null;
  displayed.forEach((c, i) => {
    const r = resolve(c);
    if (!r) return;
    if (r.family !== last) out.add(i);
    last = r.family;
  });
  return out;
}

export type HeaderLabel = { text: string; title: string };

const raw = (column: string): HeaderLabel => ({ text: column, title: columnTip(column) });

/** A header's visible text (`short`, plus `Off` / `Def` / `Margin` for a sided column and the
 *  suffix for a suffixed one) and its tooltip (`label`, the same tags, the raw column). An
 *  unresolved column keeps its raw name and the glossary tip. */
export function headerLabel(column: string, resolve: Resolve = resolveMetric): HeaderLabel {
  const r = resolve(column);
  if (!r) return raw(column);
  const tags = [r.side && r.side[0].toUpperCase() + r.side.slice(1), r.suffix?.replace(/^_/, "")].filter(Boolean).join(" ");
  const t = tags ? ` ${tags}` : "";
  return { text: `${r.short}${t}`, title: `${r.label}${t} (${column})` };
}

/** headerLabel over the displayed columns, with the collision guard: two columns that would
 *  read the same both fall back to their raw names. */
export function headerLabels(displayed: string[], resolve: Resolve = resolveMetric): HeaderLabel[] {
  const labels = displayed.map((c) => headerLabel(c, resolve));
  const seen = new Map<string, number>();
  for (const l of labels) seen.set(l.text, (seen.get(l.text) ?? 0) + 1);
  return labels.map((l, i) => ((seen.get(l.text) ?? 0) > 1 ? raw(displayed[i]) : l));
}

/** A displayed order the grid can use: non-empty, distinct, in-range indices, at most `n` of them
 *  (a preset's subset is shorter than the result). Anything else shows every column. */
export function validOrder(order: number[], n: number): boolean {
  return order.length > 0 && order.length <= n && new Set(order).size === order.length && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}

/** The grid's `order` under a preset: the frozen column (when there is one), then the preset's
 *  columns by index. Every other column is hidden. */
export function applyPreset(columns: string[], frozen: number, preset: { columns: string[] }): number[] {
  const idx = preset.columns.map((c) => columns.indexOf(c)).filter((i) => i >= 0 && i !== frozen);
  return frozen >= 0 ? [frozen, ...idx] : idx;
}

// --- Basis (per game / per play / per drive / total) ----------------------------------------

/** The bases the registry knows, as the union of every entry's variant names in first-appearance
 *  order (`total`, `per_play`, `per_game`, `per_drive`). */
export function bases(metrics: Record<string, { variants: Record<string, string> }> = METRICS): string[] {
  return [...new Set(Object.values(metrics).flatMap((m) => Object.keys(m.variants)))];
}

/** The basis a column's entry lists ITSELF under (`EPAplay` → per_play, `TEPA` → total); null for an
 *  entry without variants (`success`) or an unresolved column. */
export function nativeBasis(column: string, resolve: Resolve = resolveMetric): string | null {
  const r = resolve(column);
  if (!r?.key) return null;
  return Object.entries(r.variants ?? {}).find(([, key]) => key === r.key)?.[0] ?? null;
}

export type Rebased = {
  columns: string[];
  rows: (string | null)[][];
  /** The columns with no `basis` variant in the result: every cell null. */
  blanked: Set<string>;
  /** column → the sibling column whose cells it shows. */
  sourced: Map<string, string>;
};

/** Per column, the index of the column whose cells it shows under `basis`: itself (an id, a name,
 *  text, a suffixed `X_pct` / `X_rank` / `X_n`, or a column already on that basis), its sibling's
 *  (the variant key re-decorated with the column's own side and phase: `TEPA_off` → `EPAplay_off`),
 *  or -1 when the entry has no such variant or the sibling isn't in the result. The grid never
 *  shows another basis's values as if they were this one's, so that column goes blank. */
function sourcesFor(columns: string[], basis: string, resolve: Resolve) {
  const at = new Map(columns.map((c, i) => [c, i]));
  const blanked = new Set<string>();
  const sourced = new Map<string, string>();
  const src = columns.map((c, i) => {
    const r = resolve(c);
    if (!r?.key || r.suffix) return i;
    const key = r.variants?.[basis];
    if (key === r.key) return i;
    const sibling = key === undefined ? undefined : `${key}${r.side ? `_${r.side}` : ""}${r.phase ? `_${r.phase}` : ""}`;
    const j = sibling === undefined ? undefined : at.get(sibling);
    if (sibling === undefined || j === undefined) {
      blanked.add(c);
      return -1;
    }
    sourced.set(c, sibling);
    return j;
  });
  return { src, blanked, sourced };
}

/** The result on `basis`: the same columns in the same places, each sourced column's cells taken
 *  from its sibling and each blanked column's cells null. The native view (`basis` null) is the
 *  input itself, same references, so the grid pays nothing for it. O(rows × columns) otherwise:
 *  memoize on [columns, rows, basis]. */
export function rebase(columns: string[], rows: (string | null)[][], basis: string | null, resolve: Resolve = resolveMetric): Rebased {
  if (basis === null) return { columns, rows, blanked: new Set(), sourced: new Map() };
  const { src, blanked, sourced } = sourcesFor(columns, basis, resolve);
  return { columns, rows: rows.map((r) => src.map((s) => (s < 0 ? null : r[s]))), blanked, sourced };
}

/** The bases a result can serve, in registry order: those under which at least one column is sourced. */
export function basesFor(columns: string[], resolve: Resolve = resolveMetric, all: string[] = bases()): string[] {
  return all.filter((b) => sourcesFor(columns, b, resolve).sourced.size > 0);
}
