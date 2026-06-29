// PedigreeChart.tsx — the interactive react-flow canvas (PRD §6.3). Takes an
// ancestor tree, lays it out with the pure layoutPedigree(), and renders zoom/
// pan-able nodes. Read-only: nodes are not draggable or connectable.
import React, { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type NodeTypes,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { PedigreeTreeNode } from '@/lib/pedigreeAlgorithm';
import { layoutPedigree } from '@/lib/layout';
import AnimalCard from './AnimalCard';

const nodeTypes: NodeTypes = { animal: AnimalCard };

interface Props {
  tree: PedigreeTreeNode;
}

export default function PedigreeChart({ tree }: Props): React.ReactElement {
  const { nodes, edges } = useMemo(() => layoutPedigree(tree), [tree]);

  return (
    <div className="chart">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.15}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="#e7eaee" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
