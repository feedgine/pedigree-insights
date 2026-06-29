// Unit tests — contribution DP + foundation report + list parsing. Pure logic,
// in-memory case-insensitive lookup (models SQL COLLATE NOCASE).
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import type { AnimalLookup } from '@/lib/pedigreeAlgorithm';
import {
  computeContributions,
  buildFoundationReport,
  parseFoundationList,
} from '@/lib/contribution';

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

// Subject A; both parents B and C share sire D → D is a common ancestor at gen 2.
const FAMILY = makeLookup([
  animal('A', 'B', 'C', 'M'),
  animal('B', 'D', 'E', 'M'),
  animal('C', 'D', 'F', 'F'),
  animal('D', null, null, 'M'),
  animal('E', null, null, 'F'),
  animal('F', null, null, 'F'),
]);

describe('computeContributions — Wright blood contribution', () => {
  it('parents contribute 1/2, grandparents 1/4 (summed over paths)', () => {
    const r = computeContributions(FAMILY, 'A');
    expect(r.found).toBe(true);
    const get = (n: string) => r.byName.get(n)!;
    expect(get('b').contribution).toBeCloseTo(0.5, 10);
    expect(get('c').contribution).toBeCloseTo(0.5, 10);
    // D appears via B (gen2) and via C (gen2): 1/4 + 1/4 = 1/2.
    expect(get('d').contribution).toBeCloseTo(0.5, 10);
    expect(get('d').closest).toBe(2);
    expect(get('d').crosses).toBe(2);
    // E and F appear once each at gen 2.
    expect(get('e').contribution).toBeCloseTo(0.25, 10);
    expect(get('f').contribution).toBeCloseTo(0.25, 10);
  });

  it('excludes the subject and stops when lines end', () => {
    const r = computeContributions(FAMILY, 'A');
    expect(r.byName.has('a')).toBe(false);
    expect(r.generations).toBe(2); // D/E/F are foundation → walk ends at gen 2
  });

  it('terminates and converges on a self-referential pedigree (cycle)', () => {
    const looping = makeLookup([animal('X', 'X', 'Y', 'M'), animal('Y', null, null, 'F')]);
    const r = computeContributions(looping, 'X');
    // X is its own sire → contribution 1/2 + 1/4 + 1/8 + … → ~1 (bounded by cap).
    const x = r.byName.get('x')!;
    expect(x.contribution).toBeGreaterThan(0.99);
    expect(x.contribution).toBeLessThanOrEqual(1);
    expect(r.generations).toBeLessThanOrEqual(r.cap);
  });
});

describe('buildFoundationReport', () => {
  it('reports presence and contribution for supplied foundation dogs', () => {
    const r = buildFoundationReport(FAMILY, 'A', ['D', 'Ghost']);
    expect(r.found).toBe(true);
    expect(r.totalSupplied).toBe(2);
    expect(r.presentCount).toBe(1);

    const d = r.rows.find((x) => x.name === 'D')!;
    expect(d.inDatabase).toBe(true);
    expect(d.present).toBe(true);
    expect(d.contribution).toBeCloseTo(0.5, 10);
    expect(d.closest).toBe(2);

    const ghost = r.rows.find((x) => x.query === 'Ghost')!;
    expect(ghost.inDatabase).toBe(false);
    expect(ghost.present).toBe(false);
    expect(ghost.contribution).toBe(0);
    expect(ghost.closest).toBeNull();
  });

  it('matches foundation names case-insensitively', () => {
    const r = buildFoundationReport(FAMILY, 'A', ['  d  ']);
    expect(r.rows[0].present).toBe(true);
    expect(r.rows[0].name).toBe('D');
  });

  it('combined contribution sums present rows', () => {
    const r = buildFoundationReport(FAMILY, 'A', ['E', 'F']);
    expect(r.combinedContribution).toBeCloseTo(0.5, 10); // 0.25 + 0.25
  });
});

describe('parseFoundationList', () => {
  it('reads one name per line, trims, drops blanks', () => {
    expect(parseFoundationList('Rex\n  Bella \n\nMax\n')).toEqual(['Rex', 'Bella', 'Max']);
  });
  it('takes the first CSV column and strips quotes', () => {
    expect(parseFoundationList('"Rex Voss",M,2010\nBella,F')).toEqual(['Rex Voss', 'Bella']);
  });
  it('skips a header row and de-duplicates case-insensitively', () => {
    expect(parseFoundationList('Name\nRex\nrex\nREX\nBella')).toEqual(['Rex', 'Bella']);
  });
});
