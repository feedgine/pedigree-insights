// schema.ts — TypeScript interfaces and pure helpers for the confirmed
// BreedMate `Pedigree` schema (docs/schema-map.md [DOCUMENTED]).
//
// The source identity is the TEXT `Name` column (primary key). `Sire`/`Dam`
// store the parent's Name string, NOT an integer foreign key. All values here
// mirror real, confirmed column names — nothing is assumed.
//
// [DRAFT — requires Yuliya's review] until confirmed working on the target Mac.

/** One animal, projected from the `Pedigree` table to the fields the app uses. */
export interface Animal {
  /** Pedigree."Name" — PRIMARY KEY, the identity. */
  name: string;
  /** Pedigree."Sire" — Name of the sire, or null/'' if unknown. */
  sire: string | null;
  /** Pedigree."Dam" — Name of the dam, or null/'' if unknown. */
  dam: string | null;
  /** Normalized from raw 'M' | 'F' | 'm' | '' | NULL. */
  sex: 'M' | 'F' | null;
  /** Pedigree."DOB" (datetime as text). */
  dob: string | null;
  /** Pedigree."Registration". */
  registration: string | null;
  /** Pedigree."PreTitle" — titles shown before the name ([Titles]). */
  preTitle: string | null;
  /** Pedigree."PostTitle" — working/obedience titles after the name ([Obedience]). */
  postTitle: string | null;
  /** Pedigree."Color" ([Colour]). */
  color: string | null;
  /** Pedigree."Breed". */
  breed: string | null;
  /** Pedigree."Inbreeding Coefficient" — COI. NULL until external script runs. */
  coi: number | null;
  /** Pedigree."Relationship Coefficient" — AVK. NULL until external script runs. */
  avk: number | null;
}

/**
 * Shape returned by the raw SQL projection in queries.ts. `sexRaw` is the dirty
 * source value; the data layer maps it to `Animal.sex` via normalizeSex().
 */
export interface AnimalRow {
  name: string;
  sire: string | null;
  dam: string | null;
  sexRaw: string | null;
  dob: string | null;
  registration: string | null;
  preTitle: string | null;
  postTitle: string | null;
  color: string | null;
  breed: string | null;
  coi: number | null;
  avk: number | null;
}

/**
 * Normalize the dirty `Sex` column. Source contains 'M' | 'F' | 'm' | '' | NULL
 * (schema-map.md). Anything that is not clearly M/F becomes null (unknown).
 */
export function normalizeSex(raw: string | null | undefined): 'M' | 'F' | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  return s === 'M' || s === 'F' ? s : null;
}

/**
 * Normalize a Name/Sire/Dam string for matching. Names are mixed-case with
 * stray whitespace; trim and treat '' as "unknown parent". Case is handled at
 * the SQL layer via COLLATE NOCASE, so this only strips whitespace.
 */
export function keyOf(name: string | null | undefined): string | null {
  const k = name?.trim();
  return k ? k : null;
}

/** Build a typed Animal from a raw projected row. */
export function toAnimal(row: AnimalRow): Animal {
  return {
    name: row.name,
    sire: row.sire,
    dam: row.dam,
    sex: normalizeSex(row.sexRaw),
    dob: row.dob,
    registration: row.registration,
    preTitle: row.preTitle,
    postTitle: row.postTitle,
    color: row.color,
    breed: row.breed,
    coi: row.coi,
    avk: row.avk,
  };
}

/**
 * COI display. The app NEVER computes COI (stack-decision.md, PRD §7.3) — it
 * only renders a value the external script has written, or "Not available".
 */
export function coiDisplay(value: number | null): string {
  return value == null ? 'Not available' : `${value.toFixed(2)}%`;
}

/**
 * Compose the node label per the DogForms60.fmx "Family Tree" layout
 * (schema-map.md §display): `[Titles] [Name] [Obedience] [Reg No.]`.
 * Empty tokens are omitted. `dense` collapses to name-only for deep generations.
 */
export function nodeLabel(animal: Animal, dense = false): string {
  if (dense) return animal.name;
  return [animal.preTitle, animal.name, animal.postTitle]
    .map((t) => t?.trim())
    .filter(Boolean)
    .join(' ');
}
