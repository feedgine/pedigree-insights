// Unit tests — pure layout transform (no reactflow runtime, no DOM).
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import { buildPedigreeTree, type AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { layoutPedigree, boxSize } from '@/lib/layout';

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

describe('layoutPedigree', () => {
  it('emits one node per tree position and an edge per parent→child link', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    const { nodes, edges } = layoutPedigree(tree);
    // 1 (A) + 2 (B,C) + 4 (D,E,F,G) = 7 nodes; 6 edges.
    expect(nodes).toHaveLength(7);
    expect(edges).toHaveLength(6);
  });

  it('places generations in left-to-right columns (x increases with depth)', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    const { nodes } = layoutPedigree(tree);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('0')!.position.x).toBe(0);
    expect(byId.get('0.S')!.position.x).toBeGreaterThan(byId.get('0')!.position.x);
    expect(byId.get('0.S.S')!.position.x).toBeGreaterThan(byId.get('0.S')!.position.x);
  });

  it('vertically centres the subject between its outermost ancestors', () => {
    const tree = buildPedigreeTree(lookup, 'A', 2);
    const { nodes } = layoutPedigree(tree);
    const ys = nodes.map((n) => n.position.y);
    const subjectY = nodes.find((n) => n.id === '0')!.position.y;
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(subjectY).toBeCloseTo(mid, 5);
  });

  it('shrinks box size with generation depth', () => {
    expect(boxSize(0).width).toBeGreaterThan(boxSize(3).width);
    expect(boxSize(3).width).toBeGreaterThan(boxSize(8).width);
    // Beyond the table it clamps rather than going negative/undefined.
    expect(boxSize(50).width).toBe(boxSize(10).width);
  });

  it('marks all nodes non-draggable (read-only chart)', () => {
    const { nodes } = layoutPedigree(buildPedigreeTree(lookup, 'A', 1));
    expect(nodes.every((n) => n.draggable === false)).toBe(true);
  });
});
