// Unit tests — pure traversal & helper logic, no real DB (PRD §12.1).
// The lookup is an in-memory map. To model the SQL layer's COLLATE NOCASE,
// the lookup matches names case-insensitively; the algorithm itself supplies
// the whitespace-trimming (keyOf) and the depth + cycle guards.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import { normalizeSex, keyOf, coiDisplay, nodeLabel, toAnimal } from '@/lib/schema';
import {
  buildPedigreeTree,
  groupByGeneration,
  countAncestors,
  clampGenerations,
  fetchDescendants,
  type AnimalLookup,
} from '@/lib/pedigreeAlgorithm';

function animal(name: string, sire: string | null, dam: string | null, sex: Animal['sex'] = null): Animal {
  return {
    name, sire, dam, sex, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null,
  };
}

/** Case-insensitive in-memory lookup, modelling SQL COLLATE NOCASE. */
function makeLookup(animals: Animal[]): AnimalLookup {
  const map = new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
  return (name: string) => map.get(name.trim().toLowerCase()) ?? null;
}

// A small 3-generation family. Subject A; B/C parents; D..G grandparents.
const FAMILY = makeLookup([
  animal('A', 'B', 'C', 'M'),
  animal('B', 'D', 'E', 'M'),
  animal('C', 'F', 'G', 'F'),
  animal('D', null, null, 'M'),
  animal('E', null, null, 'F'),
  animal('F', null, null, 'M'),
  animal('G', null, null, 'F'),
]);

describe('buildPedigreeTree — resolution & grouping', () => {
  it('resolves Sire/Dam by Name and groups by generation', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 3);
    const byGen = groupByGeneration(tree);
    expect(byGen.get(0)!.map((a) => a.name)).toEqual(['A']);
    expect(byGen.get(1)!.map((a) => a.name).sort()).toEqual(['B', 'C']);
    expect(byGen.get(2)!.map((a) => a.name).sort()).toEqual(['D', 'E', 'F', 'G']);
    expect(countAncestors(tree)).toBe(7);
  });

  it('places sire on the .S path and dam on the .D path', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 1);
    expect(tree.sire!.animal!.name).toBe('B');
    expect(tree.dam!.animal!.name).toBe('C');
    expect(tree.sire!.id).toBe('0.S');
    expect(tree.dam!.id).toBe('0.D');
  });
});

describe('depth limit', () => {
  it('returns no animal beyond generation N', () => {
    const tree = buildPedigreeTree(FAMILY, 'A', 1);
    const byGen = groupByGeneration(tree);
    expect([...byGen.keys()].sort()).toEqual([0, 1]);
    expect(byGen.has(2)).toBe(false);
  });

  it('clampGenerations bounds the requested depth to 1..13', () => {
    expect(clampGenerations(0)).toBe(1);
    expect(clampGenerations(3)).toBe(3);
    expect(clampGenerations(99)).toBe(13);
    expect(clampGenerations(13)).toBe(13);
    expect(clampGenerations(Number.POSITIVE_INFINITY)).toBe(3); // → default
    expect(clampGenerations(NaN)).toBe(3);
    expect(clampGenerations(4.9)).toBe(4);
  });
});

describe('cycle guard', () => {
  it('terminates when an animal appears in its own ancestry (no infinite loop)', () => {
    // X is listed as its own sire — a data-entry error.
    const looping = makeLookup([animal('X', 'X', 'Y', 'M'), animal('Y', null, null, 'F')]);
    const tree = buildPedigreeTree(looping, 'X', 10);
    // Must complete; X counted once, Y once.
    expect(countAncestors(tree)).toBe(2);
    // The repeated X node is present but flagged and not expanded.
    expect(tree.sire!.animal!.name).toBe('X');
    expect(tree.sire!.repeated).toBe(true);
    expect(tree.sire!.sire).toBeNull();
  });

  it('visits a repeated ancestor at most once in the counts (line-breeding)', () => {
    // Both of A's parents share the same sire S → S is a repeated ancestor.
    const linebred = makeLookup([
      animal('A', 'B', 'C', 'M'),
      animal('B', 'S', null, 'M'),
      animal('C', 'S', null, 'F'),
      animal('S', null, null, 'M'),
    ]);
    const tree = buildPedigreeTree(linebred, 'A', 5);
    const names = [...groupByGeneration(tree).values()].flat().map((a) => a.name);
    expect(names.filter((n) => n === 'S')).toHaveLength(1); // counted once
    expect(countAncestors(tree)).toBe(4); // A,B,C,S
  });
});

describe('chart mode — expandAll fully draws repeated ancestors', () => {
  // S is the sire of both B and C, so it occupies two boxes; in chart mode each
  // occurrence must be fully expanded (its own sire GS drawn under both).
  const linebred = makeLookup([
    animal('A', 'B', 'C', 'M'),
    animal('B', 'S', null, 'M'),
    animal('C', 'S', null, 'F'),
    animal('S', 'GS', null, 'M'),
    animal('GS', null, null, 'M'),
  ]);

  it('expands every occurrence of a repeated ancestor (no collapsing)', () => {
    const tree = buildPedigreeTree(linebred, 'A', 4, true);
    const sViaB = tree.sire!.sire!; // A→B→S
    const sViaC = tree.dam!.sire!; // A→C→S
    expect(sViaB.animal!.name).toBe('S');
    expect(sViaC.animal!.name).toBe('S');
    expect(sViaB.repeated).toBe(false);
    expect(sViaC.repeated).toBe(false);
    // Both occurrences carry their own ancestry.
    expect(sViaB.sire!.animal!.name).toBe('GS');
    expect(sViaC.sire!.animal!.name).toBe('GS');
  });

  it('default mode still de-duplicates (count semantics unchanged)', () => {
    const tree = buildPedigreeTree(linebred, 'A', 4); // expandAll defaults false
    const sViaB = tree.sire!.sire!;
    const sViaC = tree.dam!.sire!;
    const collapsed = [sViaB, sViaC].filter((n) => n.repeated);
    expect(collapsed).toHaveLength(1); // one expanded, one collapsed
  });

  it('still halts a true ancestry loop in chart mode', () => {
    const looping = makeLookup([animal('X', 'X', 'Y', 'M'), animal('Y', null, null, 'F')]);
    const tree = buildPedigreeTree(looping, 'X', 6, true);
    expect(tree.sire!.animal!.name).toBe('X'); // shown
    expect(tree.sire!.repeated).toBe(true); // but the loop is stopped
    expect(tree.sire!.sire).toBeNull();
  });
});

describe('foundation / unknown ancestors', () => {
  it('a Sire/Dam Name with no matching row becomes a leaf, not an error', () => {
    const partial = makeLookup([animal('A', 'GHOST', 'C', 'M'), animal('C', null, null, 'F')]);
    const tree = buildPedigreeTree(partial, 'A', 3);
    expect(tree.sire!.animal).toBeNull(); // GHOST has no row → empty leaf
    expect(tree.sire!.sire).toBeNull();
    expect(tree.dam!.animal!.name).toBe('C');
    expect(countAncestors(tree)).toBe(2); // A, C
  });

  it('an empty/null parent name renders as an empty leaf', () => {
    const tree = buildPedigreeTree(FAMILY, 'D', 3); // D has null parents
    expect(tree.sire!.animal).toBeNull();
    expect(tree.dam!.animal).toBeNull();
  });
});

describe('name matching — case & whitespace insensitive', () => {
  it('matches a padded, mixed-case start name', () => {
    const tree = buildPedigreeTree(FAMILY, '  a  ', 1);
    expect(tree.animal!.name).toBe('A');
    expect(tree.sire!.animal!.name).toBe('B');
  });
});

describe('schema helpers', () => {
  it('normalizeSex maps dirty values', () => {
    expect(normalizeSex('M')).toBe('M');
    expect(normalizeSex('f')).toBe('F');
    expect(normalizeSex(' m ')).toBe('M');
    expect(normalizeSex('')).toBeNull();
    expect(normalizeSex(null)).toBeNull();
    expect(normalizeSex('unknown')).toBeNull();
  });

  it('keyOf trims and treats empty as null', () => {
    expect(keyOf('  Rex ')).toBe('Rex');
    expect(keyOf('')).toBeNull();
    expect(keyOf('   ')).toBeNull();
    expect(keyOf(null)).toBeNull();
  });

  it('coiDisplay returns "Not available" for null, formatted otherwise', () => {
    expect(coiDisplay(null)).toBe('Not available');
    expect(coiDisplay(6.25)).toBe('6.25%');
    expect(coiDisplay(0)).toBe('0.00%');
  });

  it('nodeLabel composes [Titles] [Name] [Obedience] and degrades to name-only', () => {
    const a = { ...animal('Beauty', null, null, 'F'), preTitle: 'Ch', postTitle: 'CD' };
    expect(nodeLabel(a)).toBe('Ch Beauty CD');
    expect(nodeLabel(a, true)).toBe('Beauty');
    expect(nodeLabel(animal('Lone', null, null))).toBe('Lone');
  });

  it('toAnimal normalizes sexRaw from a projected row', () => {
    const a = toAnimal({
      name: 'Z', sire: null, dam: null, sexRaw: 'm', dob: null,
      registration: null, preTitle: null, postTitle: null, color: null,
      breed: null, coi: null, avk: null,
    });
    expect(a.sex).toBe('M');
  });
});

describe('fetchDescendants — scaffold (PRD §9)', () => {
  it('groups offspring by generation and is depth + cycle bounded', () => {
    const kids = new Map<string, Animal[]>([
      ['A', [animal('B', 'A', null), animal('C', 'A', null)]],
      ['B', [animal('D', 'B', null)]],
    ]);
    const childrenOf = (n: string) => kids.get(n) ?? [];
    const out = fetchDescendants(childrenOf, 'A', 3);
    expect(out.get(1)!.map((a) => a.name).sort()).toEqual(['B', 'C']);
    expect(out.get(2)!.map((a) => a.name)).toEqual(['D']);
  });
});
