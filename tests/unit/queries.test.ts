// Unit tests — schema-adaptive projection. BreedMate exports name the genetics
// columns differently ("Inbreeding Coefficient"/"Relationship Coefficient" in
// the sample; "COI"/"AVK" in real exports). buildSelectCols must adapt to the
// columns actually present, and never select a non-existent column.
import { describe, it, expect } from 'vitest';
import {
  buildSelectCols,
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
