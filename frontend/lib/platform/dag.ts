import type { Pipeline } from "./orch-types";

/**
 * Map a Prefect graph-v2 payload (or, before any task exists, the registry's
 * declared stage chain) into react-flow nodes/edges. Pure function — layout
 * is a simple layered left-to-right DAG (column = depth, row = order).
 */

/** graph-v2 `nodes` entries are [id, node] PAIRS (verified against Prefect 3.7). */
export interface PrefectGraphNode {
  kind: string;
  id: string;
  label: string;
  state_type: string | null;
  start_time: string | null;
  end_time: string | null;
  parents: { id: string }[];
  children: { id: string }[];
}

export interface PrefectGraph {
  nodes: [string, PrefectGraphNode][];
  root_node_ids: string[];
}

export interface FlowNode {
  id: string;
  position: { x: number; y: number };
  data: { label: string; state: string; durationS: number | null };
  type: "sdvStage";
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
}

const COL_W = 230;
const ROW_H = 96;

function durationS(n: { start_time: string | null; end_time: string | null }): number | null {
  if (!n.start_time || !n.end_time) return null;
  const ms = Date.parse(n.end_time) - Date.parse(n.start_time);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

/** Longest-path depth from any root, iterative (graphs here are tiny). */
function depths(nodes: Map<string, PrefectGraphNode>): Map<string, number> {
  const depth = new Map<string, number>();
  const resolve = (id: string, seen: Set<string>): number => {
    const hit = depth.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 0; // cycle guard — Prefect graphs are acyclic
    seen.add(id);
    const node = nodes.get(id);
    const parents = node?.parents?.filter((p) => nodes.has(p.id)) ?? [];
    const d = parents.length
      ? 1 + Math.max(...parents.map((p) => resolve(p.id, seen)))
      : 0;
    depth.set(id, d);
    return d;
  };
  for (const id of nodes.keys()) resolve(id, new Set());
  return depth;
}

export function toFlow(
  graph: PrefectGraph | null,
  pipeline?: Pipeline | null,
  selectedStages?: string[] | null
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const entries = graph?.nodes ?? [];

  if (entries.length > 0) {
    const byId = new Map(entries.map(([id, n]) => [id, n]));
    const depth = depths(byId);
    const rowsAt = new Map<number, number>();
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const seenEdge = new Set<string>();

    for (const [id, n] of entries) {
      const d = depth.get(id) ?? 0;
      const row = rowsAt.get(d) ?? 0;
      rowsAt.set(d, row + 1);
      nodes.push({
        id,
        position: { x: d * COL_W, y: row * ROW_H },
        data: {
          label: n.label,
          state: n.state_type
            ? n.state_type.charAt(0) + n.state_type.slice(1).toLowerCase()
            : "Unknown",
          durationS: durationS(n),
        },
        type: "sdvStage",
      });
      for (const p of n.parents ?? []) {
        if (!byId.has(p.id)) continue;
        const key = `${p.id}->${id}`;
        if (seenEdge.has(key)) continue; // graph-v2 repeats wait_for edges
        seenEdge.add(key);
        edges.push({
          id: key,
          source: p.id,
          target: id,
          animated: n.state_type === "RUNNING",
        });
      }
    }
    return { nodes, edges };
  }

  // Pre-execution fallback: render the declared stage chain as Scheduled.
  if (!pipeline) return { nodes: [], edges: [] };
  const keys =
    selectedStages && selectedStages.length
      ? selectedStages
      : pipeline.default_stages;
  const stages = keys
    .map((k) => pipeline.stages.find((s) => s.key === k))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const nodes: FlowNode[] = stages.map((s, i) => ({
    id: s.key,
    position: { x: i * COL_W, y: 0 },
    data: { label: s.label, state: "Scheduled", durationS: null },
    type: "sdvStage",
  }));
  const edges: FlowEdge[] = stages.slice(1).map((s, i) => ({
    id: `${stages[i].key}->${s.key}`,
    source: stages[i].key,
    target: s.key,
    animated: false,
  }));
  return { nodes, edges };
}
