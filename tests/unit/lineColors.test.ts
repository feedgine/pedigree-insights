// Unit tests — line-family colour assignment for repeated ancestors.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { buildPedigreeTree } from '@/lib/pedigreeAlgorithm';
import { computeLineColors } from '@/lib/lineColors';

function animal(name: string, sire: string | null, dam: string | null): Animal {
  return {
    name, sire, dam, sex: null, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null,
  };
}
function makeLookup(animals: Animal[]): AnimalLookup {
  const map = new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
  return (name: string) => map.get(name.trim().toLowerCase()) ?? null;
}
const hueOf = (hsl: string): number => Number(/hsl\((\d+)/.exec(hsl)![1]);

// S is sire of both B and C → repeated; GS is S's sire → repeated, and descends
// from S, so S and GS form one line family (same hue, close shades).
const FAMILY = makeLookup([
  animal('A', 'B', 'C'),
  animal('B', 'S', 'E'),
  animal('C', 'S', 'F'),
  animal('S', 'GS', null),
  animal('GS', null, null),
  animal('E', null, null),
  animal('F', null, null),
]);

describe('computeLineColors', () => {
  it('tints repeated ancestors and leaves single-appearance dogs white', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 4, true);
    const colors = computeLineColors(tree);
    expect(colors.has('s')).toBe(true); // appears twice
    expect(colors.has('gs')).toBe(true); // appears twice
    expect(colors.has('e')).toBe(false); // appears once
    expect(colors.has('a')).toBe(false); // subject, once
  });

  it('gives the same line (S and its ancestor GS) the same hue, close shades', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 4, true);
    const colors = computeLineColors(tree);
    const s = colors.get('s')!;
    const gs = colors.get('gs')!;
    expect(hueOf(s)).toBe(hueOf(gs)); // same family → same hue
    expect(s).not.toBe(gs); // but different lightness (close shades)
  });

  it('returns an empty map when nothing repeats', () => {
    const linear = makeLookup([
      animal('X', 'Y', 'Z'),
      animal('Y', null, null),
      animal('Z', null, null),
    ]);
    const tree = buildPedigreeTree(linear, 'X', 3, true);
    expect(computeLineColors(tree).size).toBe(0);
  });
});
