// Unit tests — the indented text pedigree renderer (src/lib/indentedTree.ts).
// Pure logic: build a small tree with the (de-dup) pedigree algorithm, then
// assert the ASCII layout, the generation labels, DOB formatting, the [repeat]
// marker for line-bred ancestors, and the summary header.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import { buildPedigreeTree, type AnimalLookup } from '@/lib/pedigreeAlgorithm';
import {
  formatDob,
  nodeText,
  buildIndentedTree,
  buildPedigreeText,
} from '@/lib/indentedTree';

function animal(
  name: string,
  sire: string | null,
  dam: string | null,
  extra: Partial<Animal> = {}
): Animal {
  return {
    name, sire, dam, sex: null, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null,
    coi: null, avk: null, ...extra,
  };
}

function makeLookup(animals: Animal[]): AnimalLookup {
  const map = new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
  return (name: string) => map.get(name.trim().toLowerCase()) ?? null;
}

// A→B,C ; B→D,E ; C→F,G — a clean 2-generation family.
const FAMILY = makeLookup([
  animal('A', 'B', 'C'),
  animal('B', 'D', 'E'),
  animal('C', 'F', 'G'),
  animal('D', null, null),
  animal('E', null, null),
  animal('F', null, null),
  animal('G', null, null),
]);

describe('formatDob', () => {
  it('renders an ISO date as M/D/YYYY and drops the time part', () => {
    expect(formatDob('2020-03-05')).toBe('3/5/2020');
    expect(formatDob('2019-11-20T00:00:00')).toBe('11/20/2019');
  });
  it('returns empty string for null/blank/undefined', () => {
    expect(formatDob(null)).toBe('');
    expect(formatDob('')).toBe('');
    expect(formatDob(undefined)).toBe('');
  });
});

describe('nodeText', () => {
  it('prefixes the generation and appends reg + DOB when present', () => {
    const tree = buildPedigreeTree(
      makeLookup([animal('Rex', null, null, { registration: 'AKC1', dob: '2021-06-01' })]),
      'Rex',
      0
    );
    expect(nodeText(tree)).toBe('G0 Rex AKC1 (6/1/2021)');
  });
  it('renders an unknown ancestor as an empty string (bare slot)', () => {
    const unknown = buildPedigreeTree(makeLookup([]), 'Ghost', 0);
    expect(nodeText(unknown)).toBe('');
  });
});

describe('buildIndentedTree — sideways ASCII layout', () => {
  it('draws sire-above / dam-below with 4-col indent and | connectors', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 2);
    expect(buildIndentedTree(tree)).toEqual([
      '        +--G2 D',
      '    +--G1 B',
      '    |   +--G2 E',
      '+--G0 A',
      '    |   +--G2 F',
      '    +--G1 C',
      '        +--G2 G',
    ]);
  });
});

describe('line-bred (repeated) ancestor', () => {
  it('expands the ancestor once and flags later occurrences [repeat]', () => {
    // Both parents share sire S → S repeats on the dam side.
    const linebred = makeLookup([
      animal('A', 'B', 'C'),
      animal('B', 'S', null),
      animal('C', 'S', null),
      animal('S', null, null),
    ]);
    const tree = buildPedigreeTree(linebred, 'A', 3);
    const lines = buildIndentedTree(tree);
    // Exactly one expanded S line and exactly one flagged [repeat] line.
    expect(lines.filter((l) => l.endsWith('+--G2 S')).length).toBe(1);
    expect(lines.filter((l) => l.endsWith('+--G2 S [repeat]')).length).toBe(1);
    // The expanded S has unknown parents → bare '+--' slots beneath it.
    expect(lines.some((l) => l.endsWith('+--'))).toBe(true);
  });
});

describe('buildPedigreeText — full report', () => {
  it('emits the summary header then the tree, ending in a newline', () => {
    const withGenetics = makeLookup([
      animal('A', 'B', 'C', { sex: 'M', dob: '2018-04-02', coi: 6.25, avk: 80 }),
      animal('B', null, null),
      animal('C', null, null),
    ]);
    const tree = buildPedigreeTree(withGenetics, 'A', 1);
    const text = buildPedigreeText(tree, 5);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('Pedigree of:  A');
    expect(text).toContain('Sex:  M');
    expect(text).toContain('Date of Birth:  4/2/2018');
    expect(text).toContain('COI:  6.25%');
    expect(text).toContain('AVK:  80.00%');
    expect(text).toContain('Generations:  5');
    expect(text).toContain('+--G0 A');
  });

  it('shows "Not available" for missing COI/AVK', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 1);
    const text = buildPedigreeText(tree, 5);
    expect(text).toContain('COI:  Not available');
    expect(text).toContain('AVK:  Not available');
  });
});
