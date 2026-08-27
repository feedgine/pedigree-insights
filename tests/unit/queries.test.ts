// Unit tests — schema-adaptive projection. Source exports name the genetics
// columns differently ("Inbreeding Coefficient"/"Relationship Coefficient" in
// the sample; "COI"/"AVK" in real exports). buildSelectCols must adapt to the
// columns actually present, and never select a non-existent column.
import { describe, it, expect } from 'vitest';
import {
  buildSelectCols,
  listByFieldSql,
  quoteIdent,
  missingRequiredColumns,
  getAnimalSql,
  getChildrenSql,
  searchAnimalsSql,
  REQUIRED_COLUMNS,
} from '@/lib/queries';

const CORE = ['Name', 'Sire', 'Dam', 'Sex', 'DOB', 'Registration', 'PreTitle', 'PostTitle', 'Color', 'Breed'];

describe('buildSelectCols — genetics column variation', () => {
  it('uses the long names when present (sample DB schema)', () => {
    const cols = new Set([...CORE, 'Inbreeding Coefficient', 'Relationship Coefficient']);
    const sql = buildSelectCols(cols);
    expect(sql).toContain('"Inbreeding Coefficient" AS coi');
    expect(sql).toContain('"Relationship Coefficient" AS avk');
    expect(sql).not.toContain('NULL AS coi');
  });

  it('uses the short names when present (real export schema)', () => {
    const cols = new Set([...CORE, 'COI', 'AVK']);
    const sql = buildSelectCols(cols);
    expect(sql).toContain('"COI" AS coi');
    expect(sql).toContain('"AVK" AS avk');
  });

  it('falls back to NULL when neither genetics column exists', () => {
    const sql = buildSelectCols(new Set(CORE));
    expect(sql).toContain('NULL AS coi');
    expect(sql).toContain('NULL AS avk');
    // Must never reference a column that is not present.
    expect(sql).not.toContain('Inbreeding Coefficient');
    expect(sql).not.toContain('"COI"');
  });

  it('always projects the core identity columns with their aliases', () => {
    const sql = buildSelectCols(new Set([...CORE, 'COI', 'AVK']));
    expect(sql).toContain('"Name" AS name');
    expect(sql).toContain('"Sex" AS sexRaw');
    expect(sql).toContain('"Breed" AS breed');
  });

  it('projects optional DNA health columns when present, NULL otherwise', () => {
    const withDna = buildSelectCols(new Set([...CORE, 'PRA-rcd4-C2orf71', 'SAMS-KCNJ10']));
    expect(withDna).toContain('"PRA-rcd4-C2orf71" AS praRcd4C2orf71');
    expect(withDna).toContain('"SAMS-KCNJ10" AS samsKcnj10');
    const without = buildSelectCols(new Set(CORE));
    expect(without).toContain('NULL AS praRcd4C2orf71');
    expect(without).toContain('NULL AS samsKcnj10');
  });
});

describe('missingRequiredColumns', () => {
  it('returns [] when all required columns exist', () => {
    expect(missingRequiredColumns(new Set([...REQUIRED_COLUMNS, 'Sex']))).toEqual([]);
  });

  it('reports the missing required column(s)', () => {
    expect(missingRequiredColumns(new Set(['Name', 'Dam']))).toEqual(['Sire']);
    expect(missingRequiredColumns(new Set(['Sex'])).sort()).toEqual(['Dam', 'Name', 'Sire']);
  });
});

describe('SQL builders embed the projection and the right clauses', () => {
  const select = buildSelectCols(new Set([...CORE, 'COI', 'AVK']));

  it('getAnimalSql looks up by Name with COLLATE NOCASE', () => {
    const sql = getAnimalSql(select);
    expect(sql).toContain('FROM "Pedigree"');
    expect(sql).toContain('WHERE "Name" = ? COLLATE NOCASE');
    expect(sql).toContain('"COI" AS coi');
  });

  it('getChildrenSql matches Sire or Dam', () => {
    expect(getChildrenSql(select)).toContain('WHERE "Sire" = ? COLLATE NOCASE OR "Dam" = ? COLLATE NOCASE');
  });

  it('searchAnimalsSql matches Name or Registration and orders by Name', () => {
    const sql = searchAnimalsSql(select);
    expect(sql).toContain('"Name" LIKE ? COLLATE NOCASE OR "Registration" LIKE ?');
    expect(sql).toContain('ORDER BY "Name" COLLATE NOCASE');
    expect(sql).toContain('LIMIT ?');
  });
});

// --- DNA Tests report query -------------------------------------------------
// The column name is resolved from the SOURCE_FIELDS catalogue, never from
// renderer input, but it still goes through quoteIdent so an awkward real name
// like "CUR/N" (and any future one with punctuation) is valid SQL.
describe('listByFieldSql — DNA Tests listing', () => {
  const SELECT = '"Name" AS name,\n  "Sire" AS sire';

  it('lists the whole table for one column and filters out blank results', () => {
    const sql = listByFieldSql(SELECT, 'PRA-rcd4-C2orf71');
    // The "Pedigree No." is the owner's record number from Registration (#6),
    // already in the shared projection — never SQLite's rowid.
    expect(sql).not.toContain('rowid');
    expect(sql).toContain('FROM "Pedigree"');
    expect(sql).toContain('"PRA-rcd4-C2orf71" IS NOT NULL');
    expect(sql).toContain('TRIM(CAST("PRA-rcd4-C2orf71" AS TEXT)) <> \'\'');
    expect(sql).toContain('ORDER BY "Name" COLLATE NOCASE');
  });

  it('quotes an identifier containing a slash or a quote', () => {
    expect(quoteIdent('CUR/N')).toBe('"CUR/N"');
    expect(quoteIdent('od"d')).toBe('"od""d"');
    expect(listByFieldSql(SELECT, 'CUR/N')).toContain('"CUR/N" IS NOT NULL');
  });
});
