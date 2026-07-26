// Unit tests — Appendix-C line-breeding classifier (matingClassifier.ts),
// exercised end-to-end through buildHypotheticalMating so the signatures are
// tested on real analyzeLinebreeding output.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup } from '@/lib/pedigreeAlgorithm';
import { buildHypotheticalMating } from '@/lib/hypotheticalMating';

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
const keys = (r: ReturnType<typeof buildHypotheticalMating>) =>
  r.classification.matches.map((m) => m.key);

describe('classifier signatures', () => {
  it('half-sib parents → onstott (both sides) + half-sib', () => {
    const lookup = makeLookup([
      animal('SI', 'G', 'H1', 'M'), animal('DA', 'G', 'H2', 'F'),
      animal('G', null, null, 'M'), animal('H1', null, null, 'F'), animal('H2', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(keys(r)).toContain('onstott');
    expect(keys(r)).toContain('half-sib');
    expect(r.classification.isOutcross).toBe(false);
  });

  it('full-sib parents → full-sib', () => {
    const lookup = makeLookup([
      animal('SI', 'G', 'H', 'M'), animal('DA', 'G', 'H', 'F'),
      animal('G', null, null, 'M'), animal('H', null, null, 'F'),
    ]);
    expect(keys(buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF))).toContain('full-sib');
  });

  it('parent × offspring → parent-offspring + a possible Morgan note', () => {
    const lookup = makeLookup([
      animal('DA', 'SI', 'Q', 'F'), animal('SI', null, null, 'M'), animal('Q', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(keys(r)).toContain('parent-offspring');
    const morgan = r.classification.matches.find((m) => m.key === 'morgan');
    expect(morgan?.confidence).toBe('possible');
  });

  it('an ancestor at the 2nd and 3rd generations → Brackett "Rule of Five"', () => {
    // X is the sire's sire (gen2, SS) AND appears again down the dam side at gen3
    // (D→E→X, path DSS) → occurrences at generations {2,3}.
    const lookup = makeLookup([
      animal('SI', 'X', 'A', 'M'),
      animal('A', 'B', 'C', 'F'),
      animal('DA', 'E', 'F2', 'F'),
      animal('E', 'X', 'GG', 'M'),
      animal('X', null, null, 'M'),
      animal('B', null, null, 'M'), animal('C', null, null, 'F'),
      animal('F2', null, null, 'F'), animal('GG', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 6, ASOF);
    const x = r.commonAncestors.find((a) => a.name === 'X')!;
    expect(new Set(x.occurrences.map((o) => o.generation))).toEqual(new Set([2, 3]));
    expect(keys(r)).toContain('brackett');
  });

  it('tail-line matriarchal is flagged only as "possible"', () => {
    // Q sits on the unbroken bottom (all-dam) line: litter → DA (dam) → QM (dam) → Q (dam),
    // and also once on the sire side so it is a common ancestor.
    const lookup = makeLookup([
      animal('SI', 'Q', 'SM', 'M'),
      animal('DA', 'DS', 'QM', 'F'),
      animal('QM', null, 'Q', 'F'),
      animal('Q', null, null, 'F'),
      animal('SM', null, null, 'F'), animal('DS', null, null, 'M'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 6, ASOF);
    const wy = r.classification.matches.find((m) => m.key === 'wycliffe');
    if (wy) expect(wy.confidence).toBe('possible');
  });

  it('unrelated parents → outcross, empty matches', () => {
    const lookup = makeLookup([animal('SI', 'A', 'B', 'M'), animal('DA', 'C', 'D', 'F'),
      animal('A', null, null), animal('B', null, null), animal('C', null, null), animal('D', null, null)]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.classification.isOutcross).toBe(true);
    expect(r.classification.matches).toHaveLength(0);
    expect(r.classification.outcrossNote).not.toBe('');
  });
});
