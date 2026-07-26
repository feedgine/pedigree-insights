// Unit tests — warn-only breeding checks (matingChecks.ts). Deterministic: the
// "as of" date is injected, never read from the clock.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import { parseDob, ageYears, checkMating, dnaStatus } from '@/lib/matingChecks';

function animal(name: string, sex: Animal['sex'], dob: string | null): Animal {
  return {
    name, sire: null, dam: null, sex, dob,
    registration: null, preTitle: null, postTitle: null,
    color: null, breed: null, coi: null, avk: null,
  };
}
const ASOF = new Date('2026-07-26T00:00:00Z');

describe('parseDob', () => {
  it('parses ISO and BreedMate US dates, rejects junk', () => {
    expect(parseDob('2020-03-15')?.getUTCFullYear()).toBe(2020);
    expect(parseDob('2020-03-15T10:00:00')?.getUTCMonth()).toBe(2); // March = 2
    expect(parseDob('3/15/2020')?.getUTCFullYear()).toBe(2020);
    expect(parseDob('')).toBeNull();
    expect(parseDob(null)).toBeNull();
    expect(parseDob('not a date')).toBeNull();
  });
});

describe('ageYears', () => {
  it('computes fractional years, null on unparseable, 0 on a future DOB', () => {
    expect(ageYears('2020-07-26', ASOF)).toBeCloseTo(6, 1);
    expect(ageYears(null, ASOF)).toBeNull();
    expect(ageYears('2030-01-01', ASOF)).toBe(0);
  });
});

describe('checkMating (warn-only, never blocks)', () => {
  it('a valid female dam + male sire in range → no warnings', () => {
    const w = checkMating(animal('Dam', 'F', '2023-01-01'), animal('Sire', 'M', '2022-01-01'), ASOF);
    expect(w).toHaveLength(0);
  });

  it('flags a sex mismatch when the dam is recorded male', () => {
    const w = checkMating(animal('Dam', 'M', '2023-01-01'), animal('Sire', 'M', '2022-01-01'), ASOF);
    expect(w.map((x) => x.kind)).toContain('sex');
  });

  it('flags an out-of-window dam (too old) but not the in-range sire', () => {
    // Dam ~14y (> 8), sire ~6y (in 1..12).
    const w = checkMating(animal('Dam', 'F', '2012-01-01'), animal('Sire', 'M', '2020-01-01'), ASOF);
    expect(w.map((x) => x.kind)).toContain('dam-age');
    expect(w.map((x) => x.kind)).not.toContain('sire-age');
  });

  it('flags an out-of-window sire (too old)', () => {
    const w = checkMating(animal('Dam', 'F', '2022-01-01'), animal('Sire', 'M', '2010-01-01'), ASOF);
    expect(w.map((x) => x.kind)).toContain('sire-age');
  });

  it('treats missing Sex / DOB as "unknown" — no false warnings', () => {
    const w = checkMating(animal('Dam', null, null), animal('Sire', null, null), ASOF);
    expect(w).toHaveLength(0);
  });

  it('never throws on null parents', () => {
    expect(checkMating(null, null, ASOF)).toEqual([]);
  });
});

describe('dnaStatus', () => {
  it('recognises words and genotype pairs; unknown otherwise', () => {
    expect(dnaStatus('Clear')).toBe('clear');
    expect(dnaStatus('Normal')).toBe('clear');
    expect(dnaStatus('Carrier')).toBe('carrier');
    expect(dnaStatus('Affected')).toBe('affected');
    expect(dnaStatus('At-risk')).toBe('affected');
    expect(dnaStatus('N/N')).toBe('clear');
    expect(dnaStatus('N/rcd4')).toBe('carrier');
    expect(dnaStatus('rcd4/rcd4')).toBe('affected');
    expect(dnaStatus('')).toBe('unknown');
    expect(dnaStatus(null)).toBe('unknown');
    expect(dnaStatus('pending')).toBe('unknown');
  });
});

describe('checkMating - recessive DNA carrier check', () => {
  const withDna = (name: string, sex: Animal['sex'], dna: Partial<Animal>): Animal => ({
    ...animal(name, sex, '2022-01-01'),
    ...dna,
  });
  it('warns when both parents are carriers of the same marker (~25% affected)', () => {
    const w = checkMating(
      withDna('Dam', 'F', { praRcd4C2orf71: 'Carrier' }),
      withDna('Sire', 'M', { praRcd4C2orf71: 'Carrier' }),
      ASOF,
    );
    const health = w.filter((x) => x.kind === 'health');
    expect(health).toHaveLength(1);
    expect(health[0].message).toMatch(/25%/);
  });
  it('warns Affected x Carrier as ~50% affected', () => {
    const w = checkMating(
      withDna('Dam', 'F', { samsKcnj10: 'Affected' }),
      withDna('Sire', 'M', { samsKcnj10: 'Carrier' }),
      ASOF,
    );
    expect(w.some((x) => x.kind === 'health' && /50%/.test(x.message))).toBe(true);
  });
  it('does NOT warn for carrier x clear (no affected risk)', () => {
    const w = checkMating(
      withDna('Dam', 'F', { praRcd4C2orf71: 'Carrier' }),
      withDna('Sire', 'M', { praRcd4C2orf71: 'Clear' }),
      ASOF,
    );
    expect(w.some((x) => x.kind === 'health')).toBe(false);
  });
  it('does NOT warn when a result is missing/unknown', () => {
    const w = checkMating(
      withDna('Dam', 'F', { praRcd4C2orf71: 'Carrier' }),
      withDna('Sire', 'M', {}),
      ASOF,
    );
    expect(w.some((x) => x.kind === 'health')).toBe(false);
  });
});
