"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Pipeline } from "@lib/platform/orch-types";
import { toFlow, type PrefectGraph, type FlowNode } from "@lib/platform/dag";
import { StatusBadge } from "@components/platform/widgets";

type StageNode = Node<FlowNode["data"], "sdvStage">;

function SdvStageNode({ data }: NodeProps<StageNode>) {
  return (
    <div className="min-w-44 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-xs font-semibold">
          {data.label}
        </span>
        <StatusBadge status={data.state} />
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        {data.durationS != null ? `${data.durationS.toFixed(1)}s` : "—"}
      </div>
    </div>
  );
}

const nodeTypes = { sdvStage: SdvStageNode };

/** Read-only DAG of the run: live task graph when it exists, otherwise the
 *  registry's declared stage chain rendered as Scheduled. */
export default function DagCanvas({
  graph,
  pipeline,
  selectedStages,
}: {
  graph: PrefectGraph | null;
  pipeline: Pipeline | null;
  selectedStages: string[] | null;
}) {
  const { nodes, edges } = useMemo(
    () => toFlow(graph, pipeline, selectedStages),
    [graph, pipeline, selectedStages]
  );

  if (!nodes.length) {
    return (
      <p className="py-10 text-center font-mono text-sm text-muted-foreground">
        no stages to display
      </p>
    );
  }

  return (
    <div className="h-64 w-full overflow-hidden rounded-lg border border-border/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
