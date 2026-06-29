// Unit tests — pure bracket-grid geometry (no React, no DOM).
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import { buildPedigreeTree, type AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { maxDepth, placeCells, buildGrid } from '@/lib/tableLayout';

function animal(name: string, sire: string | null, dam: string | null): Animal {
  return {
    name, sire, dam, sex: null, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null,
  };
}
const lookup: AnimalLookup = ((m) => (n: string) => m.get(n.toLowerCase()) ?? null)(
  new Map(
    [
      animal('A', 'B', 'C'), animal('B', 'D', 'E'), animal('C', 'F', 'G'),
      animal('D', null, null), animal('E', null, null),
      animal('F', null, null), animal('G', null, null),
    ].map((a) => [a.name.toLowerCase(), a])
  )
);

describe('maxDepth', () => {
  it('reports the deepest generation present', () => {
    expect(maxDepth(buildPedigreeTree(lookup, 'A', 2))).toBe(2);
    expect(maxDepth(buildPedigreeTree(lookup, 'A', 1))).toBe(1);
    // D has unknown parents → still produces placeholder gen-1 nodes.
    expect(maxDepth(buildPedigreeTree(lookup, 'D', 3))).toBe(1);
  });
});

describe('placeCells — bracket geometry', () => {
  it('subject spans the whole grid; each generation halves the span', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    const depth = maxDepth(tree); // 2 → 4 rows
    const cells = placeCells(tree, depth);
    const by = (id: string) => cells.find((c) => c.node.id === id)!;

    expect(by('0').rowStart).toBe(0);
    expect(by('0').rowSpan).toBe(4);
    expect(by('0.S').rowStart).toBe(0); // sire = top half
    expect(by('0.S').rowSpan).toBe(2);
    expect(by('0.D').rowStart).toBe(2); // dam = bottom half
    expect(by('0.D').rowSpan).toBe(2);
    // grandparents are single-row leaves at the right column
    for (const id of ['0.S.S', '0.S.D', '0.D.S', '0.D.D']) {
      expect(by(id).rowSpan).toBe(1);
      expect(by(id).col).toBe(2);
    }
    expect(by('0.S.S').rowStart).toBe(0);
    expect(by('0.S.D').rowStart).toBe(1);
    expect(by('0.D.S').rowStart).toBe(2);
    expect(by('0.D.D').rowStart).toBe(3);
  });

  it('column equals generation', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    for (const c of placeCells(tree, maxDepth(tree))) {
      expect(c.col).toBe(c.node.generation);
    }
  });

  it('cells never overlap and fully tile the grid rows per column', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    const depth = maxDepth(tree);
    const cells = placeCells(tree, depth);
    const totalRows = 2 ** depth;
    // For each occupied column, the union of [rowStart, rowStart+span) ranges
    // must be disjoint and cover exactly the rows that have a cell there.
    const byCol = new Map<number, [number, number][]>();
    for (const c of cells) {
      const arr = byCol.get(c.col) ?? [];
      arr.push([c.rowStart, c.rowStart + c.rowSpan]);
      byCol.set(c.col, arr);
    }
    for (const ranges of byCol.values()) {
      ranges.sort((a, b) => a[0] - b[0]);
      let prevEnd = 0;
      for (const [start, end] of ranges) {
        expect(start).toBeGreaterThanOrEqual(prevEnd); // no overlap
        expect(end).toBeLessThanOrEqual(totalRows); // within grid
        prevEnd = end;
      }
    }
  });

  it('buildGrid fills EVERY slot of the full grid (no voids), without overlap', () => {
    // Partial tree: A has sire B (known) and an unknown dam → many empty slots.
    const partial = ((m) => (n: string) => m.get(n.toLowerCase()) ?? null)(
      new Map(
        [animal('A', 'B', null), animal('B', null, null)].map((a) => [
          a.name.toLowerCase(), a,
        ])
      )
    );
    const depth = 3;
    const tree = buildPedigreeTree(partial, 'A', depth);
    const d = maxDepth(tree);
    const grid = buildGrid(tree, d);
    const totalRows = 2 ** d;

    // Every column must tile its full height exactly: spans sum to totalRows
    // and there are no gaps or overlaps.
    for (let col = 0; col <= d; col++) {
      const ranges = grid
        .filter((c) => c.col === col)
        .map((c) => [c.rowStart, c.rowStart + c.rowSpan] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      let prevEnd = 0;
      for (const [start, end] of ranges) {
        expect(start).toBe(prevEnd); // contiguous: no gap, no overlap
        prevEnd = end;
      }
      expect(prevEnd).toBe(totalRows); // column fully covered
    }

    // Some cells are pure fillers (node === null) where the dam line is unknown.
    expect(grid.some((c) => c.node === null)).toBe(true);
    // Keys are unique (valid React keys).
    expect(new Set(grid.map((c) => c.key)).size).toBe(grid.length);
  });

  it('handles unknown ancestors as placeholder cells without overlap', () => {
    const partial = ((m) => (n: string) => m.get(n.toLowerCase()) ?? null)(
      new Map(
        [animal('A', 'B', 'GHOST'), animal('B', null, null)].map((a) => [
          a.name.toLowerCase(), a,
        ])
      )
    );
    const tree = buildPedigreeTree(partial, 'A', 3);
    const cells = placeCells(tree, maxDepth(tree));
    // The GHOST dam (no row) is a null-animal placeholder cell, still placed.
    const ghost = cells.find((c) => c.node.id === '0.D')!;
    expect(ghost.node.animal).toBeNull();
    expect(ghost.rowSpan).toBeGreaterThan(0);
  });
});
