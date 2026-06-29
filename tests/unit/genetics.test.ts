// Unit tests — in-app relationship-matrix genetics (genetics.ts). Each case has a
// textbook exact answer, so these validate the engine independently of any DB.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { createGeneticsEngine, applyGenetics, ancestorLossPercent } from '@/lib/genetics';
import { analyzeLinebreeding } from '@/lib/linebreeding';

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

describe('genetics — Coefficient of Inbreeding (known exact values)', () => {
  it('unrelated parents → F = 0', () => {
    const g = createGeneticsEngine(makeLookup([
      animal('O', 'S', 'D'), animal('S', null, null), animal('D', null, null),
    ]));
    expect(g.inbreeding('O')).toBeCloseTo(0, 12);
  });

  it('parent × offspring mating → F = 0.25', () => {
    // O = S×D; P = O×S (offspring bred back to its sire).
    const g = createGeneticsEngine(makeLookup([
      animal('P', 'O', 'S'),
      animal('O', 'S', 'D'),
      animal('S', null, null), animal('D', null, null),
    ]));
    expect(g.inbreeding('P')).toBeCloseTo(0.25, 12);
  });

  it('full-sib mating → F = 0.25', () => {
    // S and D are full sibs (both G×H); O = S×D.
    const g = createGeneticsEngine(makeLookup([
      animal('O', 'S', 'D'),
      animal('S', 'G', 'H'), animal('D', 'G', 'H'),
      animal('G', null, null), animal('H', null, null),
    ]));
    expect(g.inbreeding('O')).toBeCloseTo(0.25, 12);
  });

  it('half-sib mating → F = 0.125', () => {
    // S and D share only the sire G; O = S×D.
    const g = createGeneticsEngine(makeLookup([
      animal('O', 'S', 'D'),
      animal('S', 'G', 'H'), animal('D', 'G', 'I'),
      animal('G', null, null), animal('H', null, null), animal('I', null, null),
    ]));
    expect(g.inbreeding('O')).toBeCloseTo(0.125, 12);
  });

  it('unknown parent → F = 0 (line ends gracefully)', () => {
    const g = createGeneticsEngine(makeLookup([
      animal('O', 'S', null), animal('S', null, null),
    ]));
    expect(g.inbreeding('O')).toBeCloseTo(0, 12);
  });
});

describe('genetics — Additive Genetic Relationship (AGR = 2·coancestry)', () => {
  it('parent ↔ offspring AGR = 50% (and equals Blood % for a non-inbred parent)', () => {
    const g = createGeneticsEngine(makeLookup([
      animal('X', 'A', 'B'), animal('A', null, null), animal('B', null, null),
    ]));
    expect(g.additiveRelationship('X', 'A')).toBeCloseTo(0.5, 12);
  });

  it('AGR(X,X) = 1 + F_X', () => {
    const g = createGeneticsEngine(makeLookup([
      animal('O', 'S', 'D'),
      animal('S', 'G', 'H'), animal('D', 'G', 'H'), // O is full-sib-bred, F=0.25
      animal('G', null, null), animal('H', null, null),
    ]));
    expect(g.additiveRelationship('O', 'O')).toBeCloseTo(1.25, 12);
  });

  it('inbred ancestor: AGR exceeds the structural Blood % by the (1+F_A) factor', () => {
    // A is itself full-sib-bred → F_A = 0.25. A is X's sire; Z unrelated.
    // Blood %(A→X) = ½ = 50 %, but AGR = (1+F_A)·Blood% = 1.25×0.5 = 62.5 %.
    const g = createGeneticsEngine(makeLookup([
      animal('X', 'A', 'Z'),
      animal('A', 'S1', 'S2'),
      animal('S1', 'G', 'H'), animal('S2', 'G', 'H'),
      animal('G', null, null), animal('H', null, null), animal('Z', null, null),
    ]));
    expect(g.inbreeding('A')).toBeCloseTo(0.25, 12);
    expect(g.additiveRelationship('X', 'A')).toBeCloseTo(0.625, 12);
  });
});

describe('genetics — cycle detection & termination (CLAUDE.md)', () => {
  it('returns a finite value on a circular pedigree instead of hanging', () => {
    // Deliberately broken data: X is listed as its own grandsire.
    const g = createGeneticsEngine(makeLookup([
      animal('X', 'P', 'Q'), animal('P', 'X', null), animal('Q', null, null),
    ]));
    expect(Number.isFinite(g.inbreeding('X'))).toBe(true);
  });

  it('surfaces a cycle as a warning (data error), not silently', () => {
    const lookup = makeLookup([
      animal('X', 'P', 'Q'), animal('P', 'X', null), animal('Q', null, null),
    ]);
    const report = analyzeLinebreeding(lookup, 'X', 5, 1);
    applyGenetics(report, lookup);
    expect(report.geneticsWarnings && report.geneticsWarnings.length).toBeGreaterThan(0);
    // The reported edge names the child and the offending parent.
    const w = report.geneticsWarnings![0];
    expect(w.child.toUpperCase()).toBe('P');
    expect(w.parent.toUpperCase()).toBe('X');
  });
});

describe('genetics — Ancestor-Loss Coefficient (AVK), BigInt-safe', () => {
  it('matches unique ÷ (2^(g+1)-2) as a percentage', () => {
    // 469 unique in 13 generations: 469 / (2^14 - 2) = 469 / 16382 = 2.863 %.
    expect(ancestorLossPercent(469, 13)).toBeCloseTo(2.863, 2);
  });
  it('does not overflow for deep pedigrees (100+ generations)', () => {
    // 2^101 - 2 is far beyond float64 integer precision; BigInt keeps it finite.
    const avk = ancestorLossPercent(5000, 100);
    expect(Number.isFinite(avk)).toBe(true);
    expect(avk).toBeGreaterThanOrEqual(0);
  });
});
