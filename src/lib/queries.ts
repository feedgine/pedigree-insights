// queries.ts — the single home for every SQL string (file-structure.md
// convention: no inline SQL elsewhere). Column names are quoted because the
// BreedMate schema uses spaces and dots (e.g. "Studbook No.") and must match
// docs/schema-map.md [DOCUMENTED] exactly. Names are NOT assumed.
//
// All access is READ-ONLY (stack-decision.md): no INSERT/UPDATE/DELETE exist
// in this file by design.
//
// SCHEMA VARIATION (confirmed 2026-06-25): BreedMate exports differ in how they
// name the genetics columns. The bundled sample uses the long names
// "Inbreeding Coefficient" / "Relationship Coefficient"; other exports (e.g. a
// real Japanese Spitz database, 37,601 rows) use the short names "COI" / "AVK".
// Selecting a column that does not exist makes SQLite reject the ENTIRE query,
// so the projection is built at connect time from the columns that are actually
// present (see buildSelectCols + database.ts). A field with no matching column
// degrades to NULL — never an error. See schema-map.md "Genetics columns".

/** Projection plan: each output alias and the source columns that may hold it,
 *  in preference order. Core identity/detail columns have exactly one source;
 *  the genetics columns list both known BreedMate spellings. */
interface ProjectionField {
  /** Output alias (matches AnimalRow in schema.ts). */
  as: string;
  /** Candidate source column names, best first. */
  sources: string[];
}

const PROJECTION: ProjectionField[] = [
  { as: 'name', sources: ['Name'] },
  { as: 'sire', sources: ['Sire'] },
  { as: 'dam', sources: ['Dam'] },
  { as: 'sexRaw', sources: ['Sex'] },
  { as: 'dob', sources: ['DOB'] },
  { as: 'registration', sources: ['Registration'] },
  { as: 'preTitle', sources: ['PreTitle'] },
  { as: 'postTitle', sources: ['PostTitle'] },
  { as: 'color', sources: ['Color'] },
  { as: 'breed', sources: ['Breed'] },
  // Genetics columns vary by export; pick whichever exists, else NULL.
  { as: 'coi', sources: ['Inbreeding Coefficient', 'COI'] },
  { as: 'avk', sources: ['Relationship Coefficient', 'AVK'] },
];

/** Columns without which the app cannot build a pedigree at all. If any is
 *  missing the file is not a usable pedigree database (its `Pedigree` table lacks
 *  the contract columns) and we surface a clear error rather than a cryptic
 *  SQLite one. */
export const REQUIRED_COLUMNS = ['Name', 'Sire', 'Dam'] as const;

/**
 * Build the shared SELECT projection from the columns actually present in the
 * Pedigree table (as reported by PRAGMA table_info). Each field maps to the
 * first of its candidate source columns that exists; if none exist it is
 * selected as NULL, so optional fields (COI/AVK) never break the query.
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
