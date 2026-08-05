// queries.ts — the single home for every SQL string (file-structure.md
// convention: no inline SQL elsewhere). Column names are quoted because the
// source schema uses spaces, dots and slashes (e.g. "Studbook No.", "CUR/N")
// and must match docs/schema-map.md [DOCUMENTED] exactly. Names are NOT assumed.
//
// All access is READ-ONLY (stack-decision.md): no INSERT/UPDATE/DELETE exist
// in this file by design.
//
// SCHEMA VARIATION (confirmed 2026-06-25): source exports differ in how they
// name the genetics columns. The bundled sample uses the long names
// "Inbreeding Coefficient" / "Relationship Coefficient"; other exports (e.g. a
// real Japanese Spitz database) use the short names "COI" / "AVK".
// Selecting a column that does not exist makes SQLite reject the ENTIRE query,
// so the projection is built at connect time from the columns that are actually
// present (see buildSelectCols + database.ts). A field with no matching column
// degrades to NULL — never an error. See schema-map.md "Genetics columns".
//
// EXTENDED LAYOUT (2026-08-05): the projected field list is no longer written out
// here — it is derived from `SOURCE_FIELDS` in sourceFields.ts, the catalogue
// of the owner's agreed 74-column layout. Adding a column to the source database
// means adding one catalogue entry; this file does not change.
// @author Yuliya Malinina <julia.malinina@gmail.com>

import { SOURCE_FIELDS } from './sourceFields';

/** Projection plan: each output alias and the source columns that may hold it,
 *  in preference order. Core identity/detail columns have exactly one source;
 *  the genetics columns list both known spellings. */
interface ProjectionField {
  /** Output alias (matches AnimalRow in schema.ts). */
  as: string;
  /** Candidate source column names, best first. */
  sources: string[];
}

/** Derived from the 74-column catalogue — one projected alias per layout column. */
const PROJECTION: ProjectionField[] = SOURCE_FIELDS.map(({ as, sources }) => ({
  as,
  sources,
}));

/** Columns without which the app cannot build a pedigree at all. If any is
 *  missing the file is not a usable pedigree database (its `Pedigree` table lacks
 *  the contract columns) and we surface a clear error rather than a cryptic
 *  SQLite one. */
export const REQUIRED_COLUMNS = ['Name', 'Sire', 'Dam'] as const;

/**
 * Build the shared SELECT projection from the columns actually present in the
 * Pedigree table (as reported by PRAGMA table_info). Each field maps to the
 * first of its candidate source columns that exists; if none exist it is
 * selected as NULL, so optional fields (COI/AVK, the DNA test block, …) never
 * break the query.
 */
export function buildSelectCols(available: ReadonlySet<string>): string {
  return PROJECTION.map(({ as, sources }) => {
    const found = sources.find((s) => available.has(s));
    return found ? `"${found}" AS ${as}` : `NULL AS ${as}`;
  }).join(',\n  ');
}

/** Names of any REQUIRED_COLUMNS missing from `available` (empty = all present). */
export function missingRequiredColumns(available: ReadonlySet<string>): string[] {
  return REQUIRED_COLUMNS.filter((c) => !available.has(c));
}

/** Fetch one animal by exact Name. COLLATE NOCASE absorbs case differences
 *  between a stored Sire/Dam string and the target Name; Name is the unique PK
 *  so at most one row matches. */
export function getAnimalSql(select: string): string {
  return `
  SELECT ${select}
  FROM "Pedigree"
  WHERE "Name" = ? COLLATE NOCASE
  LIMIT 1
`;
}

/** Direct offspring of a given Name (descendant scaffold — not a v1 deliverable
 *  per PRD §9, but kept so the algorithm module can exercise it). */
export function getChildrenSql(select: string): string {
  return `
  SELECT ${select}
  FROM "Pedigree"
  WHERE "Sire" = ? COLLATE NOCASE OR "Dam" = ? COLLATE NOCASE
`;
}

/** Name lookup for the "look up a dog by name" MVP capability (PRD §5/§6.2).
 *  Matches Name or Registration, case-insensitively, ordered by Name. */
export function searchAnimalsSql(select: string): string {
  return `
  SELECT ${select}
  FROM "Pedigree"
  WHERE "Name" LIKE ? COLLATE NOCASE OR "Registration" LIKE ? COLLATE NOCASE
  ORDER BY "Name" COLLATE NOCASE
  LIMIT ?
`;
}

/** All names (for typeahead / validation). Only ever touches "Name". */
export const LIST_NAMES = `
  SELECT "Name" AS name FROM "Pedigree" ORDER BY "Name" COLLATE NOCASE
`;

/** Read the actual column names of the Pedigree table. */
export const PEDIGREE_TABLE_INFO = `PRAGMA table_info("Pedigree")`;
