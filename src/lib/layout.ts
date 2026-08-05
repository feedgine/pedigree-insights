// layout.ts — pure transform from an ancestor PedigreeTreeNode into positioned
// react-flow nodes + edges. No React, no reactflow runtime (types only), so it
// is unit-testable. Reproduces the classic "Family Tree" look (PRD §6.3):
// subject at the far left, ancestors fanning right, boxes shrinking by depth,
// elbow connectors, sex colour-coding handled by the node component.

import type { Node, Edge } from 'reactflow';
import type { PedigreeTreeNode } from './pedigreeAlgorithm';

/** Per-generation box size (px). Shrinks with depth; deepest value is reused
 *  beyond the array so a 10-generation tree still lays out. */
const BOX_W = [240, 210, 185, 160, 140, 124, 112, 104, 98, 92, 88];
const BOX_H = [104, 92, 80, 66, 56, 48, 44, 40, 38, 36, 34];
const COL_GAP = 56; // horizontal gap between generation columns
const ROW = 64; // vertical unit allotted to each leaf row

function clampIdx(gen: number): number {
  return Math.min(gen, BOX_W.length - 1);
}

export function boxSize(gen: number): { width: number; height: number } {
  const i = clampIdx(gen);
  return { width: BOX_W[i], height: BOX_H[i] };
}

/** Left edge x of each generation column (cumulative widths + gaps). */
function columnX(gen: number): number {
  let x = 0;
  for (let g = 0; g < gen; g++) x += BOX_W[clampIdx(g)] + COL_GAP;
  return x;
}

/** Data attached to each react-flow node, consumed by AnimalCard. */
export interface AnimalNodeData {
  node: PedigreeTreeNode;
}

export interface PedigreeGraph {
  nodes: Node<AnimalNodeData>[];
  edges: Edge[];
}

/**
 * Lay out the tree. Vertical positions come from a post-order pass: leaves take
 * successive rows; a parent centres on the midpoint of its two children, so the
 * subject ends up vertically centred. Sire side renders above the dam side.
 */
export function layoutPedigree(root: PedigreeTreeNode): PedigreeGraph {
  const nodes: Node<AnimalNodeData>[] = [];
  const edges: Edge[] = [];
  const yById = new Map<string, number>();
  let cursor = 0;

  function assignY(node: PedigreeTreeNode): number {
    const children = [node.sire, node.dam].filter(
      (c): c is PedigreeTreeNode => c !== null
    );
    let y: number;
    if (children.length === 0) {
      y = cursor * ROW;
      cursor += 1;
    } else {
      const ys = children.map(assignY);
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    yById.set(node.id, y);
    return y;
  }
  assignY(root);

  function emit(node: PedigreeTreeNode): void {
    const { width, height } = boxSize(node.generation);
    nodes.push({
      id: node.id,
      type: 'animal',
      position: { x: columnX(node.generation), y: yById.get(node.id) ?? 0 },
      data: { node },
      // Ancestors flow left→right; handles on left (toward subject/child) and
      // right (toward parents).
      sourcePosition: 'right' as Node['sourcePosition'],
      targetPosition: 'left' as Node['targetPosition'],
      width,
      height,
      draggable: false,
      selectable: !!node.animal,
    });

    for (const child of [node.sire, node.dam]) {
      if (!child) continue;
      edges.push({
        id: `${node.id}->${child.id}`,
        source: node.id,
        target: child.id,
        type: 'smoothstep', // elbow / right-angle connectors (PRD §6.3)
        style: { stroke: '#9aa3ad', strokeWidth: 1.5 },
      });
      emit(child);
    }
  }
  emit(root);

  return { nodes, edges };
}
