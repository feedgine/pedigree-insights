// Integration tests — real SQLite, BreedMate-shaped schema (PRD §12.2).
// Runs against tests/fixtures/DogSampleData.db via better-sqlite3 + the actual
// PedigreeDatabase class and queries.ts strings. The fixture is a SYNTHETIC,
// themed pedigree (fairy-tale + exotic-animal names) carrying no real or personal
// data; regression counts below are locked to figures computed from it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PedigreeDatabase } from '../../electron/main/database';
import { groupByGeneration, buildPedigreeTree } from '@/lib/pedigreeAlgorithm';

const FIXTURE = resolve(__dirname, '../fixtures/DogSampleData.db');

// A deep animal in the synthetic fixture. These counts are the contract.
const SUBJECT = 'Avalon Cinderella';
const EXPECTED_TOTAL: Record<number, number> = { 3: 15, 5: 37, 10: 217 };
const EXPECTED_GEN3 = { 0: 1, 1: 2, 2: 4, 3: 8 };

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('fixture present', () => {
  it('DogSampleData.db exists in tests/fixtures', () => {
    expect(existsSync(FIXTURE)).toBe(true);
  });
});

describe('read-only enforcement (release-blocking, CLAUDE.md)', () => {
  it('opens the DB read-only and rejects writes; file is byte-identical after', () => {
    const before = sha(FIXTURE);
    const beforeMtime = statSync(FIXTURE).mtimeMs;

    const db = new Database(FIXTURE, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    expect(() =>
      db.prepare('UPDATE "Pedigree" SET "Sex" = ? WHERE "Name" = ?').run('M', SUBJECT)
    ).toThrow();
    db.close();

    expect(sha(FIXTURE)).toBe(before);
    expect(statSync(FIXTURE).mtimeMs).toBe(beforeMtime);
  });
});

describe('PedigreeDatabase queries against the real schema', () => {
  let db: PedigreeDatabase;
  beforeAll(() => {
    db = new PedigreeDatabase(FIXTURE);
  });

  it('getAnimal returns the expected row for a known Name', () => {
    const a = db.getAnimal(SUBJECT);
    expect(a).not.toBeNull();
    expect(a!.name).toBe(SUBJECT);
    expect(a!.sire).toBe('Hollowfen Quetzal');
    expect(a!.dam).toBe('Avalon Cockatrice');
    expect(a!.sex).toBe('F');
  });

  it('getAnimal returns null for an absent Name', () => {
    expect(db.getAnimal('__no_such_dog__')).toBeNull();
  });

  it('matches Name case-insensitively (COLLATE NOCASE)', () => {
    const a = db.getAnimal('avalon cinderella');
    expect(a?.name).toBe(SUBJECT);
  });

  it('resolves quoted column names with spaces (COI/AVK read back as null)', () => {
    const a = db.getAnimal(SUBJECT);
    // Sample data has these columns NULL until the external script runs.
    expect(a!.coi).toBeNull();
    expect(a!.avk).toBeNull();
  });

  it.each([3, 5, 10])(
    'ancestor count for %s generations matches the verified figure',
    (depth) => {
      const tree = buildPedigreeTree(db.lookup, SUBJECT, depth);
      let total = 0;
      for (const bucket of groupByGeneration(tree).values()) total += bucket.length;
      expect(total).toBe(EXPECTED_TOTAL[depth]);
    }
  );

  it('per-generation counts at depth 3 match BreedMate-style layout', () => {
    const tree = buildPedigreeTree(db.lookup, SUBJECT, 3);
    const byGen = groupByGeneration(tree);
    const counts = Object.fromEntries(
      [...byGen.entries()].map(([g, list]) => [g, list.length])
    );
    expect(counts).toEqual(EXPECTED_GEN3);
  });

  it('foundation ancestors (Sire/Dam with no row) appear as empty leaves, not errors', () => {
    const tree = buildPedigreeTree(db.lookup, SUBJECT, 10);
    // Some deep nodes must be null-animal leaves (unknown ancestors exist).
    let emptyLeaves = 0;
    (function walk(n: typeof tree): void {
      if (n.animal === null) emptyLeaves += 1;
      if (n.sire) walk(n.sire);
      if (n.dam) walk(n.dam);
    })(tree);
    expect(emptyLeaves).toBeGreaterThan(0);
  });

  it('search finds animals by partial name', () => {
    const results = db.searchAnimals('Avalon');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((a) => /avalon/i.test(a.name) || a.registration)).toBe(true);
  });

  // Linebreeding "unique ancestors in N generations" counts every DISTINCT
  // ancestor reachable within N gens by any non-cyclic path (excl. subject).
  // This is a superset of the de-duplicated pedigree-tree count: that tree stops
  // expanding a repeated ancestor at its first-seen position, so an animal first
  // encountered deep has its own deeper ancestry truncated. The two therefore
  // coincide at shallow depths and diverge once deep repeats appear — figures
  // below are locked from the synthetic fixture.
  const EXPECTED_LB_UNIQUE: Record<number, number> = { 3: 14, 5: 36, 10: 227 };

  it.each([3, 5, 10])(
    'linebreeding unique-ancestor count at depth %s matches the verified figure',
    (depth) => {
      const report = db.getLinebreeding(SUBJECT, depth);
      expect(report.found).toBe(true);
      expect(report.uniqueAncestors).toBe(EXPECTED_LB_UNIQUE[depth]);
      // At shallow depths it equals the pedigree-tree total minus the subject;
      // it is never fewer (the walk visits a superset of positions).
      expect(report.uniqueAncestors).toBeGreaterThanOrEqual(EXPECTED_TOTAL[depth] - 1);
      // Every listed ancestor really is a repeat; totals are self-consistent.
      expect(report.ancestors.every((a) => a.crosses >= report.minCrosses)).toBe(true);
      expect(report.totalCrosses).toBeGreaterThanOrEqual(report.uniqueAncestors);
    }
  );

  it('does not hang on a synthetic self-referential pedigree', () => {
    // Build an in-memory cycle and confirm traversal terminates quickly.
    const cyclic = (name: string) =>
      name === 'LOOP'
        ? { name: 'LOOP', sire: 'LOOP', dam: 'LOOP', sex: 'M' as const, dob: null, registration: null, preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null }
        : null;
    const tree = buildPedigreeTree(cyclic, 'LOOP', 10);
    let total = 0;
    for (const b of groupByGeneration(tree).values()) total += b.length;
    expect(total).toBe(1);
  });
});

// Real BreedMate exports name the genetics columns "COI"/"AVK", while the
// bundled sample uses "Inbreeding Coefficient"/"Relationship Coefficient". This
// disparity broke opening a real DB (no such column: "Inbreeding Coefficient").
// These tests build tiny synthetic databases for each schema shape and open
// them through the actual PedigreeDatabase, proving the projection adapts.
describe('schema variation across BreedMate exports (regression: COI/AVK naming)', () => {
  const tmps: string[] = [];

  /** Create a throwaway .db with a Pedigree table whose columns are given as
   *  full SQL column definitions, then insert rows. Returns the file path. */
  function makeDb(columnDefs: string[], rows: Record<string, unknown>[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'pp-schema-'));
    const file = join(dir, 'pedigree.db');
    tmps.push(dir);
    const w = new Database(file);
    w.exec(`CREATE TABLE "Pedigree" (${columnDefs.join(', ')})`);
    if (rows.length) {
      const names = columnDefs.map((d) => d.match(/^"([^"]+)"/)![1]);
      const insert = w.prepare(
        `INSERT INTO "Pedigree" (${names.map((n) => `"${n}"`).join(',')}) ` +
          `VALUES (${names.map(() => '?').join(',')})`
      );
      for (const r of rows) insert.run(names.map((n) => r[n] ?? null));
    }
    w.close();
    return file;
  }

  const CORE_DEFS = [
    '"Name" TEXT', '"Sire" TEXT', '"Dam" TEXT', '"Sex" TEXT', '"DOB" TEXT',
    '"Registration" TEXT', '"PreTitle" TEXT', '"PostTitle" TEXT', '"Color" TEXT', '"Breed" TEXT',
  ];

  afterAll(() => {
    for (const dir of tmps) rmSync(dir, { recursive: true, force: true });
  });

  it('reads COI/AVK from the SHORT-name schema (real export)', () => {
    const file = makeDb([...CORE_DEFS, '"COI" REAL', '"AVK" REAL'], [
      { Name: 'Pup', Sire: 'Father', Dam: 'Mother', Sex: 'M', COI: 0, AVK: 0.2 },
      { Name: 'Father', Sex: 'M', COI: 3.5, AVK: 1 },
      { Name: 'Mother', Sex: 'F' },
    ]);
    const pdb = new PedigreeDatabase(file);
    const pup = pdb.getAnimal('Pup');
    expect(pup).not.toBeNull();
    expect(pup!.sire).toBe('Father');
    expect(pup!.coi).toBe(0);     // present and zero — not mistaken for null
    expect(pup!.avk).toBe(0.2);
    expect(pdb.getAnimal('Father')!.coi).toBe(3.5);
    // Full pipeline (pedigree + linebreeding) works on this schema.
    expect(pdb.getPedigree('Pup', 3).animal!.name).toBe('Pup');
    expect(pdb.getLinebreeding('Pup', 3).found).toBe(true);
    pdb.close();
  });

  it('reads COI/AVK from the LONG-name schema (sample export)', () => {
    const file = makeDb(
      [...CORE_DEFS, '"Inbreeding Coefficient" REAL', '"Relationship Coefficient" REAL'],
      [{ Name: 'Solo', Sex: 'F', 'Inbreeding Coefficient': 12.5, 'Relationship Coefficient': 4 }]
    );
    const pdb = new PedigreeDatabase(file);
    const solo = pdb.getAnimal('Solo');
    expect(solo!.coi).toBe(12.5);
    expect(solo!.avk).toBe(4);
    pdb.close();
  });

  it('degrades to null COI/AVK when NEITHER genetics column exists', () => {
    const file = makeDb(CORE_DEFS, [{ Name: 'Plain', Sex: 'M' }]);
    const pdb = new PedigreeDatabase(file);
    const a = pdb.getAnimal('Plain');
    expect(a).not.toBeNull();      // opens and queries fine — no crash
    expect(a!.coi).toBeNull();
    expect(a!.avk).toBeNull();
    pdb.close();
  });

  it('throws a clear error when a REQUIRED column is missing', () => {
    // No "Sire" column at all → not a usable pedigree table.
    const file = makeDb(
      ['"Name" TEXT', '"Dam" TEXT', '"Sex" TEXT'],
      [{ Name: 'Orphan', Sex: 'M' }]
    );
    expect(() => new PedigreeDatabase(file)).toThrow(/missing required column/i);
  });
});
