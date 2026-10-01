/**
 * The metric registry as ResultsGrid reads it: column presets by family, group
 * separators over the displayed order, and header labels that tell `_off` from
 * `_def`. Every helper takes the resolver (and the family order) as an argument
 * so a fixture registry can drive the tests; the defaults are the generated
 * metricRegistry.ts.
 */
import { columnTip } from "./glossary.ts";
import { METRICS, resolveMetric } from "./metricRegistry.ts";

/** What a helper needs of a resolved column (ResolvedMetric is one). */
export type Resolved = { family: string; short: string; label: string; side?: string; phase?: string; suffix?: string };
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
