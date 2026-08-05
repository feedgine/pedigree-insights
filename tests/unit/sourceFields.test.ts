// Unit tests — the 74-column source layout catalogue (sourceFields.ts) and
// the projection it drives. The catalogue is the contract between the source .db,
// the SQL projection, the model, and the Pedigree tab, so it is asserted directly:
// a typo in a column name here would silently blank a field in the UI.
//
// Source of truth for the expected names: source-column-mapping.html (owner's
// import layout, 2026-08-02) — mirrored in docs/schema-map.md.
import { describe, it, expect } from 'vitest';
import {
  SOURCE_FIELDS,
  DNA_TEST_FIELDS,
  HEALTH_FIELDS,
  FIELD_BY_ALIAS,
  PANEL_GROUPS,
  fieldText,
  presentFields,
} from '@/lib/sourceFields';
import { buildSelectCols } from '@/lib/queries';
import { toAnimal, type Animal, type AnimalRow } from '@/lib/schema';

describe('the 74-column catalogue is well formed', () => {
  it('has exactly 74 entries, numbered 1..74 in order', () => {
    expect(SOURCE_FIELDS).toHaveLength(74);
    expect(SOURCE_FIELDS.map((f) => f.col)).toEqual(
      Array.from({ length: 74 }, (_, i) => i + 1),
    );
  });

  it('has unique aliases that are safe as bare SQL identifiers', () => {
    const aliases = SOURCE_FIELDS.map((f) => f.as);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const a of aliases) expect(a).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it('gives every field at least one source column and a label', () => {
    for (const f of SOURCE_FIELDS) {
      expect(f.sources.length).toBeGreaterThan(0);
      expect(f.label.trim()).not.toBe('');
    }
  });

  it('indexes every field by alias', () => {
    expect(FIELD_BY_ALIAS.size).toBe(SOURCE_FIELDS.length);
    expect(FIELD_BY_ALIAS.get('praRcd4C2orf71')?.col).toBe(68);
  });
});

describe('column numbers match the agreed import layout', () => {
  // Spot-checks on the positions that have bitten us or that carry real data.
  it.each([
    [1, 'Name'],
    [6, 'Registration'],
    [13, 'Hip Score'],
    [14, 'Elbow Score'],
    [16, 'Studbook No.'],
    [21, 'Call Name'],
    [27, 'Register'],
    [45, 'Additional Reg No.'],
    [53, 'Died Date'],
  ])('column #%i is "%s"', (col, source) => {
    expect(SOURCE_FIELDS[col - 1].sources).toContain(source);
  });

  it('reads registry codes from Register (#27), not Studbook No. (#16)', () => {
    // The owner's import moved JKC/FIN/SKK/ANKC codes into Register; Studbook No.
    // is now empty. Both are projected, but they are DIFFERENT fields.
    const register = FIELD_BY_ALIAS.get('register');
    const studbook = FIELD_BY_ALIAS.get('studbookNo');
    expect(register?.col).toBe(27);
    expect(studbook?.col).toBe(16);
    expect(register?.sources).toEqual(['Register']);
  });

  it('keeps the export-dependent COI/AVK spellings', () => {
    expect(FIELD_BY_ALIAS.get('coi')?.sources).toEqual(['Inbreeding Coefficient', 'COI']);
    expect(FIELD_BY_ALIAS.get('avk')?.sources).toEqual(['Relationship Coefficient', 'AVK']);
  });

  it('keeps the photo fallback chain', () => {
    expect(FIELD_BY_ALIAS.get('photo')?.sources).toEqual([
      'Photo', 'HTML Photo', 'Photo #2', 'Photo #3', 'Photo #4',
    ]);
  });
});

describe('the DNA test block is columns #62–#74', () => {
  it('holds all 13 test columns in source order', () => {
    expect(DNA_TEST_FIELDS.map((f) => f.sources[0])).toEqual([
      'MH', 'LTE', 'PATELLA', 'ECVO', 'WD-ATP7B', 'SAMS-KCNJ10',
      'PRA-rcd4-C2orf71', 'MDR2-ABCB1', 'F7', 'CUR/N', 'DMD-CFAX', 'H', 'DNA-COI',
    ]);
  });

  it('files every one of them under the genetics group', () => {
    for (const f of DNA_TEST_FIELDS) expect(f.group).toBe('genetics');
  });

  it('keeps genomic DNA-COI (#74) distinct from the stored pedigree COI (#46)', () => {
    expect(FIELD_BY_ALIAS.get('dnaCoi')?.col).toBe(74);
    expect(FIELD_BY_ALIAS.get('coi')?.col).toBe(46);
    expect(FIELD_BY_ALIAS.get('dnaCoi')?.label).not.toBe(FIELD_BY_ALIAS.get('coi')?.label);
  });

  it('separates clinical screening from the DNA block', () => {
    const health = HEALTH_FIELDS.map((f) => f.as);
    expect(health).toContain('hipScore');
    expect(health).toContain('elbowScore');
    expect(health).not.toContain('praRcd4C2orf71');
  });

  it('never surfaces internal mark flags in the panel', () => {
    expect(PANEL_GROUPS.map((g) => g.group)).not.toContain('internal');
    expect(FIELD_BY_ALIAS.get('marksBits')?.group).toBe('internal');
  });
});

describe('buildSelectCols projects the whole catalogue', () => {
  const ALL = new Set(SOURCE_FIELDS.flatMap((f) => f.sources));

  it('emits one aliased column per catalogue entry', () => {
    const sql = buildSelectCols(ALL);
    for (const f of SOURCE_FIELDS) expect(sql).toContain(` AS ${f.as}`);
  });

  it('quotes column names containing spaces, dots and slashes', () => {
    const sql = buildSelectCols(ALL);
    expect(sql).toContain('"Additional Reg No." AS additionalRegNo');
    expect(sql).toContain('"CUR/N" AS curN');
    expect(sql).toContain('"PRA-rcd4-C2orf71" AS praRcd4C2orf71');
    expect(sql).toContain('"_Marks" AS marksBits');
  });

  it('degrades every absent extended column to NULL instead of failing', () => {
    // An older export with only the mandatory contract columns.
    const sql = buildSelectCols(new Set(['Name', 'Sire', 'Dam']));
    expect(sql).toContain('NULL AS mh');
    expect(sql).toContain('NULL AS dnaCoi');
    expect(sql).toContain('NULL AS elbowScore');
    expect(sql).toContain('NULL AS register');
    // and must not reference a column that isn't there
    expect(sql).not.toContain('"Elbow Score"');
  });
});

describe('toAnimal exposes the extended columns on Animal.fields', () => {
  const row = {
    name: 'Test Dog',
    sire: null,
    dam: null,
    sexRaw: 'M',
    dob: '2020-01-02 00:00:00',
    registration: 'JSF-1',
    preTitle: null,
    postTitle: null,
    color: null,
    breed: null,
    coi: 0.0625,
    avk: 87.5,
    register: 'JKC',
    elbowScore: '0',
    patella: '0/0',
    dnaCoi: '8.1',
    h: '  ', // blank → dropped
  } as unknown as AnimalRow;

  const animal: Animal = toAnimal(row);

  it('carries every projected value through verbatim', () => {
    expect(animal.fields?.register).toBe('JKC');
    expect(animal.fields?.elbowScore).toBe('0');
    expect(animal.fields?.patella).toBe('0/0');
    expect(animal.fields?.coi).toBe(0.0625); // verbatim, NOT scaled here
    expect(animal.fields?.avk).toBe(87.5);
  });

  it('drops blank and NULL columns so "has a value" is one null check', () => {
    expect(animal.fields?.h).toBeUndefined();
    expect(animal.fields?.mh).toBeUndefined();
    expect(fieldText(animal, FIELD_BY_ALIAS.get('h')!)).toBeNull();
    expect(fieldText(animal, FIELD_BY_ALIAS.get('register')!)).toBe('JKC');
  });

  it('lists only the fields that are present', () => {
    const dna = presentFields(animal, DNA_TEST_FIELDS);
    expect(dna.map((d) => d.key)).toEqual(['patella', 'dnaCoi']);
    expect(dna[0].label).toBe('Patella');
  });

  it('keeps the existing named properties working', () => {
    expect(animal.name).toBe('Test Dog');
    expect(animal.sex).toBe('M');
    expect(animal.coi).toBe(0.0625);
  });
});
