// Unit tests — the Hypothetical Mating planning engine (hypotheticalMating.ts).
// The core guarantee: the projected litter's COI equals the coancestry of the two
// chosen parents, computed by the SAME validated engine used elsewhere. No DB.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup, PedigreeTreeNode } from '@/lib/pedigreeAlgorithm';
import { createGeneticsEngine } from '@/lib/genetics';
import {
  buildHypotheticalMating,
  makeMatingLookup,
  clampMatingGenerations,
  PLANNED_LITTER_NAME,
  HYPOTHETICAL_MATING_MIN_GENERATIONS,
  HYPOTHETICAL_MATING_MAX_GENERATIONS,
  HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS,
} from '@/lib/hypotheticalMating';

function animal(name: string, sire: string | null, dam: string | null, sex: Animal['sex'] = null): Animal {
  return {
    name, sire, dam, sex, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null,
  };
}
function makeLookup(animals: Animal[]): AnimalLookup {
  const map = new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
  return (name: string) => map.get(name.trim().toLowerCase()) ?? null;
}
const ASOF = new Date('2026-07-26T00:00:00Z');

describe('makeMatingLookup — virtual offspring, real DB untouched', () => {
  const base = makeLookup([animal('SI', null, null, 'M'), animal('DA', null, null, 'F')]);
  it('resolves the litter to the two parents and passes everything else through', () => {
    const ml = makeMatingLookup(base, 'SI', 'DA');
    const litter = ml(PLANNED_LITTER_NAME)!;
    expect(litter.sire).toBe('SI');
    expect(litter.dam).toBe('DA');
    expect(ml('SI')!.name).toBe('SI');
    expect(ml('__nope__')).toBeNull();
  });
});

describe('litter COI = coancestry(sire, dam)', () => {
  it('unrelated parents → COI 0, an outcross, no common ancestors', () => {
    const lookup = makeLookup([animal('SI', null, null, 'M'), animal('DA', null, null, 'F')]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.found).toBe(true);
    expect(r.litterCoi).toBeCloseTo(0, 10);
    expect(r.commonAncestors).toHaveLength(0);
    expect(r.classification.isOutcross).toBe(true);
    // The chart root is the virtual litter with the two parents beneath it.
    expect(r.tree.animal?.name).toBe(PLANNED_LITTER_NAME);
    expect(r.tree.sire?.animal?.name).toBe('SI');
    expect(r.tree.dam?.animal?.name).toBe('DA');
  });

  it('half-sib parents (one shared parent) → litter COI ≈ 12.5%', () => {
    const lookup = makeLookup([
      animal('SI', 'G', 'H1', 'M'),
      animal('DA', 'G', 'H2', 'F'),
      animal('G', null, null, 'M'), animal('H1', null, null, 'F'), animal('H2', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.litterCoi).toBeCloseTo(12.5, 6);
    // Cross-check against the shared engine's coancestry of the parents.
    const eng = createGeneticsEngine(lookup);
    expect(r.litterCoi! / 100).toBeCloseTo(eng.coancestry('SI', 'DA'), 12);
    // G is common to both sides.
    expect(r.commonAncestors.map((a) => a.name)).toContain('G');
  });

  it('full-sib parents (both parents shared) → litter COI ≈ 25%', () => {
    const lookup = makeLookup([
      animal('SI', 'G', 'H', 'M'),
      animal('DA', 'G', 'H', 'F'),
      animal('G', null, null, 'M'), animal('H', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.litterCoi).toBeCloseTo(25, 6);
  });

  it('parent × offspring → litter COI ≈ 25%', () => {
    // DA is bred from SI (SI is DA's sire); mating SI × DA is a backcross.
    const lookup = makeLookup([
      animal('DA', 'SI', 'Q', 'F'),
      animal('SI', null, null, 'M'), animal('Q', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.litterCoi).toBeCloseTo(25, 6);
  });
});

describe('buildHypotheticalMating — plumbing', () => {
  it('reports found=false when a parent is missing (no throw)', () => {
    const lookup = makeLookup([animal('SI', null, null, 'M')]);
    const r = buildHypotheticalMating(lookup, 'SI', '__nope__', 5, ASOF);
    expect(r.found).toBe(false);
  });

  it('clamps the depth into the 3–10 window', () => {
    expect(clampMatingGenerations(100)).toBe(HYPOTHETICAL_MATING_MAX_GENERATIONS);
    expect(clampMatingGenerations(1)).toBe(HYPOTHETICAL_MATING_MIN_GENERATIONS);
    expect(clampMatingGenerations(5)).toBe(5);
    const lookup = makeLookup([animal('SI', null, null, 'M'), animal('DA', null, null, 'F')]);
    expect(buildHypotheticalMating(lookup, 'SI', 'DA', 100, ASOF).generations).toBe(10);
  });

  it('runs warn-only checks (a female×male, no-DOB pair yields no warnings)', () => {
    const lookup = makeLookup([animal('SI', null, null, 'M'), animal('DA', null, null, 'F')]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.warnings).toHaveLength(0);
  });

  it('never hangs on a circular pedigree and surfaces the cycle', () => {
    const lookup = makeLookup([
      animal('SI', 'P', 'Q', 'M'), animal('P', 'SI', null, 'M'), animal('Q', null, null, 'F'),
      animal('DA', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 8, ASOF);
    expect(Number.isFinite(r.litterCoi ?? NaN)).toBe(true);
    expect((r.geneticsWarnings ?? []).length).toBeGreaterThan(0);
  });
});

function treeDepth(node: PedigreeTreeNode): number {
  let d = node.generation;
  if (node.sire) d = Math.max(d, treeDepth(node.sire));
  if (node.dam) d = Math.max(d, treeDepth(node.dam));
  return d;
}

describe('projected chart is capped for legibility (analysis keeps full depth)', () => {
  it('caps the drawn bracket at HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS', () => {
    // A long sire line (8 deep) on SI; DA unrelated. Analysis depth 10, chart cap 6.
    const chain: Animal[] = [animal('SI', 'S1', null, 'M'), animal('DA', null, null, 'F')];
    for (let i = 1; i <= 8; i++) {
      chain.push(animal(`S${i}`, i < 8 ? `S${i + 1}` : null, null, 'M'));
    }
    const r = buildHypotheticalMating(makeLookup(chain), 'SI', 'DA', 10, ASOF);
    expect(r.generations).toBe(10);                                   // analysis honours the selection
    expect(r.chartGenerations).toBe(HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS); // = 6
    // The tree is truncated to the chart cap (deepest node at generation 6, not 8+).
    expect(treeDepth(r.tree)).toBe(HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS);
  });

  it('does not cap when the selected depth is already within the chart limit', () => {
    const lookup = makeLookup([animal('SI', null, null, 'M'), animal('DA', null, null, 'F')]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.chartGenerations).toBe(5);
  });
});
