// database.ts (main process) — the ONLY place that opens the source .db
// (a pedigree SQLite database; BreedMate exports are the primary tested format).
// better-sqlite3 is a native Node module, so it must live in the Electron main
// process, never the renderer. The file is opened READ-ONLY (stack-decision.md,
// PRD §7.1): no write path exists anywhere in the app.

import Database from 'better-sqlite3';
import { Animal, AnimalRow, toAnimal } from '../../src/lib/schema';
import {
  LIST_NAMES,
  PEDIGREE_TABLE_INFO,
  buildSelectCols,
  getAnimalSql,
  getChildrenSql,
  missingRequiredColumns,
  searchAnimalsSql,
} from '../../src/lib/queries';
import {
  AnimalLookup,
  ChildrenLookup,
  PedigreeTreeNode,
  buildPedigreeTree,
  countAncestors,
} from '../../src/lib/pedigreeAlgorithm';
import {
  DEFAULT_MIN_CROSSES,
  LinebreedingReport,
  analyzeLinebreeding,
} from '../../src/lib/linebreeding';
import {
  FoundationReport,
  buildFoundationReport,
} from '../../src/lib/contribution';
import { applyGenetics } from '../../src/lib/genetics';

export class PedigreeDatabase {
  private db: Database.Database;
  private stmtGet: Database.Statement;
  private stmtChildren: Database.Statement;
  private stmtSearch: Database.Statement;
  private stmtNames: Database.Statement;

  readonly path: string;

  constructor(dbPath: string) {
    this.path = dbPath;
    // readonly: true is the hard read-only guarantee. fileMustExist avoids
    // accidentally creating an empty db if the saved path is stale.
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
    // Defense in depth: PRAGMA query_only blocks writes even if a future code
    // path forgot the readonly flag.
    this.db.pragma('query_only = ON');

    // Source databases vary (notably the optional COI/AVK column names — see
    // queries.ts). Read the real column list and build the projection from the
    // columns that actually exist, so a differently-named optional column
    // degrades to NULL instead of aborting every query.
    const available = new Set<string>(
      (this.db.prepare(PEDIGREE_TABLE_INFO).all() as { name: string }[]).map(
        (c) => c.name
      )
    );
    const missing = missingRequiredColumns(available);
    if (missing.length > 0) {
      throw new Error(
        `This file does not look like a pedigree database — its "Pedigree" ` +
          `table is missing required column(s): ${missing.join(', ')}.`
      );
    }
    const select = buildSelectCols(available);

    this.stmtGet = this.db.prepare(getAnimalSql(select));
    this.stmtChildren = this.db.prepare(getChildrenSql(select));
    this.stmtSearch = this.db.prepare(searchAnimalsSql(select));
    this.stmtNames = this.db.prepare(LIST_NAMES);
  }

  getAnimal(name: string): Animal | null {
    const row = this.stmtGet.get(name) as AnimalRow | undefined;
    return row ? toAnimal(row) : null;
  }

  /** Lookup function bound to this DB, for the pure traversal algorithm. */
  get lookup(): AnimalLookup {
    return (name: string) => this.getAnimal(name);
  }

  get childrenLookup(): ChildrenLookup {
    return (name: string) =>
      (this.stmtChildren.all(name, name) as AnimalRow[]).map(toAnimal);
  }

  searchAnimals(query: string, limit = 50): Animal[] {
    const like = `%${query}%`;
    return (this.stmtSearch.all(like, like, limit) as AnimalRow[]).map(toAnimal);
  }

  listNames(): string[] {
    return (this.stmtNames.all() as { name: string }[]).map((r) => r.name);
  }

  /** Build an ancestor pedigree tree for the renderer. The chart fully expands
   *  repeated ancestors (expandAll=true) so every box is drawn, like a printed
   *  pedigree. */
  getPedigree(name: string, generations: number): PedigreeTreeNode {
    return buildPedigreeTree(this.lookup, name, generations, true);
  }

  ancestorCount(name: string, generations: number): number {
    return countAncestors(buildPedigreeTree(this.lookup, name, generations));
  }

  /** Linebreeding report for the renderer. Structural columns (crosses, lines,
   *  Blood %, Influence) come from analyzeLinebreeding; the validated genetics
   *  columns (subject COI, per-ancestor COI and AGR) are then filled by the
   *  in-app relationship-matrix engine as a pre-report step (owner-approved
   *  2026-06-27 — see genetics.ts / CLAUDE.md). */
  getLinebreeding(
    name: string,
    generations: number,
    minCrosses: number = DEFAULT_MIN_CROSSES,
  ): LinebreedingReport {
    const report = analyzeLinebreeding(this.lookup, name, generations, minCrosses);
    return applyGenetics(report, this.lookup);
  }

  /** Foundation-contribution report for `name` against a foundation list,
   *  computed across all generations (memoized DP — see contribution.ts). */
  getFoundation(name: string, foundationNames: string[]): FoundationReport {
    return buildFoundationReport(this.lookup, name, foundationNames);
  }

  /** Whether a Name exists in the database (used to validate a foundation list).
   *  Case-insensitive via the underlying GET_ANIMAL COLLATE NOCASE. */
  hasAnimal(name: string): boolean {
    return this.getAnimal(name) !== null;
  }

  close(): void {
    this.db.close();
  }
}
