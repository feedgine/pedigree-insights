// Unit tests — the DNA Tests report (src/lib/dnaReport.ts).
//
// Two things must hold no matter what a lab or a breed registry wrote into the
// column: every dog with a result is LISTED with its value untouched, and the
// chart tally adds up to the number of listed dogs. The classifier is generous on
// purpose, so most of these cases are the real spellings seen in the owner's
// exports and in the club's published PRA-rcd4 report.
import { describe, it, expect } from 'vitest';
import type { Animal } from '@/lib/schema';
import {
  DNA_TESTS,
  DEFAULT_DNA_TEST,
  buildDnaTestReport,
  classifyGenotype,
  displayDob,
  dnaReportCsv,
  dnaTestSources,
  dnaTestTitle,
  isDnaTestId,
} from '@/lib/dnaReport';
import { FIELD_BY_ALIAS } from '@/lib/sourceFields';

/** Minimal animal carrying one DNA field, as the projection would deliver it. */
function dog(
  name: string,
  fields: Record<string, string | number | null>,
  extra: Partial<Animal> = {},
): Animal {
  return {
    name,
    sire: null,
    dam: null,
    sex: null,
    dob: null,
    registration: null,
    preTitle: null,
    postTitle: null,
    color: null,
    breed: null,
    coi: null,
    avk: null,
    fields,
    ...extra,
  };
}

/** Shorthand: a dog with a pedigree number, which lives in `Registration` (#6). */
function numbered(
  name: string,
  pedigreeNo: string,
  fields: Record<string, string | number | null>,
  extra: Partial<Animal> = {},
): Animal {
  return dog(name, fields, { registration: pedigreeNo, ...extra });
}

describe('DNA_TESTS catalogue', () => {
  it('offers the six tests the owner asked for', () => {
    expect(DNA_TESTS.map((t) => t.label)).toEqual([
      'Ataxia',
      'PRA-rcd4',
      'Wilson',
      'MDR2',
      'Factor VII',
      'CURV',
    ]);
  });

  // The whole point of keying on the alias: the SQL column is never hard-coded
  // here, so renaming a source column stays a one-line change in sourceFields.ts.
  it('every test id is an alias in the 74-column catalogue, in the DNA block', () => {
    for (const t of DNA_TESTS) {
      const f = FIELD_BY_ALIAS.get(t.id);
      expect(f, `${t.label} -> ${t.id}`).toBeDefined();
      expect(f!.col).toBeGreaterThanOrEqual(62);
      expect(f!.col).toBeLessThanOrEqual(74);
      expect(f!.sources).toContain(t.marker);
    }
  });

  it('resolves the source column names and a readable title', () => {
    expect(dnaTestSources('praRcd4C2orf71')).toContain('PRA-rcd4-C2orf71');
    expect(dnaTestTitle('samsKcnj10')).toBe('Ataxia (SAMS-KCNJ10)');
    expect(dnaTestSources('nope')).toEqual([]);
  });

  it('accepts only known ids at the IPC boundary', () => {
    expect(isDnaTestId(DEFAULT_DNA_TEST)).toBe(true);
    expect(isDnaTestId('coi')).toBe(false); // a real alias, but not a DNA test
    expect(isDnaTestId('"; DROP TABLE Pedigree; --')).toBe(false);
    expect(isDnaTestId(null)).toBe(false);
  });
});

describe('classifyGenotype', () => {
  it('reads the club report spellings', () => {
    expect(classifyGenotype('CLEAR (WT/WT)')).toBe('clear');
    expect(classifyGenotype('CARRIER (WT/MUT)')).toBe('carrier');
    expect(classifyGenotype('AFFECTED (MUT/MUT)')).toBe('affected');
  });

  it('reads bare allele pairs in the common lab notations', () => {
    expect(classifyGenotype('N/N')).toBe('clear');
    expect(classifyGenotype('n/m')).toBe('carrier');
    expect(classifyGenotype('M/M')).toBe('affected');
    expect(classifyGenotype('WT/WT')).toBe('clear');
    expect(classifyGenotype('WT/MUT')).toBe('carrier');
    expect(classifyGenotype('+/+')).toBe('clear');
  });

  it('treats a wild allele paired with a named mutation as a carrier', () => {
    expect(classifyGenotype('N/PRA')).toBe('carrier');
    expect(classifyGenotype('WT/rcd4')).toBe('carrier');
  });

  // Regression: "CLEAR (WT/WT)" contains no "MUT", but "AFFECTED (MUT/MUT)" and
  // "CARRIER (WT/MUT)" both do — the word must win over any substring hunting.
  it('lets the explicit word win over the allele text', () => {
    expect(classifyGenotype('Clear (by parentage)')).toBe('clear');
    expect(classifyGenotype('Affected (MUT/MUT) — retested')).toBe('affected');
    expect(classifyGenotype('homozygous normal')).toBe('clear');
    expect(classifyGenotype('heterozygous')).toBe('carrier');
  });

  it('falls back to "other" for blanks and anything unrecognised', () => {
    expect(classifyGenotype(null)).toBe('other');
    expect(classifyGenotype('')).toBe('other');
    expect(classifyGenotype('   ')).toBe('other');
    expect(classifyGenotype('see certificate')).toBe('other');
  });
});

describe('displayDob', () => {
  it('reformats the stored ISO datetime, and leaves other imports alone', () => {
    expect(displayDob('2022-06-13 00:00:00')).toBe('13-Jun-2022');
    expect(displayDob('13/06/2022')).toBe('13/06/2022');
    expect(displayDob('19.4.2024')).toBe('19.4.2024');
    expect(displayDob('')).toBe('');
  });
});

describe('buildDnaTestReport', () => {
  const animals = [
    numbered('Zeta', '9', { praRcd4C2orf71: 'CARRIER (WT/MUT)' }, { sire: 'Pa', dam: 'Ma' }),
    numbered('alpha', '3', { praRcd4C2orf71: 'CLEAR (WT/WT)' }, { dob: '2021-03-04 00:00:00' }),
    numbered('Beta', '7', { praRcd4C2orf71: 'AFFECTED (MUT/MUT)' }),
    numbered('Gamma', '1', { praRcd4C2orf71: '   ' }), // blank — not a result
    numbered('Delta', '2', { samsKcnj10: 'CLEAR (WT/WT)' }), // a different test only
    numbered('Epsilon', '5', { praRcd4C2orf71: 'pending' }), // unrecognised, still listed
  ];

  const report = buildDnaTestReport(animals, 'praRcd4C2orf71');

  it('lists only dogs with a result, sorted by name case-insensitively', () => {
    expect(report.rows.map((r) => r.name)).toEqual(['alpha', 'Beta', 'Epsilon', 'Zeta']);
    expect(report.total).toBe(4);
  });

  // The pedigree number is the owner's own record number, read verbatim from
  // Registration (#6) — never SQLite's rowid, and never renumbered by the app.
  it('carries the pedigree number, parents and a tidied date of birth', () => {
    const a = report.rows[0];
    expect(a.pedigreeNo).toBe('3');
    expect(a.dob).toBe('04-Mar-2021');
    const z = report.rows[3];
    expect(z.sire).toBe('Pa');
    expect(z.dam).toBe('Ma');
    expect(z.pedigreeNo).toBe('9');
  });

  it('leaves the cell empty when a dog has no registration recorded', () => {
    const r = buildDnaTestReport([dog('No Reg', { f7: 'N/N' })], 'f7');
    expect(r.rows[0].pedigreeNo).toBe('');
  });

  it('shows the genotype verbatim', () => {
    expect(report.rows[1].genotype).toBe('AFFECTED (MUT/MUT)');
    expect(report.rows[2].genotype).toBe('pending');
  });

  it('tallies slices in Clear / Carrier / Affected / Other order, adding up to the total', () => {
    expect(report.slices.map((s) => [s.id, s.count])).toEqual([
      ['clear', 1],
      ['carrier', 1],
      ['affected', 1],
      ['other', 1],
    ]);
    expect(report.slices.reduce((n, s) => n + s.count, 0)).toBe(report.total);
    expect(report.slices.every((s) => s.percent === 25)).toBe(true);
  });

  it('omits empty slices', () => {
    const clearOnly = buildDnaTestReport(
      [dog('One', { f7: 'N/N' }), dog('Two', { f7: 'CLEAR (WT/WT)' })],
      'f7',
    );
    expect(clearOnly.slices).toHaveLength(1);
    expect(clearOnly.slices[0]).toMatchObject({ id: 'clear', count: 2, percent: 100 });
  });

  // A database exported before the DNA block existed must read as "no column",
  // which the UI words differently from "column present, nobody tested".
  it('reports an absent column without throwing', () => {
    const none = buildDnaTestReport([], 'curN', false);
    expect(none.columnPresent).toBe(false);
    expect(none.total).toBe(0);
    expect(none.slices).toEqual([]);
    expect(none.testTitle).toBe('CURV (CUR/N)');
  });
});

describe('dnaReportCsv', () => {
  const report = buildDnaTestReport(
    [
      numbered('Chezzay, "Ruby"', '12', { praRcd4C2orf71: 'CLEAR (WT/WT)' }, { sire: 'A', dam: 'B' }),
      dog('LUMIVYÖRYN RAISU', { praRcd4C2orf71: 'CARRIER (WT/MUT)' }),
    ],
    'praRcd4C2orf71',
  );
  const csv = dnaReportCsv(report, '27-Aug-2026');
  const lines = csv.split('\r\n');

  it('leads with a summary block naming the test, the date and the tally', () => {
    expect(lines[0]).toContain('PRA-rcd4 (PRA-rcd4-C2orf71)');
    expect(lines[1]).toBe('Generated,27-Aug-2026');
    expect(lines[2]).toBe('Dogs with a result,2');
    expect(lines[3]).toBe('Clear (WT/WT),1,50.0%');
  });

  it('writes the report columns in the on-screen order', () => {
    const header = lines[lines.indexOf('') + 1];
    expect(header).toBe(
      'Pedigree No.,Dog\'s registered name,PRA-rcd4 genotype,Sire (father\'s name),Dam (mother\'s name),Date of birth',
    );
  });

  it('quotes fields containing commas or quotes, and leaves accents intact', () => {
    const rows = lines.slice(lines.indexOf('') + 2);
    expect(rows[0]).toBe('12,"Chezzay, ""Ruby""",CLEAR (WT/WT),A,B,');
    expect(rows[1]).toContain('LUMIVYÖRYN RAISU');
    // No registration recorded → an empty first field, not "null" or "undefined".
    expect(rows[1].startsWith(',')).toBe(true);
  });

  it('emits one data row per listed dog', () => {
    const rows = lines.slice(lines.indexOf('') + 2).filter((l) => l !== '');
    expect(rows).toHaveLength(report.total);
  });
});
