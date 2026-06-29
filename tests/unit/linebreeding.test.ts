// Unit tests — pure linebreeding analysis, no real DB. The lookup is an
// in-memory, case-insensitive map (modelling SQL COLLATE NOCASE).
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { analyzeLinebreeding, DEFAULT_MIN_CROSSES } from '@/lib/linebreeding';

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

// Subject A. Both parents (B, C) share the same sire D → D is a common ancestor
// reached once via the sire side and once via the dam side.
const LINEBRED = makeLookup([
  animal('A', 'B', 'C', 'M'),
  animal('B', 'D', 'E', 'M'),
  animal('C', 'D', 'F', 'F'),
  animal('D', null, null, 'M'),
  animal('E', null, null, 'F'),
  animal('F', null, null, 'F'),
]);

describe('analyzeLinebreeding — common ancestors', () => {
  it('finds the repeated ancestor with one cross per side', () => {
    const r = analyzeLinebreeding(LINEBRED, 'A', 3);
    expect(r.found).toBe(true);
    expect(r.subject).toBe('A');
    expect(r.ancestors.map((a) => a.name)).toEqual(['D']);

    const d = r.ancestors[0];
    expect(d.crosses).toBe(2);
    expect(d.sireLines).toBe(1);
    expect(d.damLines).toBe(1);
    expect(d.closest).toBe(2);
    expect(d.occurrences.map((o) => o.path).sort()).toEqual(['DS', 'SS']);
  });

  it('builds PedigreeOnline-style notation (case encodes sex; D is male → upper)', () => {
    const r = analyzeLinebreeding(LINEBRED, 'A', 3);
    expect(r.ancestors[0].notation).toBe('2S x 2D');
    expect(r.ancestors[0].closestPair).toBe('2x2');
  });

  it('lower-cases the cross letter for a female common ancestor', () => {
    // E is the dam of both B and C → female common ancestor, both on... actually
    // make a clean female-repeat case:
    const fam = makeLookup([
      animal('X', 'Y', 'Z', 'M'),
      animal('Y', null, 'Q', 'M'),
      animal('Z', null, 'Q', 'F'),
      animal('Q', null, null, 'F'),
    ]);
    const r = analyzeLinebreeding(fam, 'X', 3);
    expect(r.ancestors.map((a) => a.name)).toEqual(['Q']);
    // Q at gen2 on sire side and gen2 on dam side; female → lower-case.
    expect(r.ancestors[0].notation).toBe('2s x 2d');
  });
});

describe('analyzeLinebreeding — counts & filters', () => {
  it('excludes the subject and counts unique vs total correctly', () => {
    const r = analyzeLinebreeding(LINEBRED, 'A', 3, 1);
    // Ancestors with a row: B,C,D(x2),E,F → 6 slots, 5 unique.
    expect(r.totalCrosses).toBe(6);
    expect(r.uniqueAncestors).toBe(5);
  });

  it('minCrosses filters out single-appearance ancestors (default 2)', () => {
    const r = analyzeLinebreeding(LINEBRED, 'A', 3);
    expect(r.minCrosses).toBe(DEFAULT_MIN_CROSSES);
    expect(r.ancestors.every((a) => a.crosses >= 2)).toBe(true);
    expect(r.ancestors.map((a) => a.name)).not.toContain('B');
  });

  it('flags ancestors that appear in the final generation walked', () => {
    // At depth 2, D sits exactly at generation 2 (= cap) → inFinalGeneration.
    const r = analyzeLinebreeding(LINEBRED, 'A', 2);
    expect(r.ancestors[0].inFinalGeneration).toBe(true);
    // At depth 3, D is still at gen 2 but the cap is 3 → not final.
    const r3 = analyzeLinebreeding(LINEBRED, 'A', 3);
    expect(r3.ancestors[0].inFinalGeneration).toBe(false);
  });
});

describe('analyzeLinebreeding — genetics columns', () => {
  it('computes Blood % (structural) and passes through stored COI, but leaves AGR null', () => {
    const withCoi = makeLookup([
      { ...animal('A', 'B', 'C', 'M'), coi: 6.25 },
      { ...animal('B', 'D', 'E', 'M') },
      { ...animal('C', 'D', 'F', 'F') },
      { ...animal('D', null, null, 'M'), coi: 1.5, avk: 3 },
      { ...animal('E', null, null, 'F') },
      { ...animal('F', null, null, 'F') },
    ]);
    const r = analyzeLinebreeding(withCoi, 'A', 3, 1);
    // Subject's stored COI surfaces in the header fields.
    expect(r.subjectCoi).toBe(6.25);
    const d = r.ancestors.find((a) => a.name === 'D')!;
    // D carries its own stored COI (display-only, validated genetics).
    expect(d.coi).toBe(1.5);
    // Blood % IS computed in-app: D appears at gen2 (sire) + gen2 (dam) →
    // ½² + ½² = 0.5 = 50 %, and its equivalent-cross Influence is 2x2.
    expect(d.bloodPercent).toBeCloseTo(50, 10);
    expect(d.influence).toBe('2x2');
    // AGR is relationship-matrix genetics, supplied separately → still null.
    expect(d.agr).toBeNull();
  });

  it('Blood % sums ½^gen across uneven cross depths and ranks top influencers first', () => {
    // G is a parent (gen1, dam) AND a great-grandparent (gen3, sire):
    // ½¹ + ½³ = 0.625 = 62.5 %  → Influence 2x2 (the PedigreeOnline reference row).
    const fam = makeLookup([
      animal('S', 'P', 'G', 'M'), // subject: sire P, dam G
      animal('P', 'H', 'I', 'M'),
      animal('H', 'G', 'J', 'M'), // H's sire is G → G reappears at gen3 sire side
      animal('I', null, null, 'F'),
      animal('G', null, null, 'F'),
      animal('J', null, null, 'F'),
    ]);
    const r = analyzeLinebreeding(fam, 'S', 4, 2);
    const g = r.ancestors[0]; // highest Blood % ranks first
    expect(g.name).toBe('G');
    expect(g.crosses).toBe(2);
    expect(g.bloodPercent).toBeCloseTo(62.5, 10);
    expect(g.influence).toBe('2x2');
  });

  it('reports null subject COI when the external script has not run', () => {
    const r = analyzeLinebreeding(LINEBRED, 'A', 3);
    expect(r.subjectCoi).toBeNull();
    expect(r.subjectAvk).toBeNull();
  });
});

describe('analyzeLinebreeding — guards', () => {
  it('respects the depth cap (no crosses beyond it)', () => {
    const deep = makeLookup([
      animal('A', 'B', 'C', 'M'),
      animal('B', 'G', null, 'M'),
      animal('C', 'G', null, 'F'),
      animal('G', 'H', null, 'M'),
      animal('H', null, null, 'M'),
    ]);
    // G is the repeated ancestor at gen 2. At depth 1 nothing repeats yet.
    expect(analyzeLinebreeding(deep, 'A', 1).ancestors).toHaveLength(0);
    expect(analyzeLinebreeding(deep, 'A', 2).ancestors.map((a) => a.name)).toEqual(['G']);
  });

  it('terminates on a self-referential pedigree (cycle guard)', () => {
    const looping = makeLookup([animal('X', 'X', 'Y', 'M'), animal('Y', null, null, 'F')]);
    const r = analyzeLinebreeding(looping, 'X', 13, 1);
    // X is its own sire: the subject X is already on the path, so the sire-X
    // edge is an immediate cycle and is stopped — X is never recorded as an
    // ancestor. Only the dam Y is recorded. Must not hang.
    expect(r.ancestors.find((a) => a.name === 'X')).toBeUndefined();
    expect(r.totalCrosses).toBe(1); // just Y at generation 1
  });

  it('returns found=false for an unknown subject', () => {
    const r = analyzeLinebreeding(LINEBRED, '__nope__', 3);
    expect(r.found).toBe(false);
    expect(r.ancestors).toHaveLength(0);
    expect(r.totalCrosses).toBe(0);
  });

  it('matches the subject case-insensitively', () => {
    const r = analyzeLinebreeding(LINEBRED, '  a  ', 3);
    expect(r.found).toBe(true);
    expect(r.subject).toBe('A');
  });
});
