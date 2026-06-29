// tableLayout.ts — pure geometry for the bracket-grid pedigree table. No React,
// so it is unit-testable. Converts an ancestor tree into grid-placed cells: a
// node at generation g spans 2^(D-g) rows; its sire takes the top half of its
// block and its dam the bottom half, yielding the classic pedigree bracket.

import type { PedigreeTreeNode } from './pedigreeAlgorithm';

export interface PlacedCell {
  node: PedigreeTreeNode;
  /** 0-based grid column, equal to the generation. */
  col: number;
  /** 0-based start row within a 2^depth-row grid. */
  rowStart: number;
  /** number of rows this cell spans. */
  rowSpan: number;
}

/** Deepest generation present in the tree (drives the column count). Always >= 0. */
export function maxDepth(node: PedigreeTreeNode): number {
  let d = node.generation;
  if (node.sire) d = Math.max(d, maxDepth(node.sire));
  if (node.dam) d = Math.max(d, maxDepth(node.dam));
  return d;
}

/** Assign every node a (col, rowStart, rowSpan). Cells never overlap and tile
 *  their parent's row block exactly. */
export function placeCells(root: PedigreeTreeNode, depth: number): PlacedCell[] {
  const cells: PlacedCell[] = [];
  (function rec(node: PedigreeTreeNode, rowStart: number): void {
    const span = 2 ** (depth - node.generation);
    cells.push({ node, col: node.generation, rowStart, rowSpan: span });
    if (node.sire) rec(node.sire, rowStart);
    if (node.dam) rec(node.dam, rowStart + span / 2);
  })(root, 0);
  return cells;
}

export interface GridCell {
  /** Stable key for React. */
  key: string;
  /** 0-based grid column (= generation). */
  col: number;
  rowStart: number;
  rowSpan: number;
  /** The tree node here, or null for a filler slot (no ancestor to show). */
  node: PedigreeTreeNode | null;
}

/**
 * Build a COMPLETE grid: every slot of the full binary pedigree down to `depth`
 * gets a cell, even where there is no ancestor (unknown parent, or beneath a
 * repeated/leaf node). Filler slots carry node:null and render as blank bordered
 * boxes, so the table reads as a solid grid with no voids — like a printed
 * BreedMate sheet. The underlying traversal/counts are unchanged; this only
 * affects rendering.
 */
export function buildGrid(root: PedigreeTreeNode, depth: number): GridCell[] {
  const cells: GridCell[] = [];
  (function rec(node: PedigreeTreeNode | null, gen: number, rowStart: number, key: string): void {
    const span = 2 ** (depth - gen);
    cells.push({ key, col: gen, rowStart, rowSpan: span, node });
    if (gen >= depth) return;
    // Recurse into real children when present; otherwise fill with empties.
    rec(node?.sire ?? null, gen + 1, rowStart, `${key}.S`);
    rec(node?.dam ?? null, gen + 1, rowStart + span / 2, `${key}.D`);
  })(root, 0, 0, '0');
  return cells;
}
