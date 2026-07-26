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
  /** Pedigree."PRA-rcd4-C2orf71" — recessive DNA test result (e.g. Clear/Carrier/
   *  Affected or N/N,N/m,m/m). Optional: undefined/null when untested or the
   *  column is absent. Text, shown verbatim; never a coefficient. */
  praRcd4C2orf71?: string | null;
  /** Pedigree."SAMS-KCNJ10" — recessive DNA test result. Optional, as above. */
  samsKcnj10?: string | null;
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
  praRcd4C2orf71?: string | null;
  samsKcnj10?: string | null;
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
    // Stored VERBATIM from the source DB — the model stays faithful to the file;
    // scale conversion happens only at the display edge. The two coefficients are
    // stored on DIFFERENT scales:
    //   • COI (Coefficient of Inbreeding) — a FRACTION in [0,1] (0.19 = 19%);
    //     display multiplies ×100 (see `pctFromFraction`).
    //   • AVK (Ancestor Loss Coefficient / Ahnenverlustkoeffizient) — ALREADY a
    //     PERCENTAGE in [0,100] and ≤100% by definition (100% = every ancestor
    //     slot unique, zero loss); display shows it raw (see `pctFromPercent`),
    //     NEVER ×100 — doing so pushes it past 100% and is wrong.
    // @author Yuliya Malinina <julia.malinina@gmail.com> — scale decision, 2026-07-20
    coi: row.coi,
    avk: row.avk,
    // Optional DNA health-test results — text, passed through verbatim.
    praRcd4C2orf71: row.praRcd4C2orf71,
    samsKcnj10: row.samsKcnj10,
  };
}

/**
 * Format a value that is ALREADY a percentage [0,100] (e.g. the in-app genetics
 * engine's computed COI/AGR, which are pre-scaled ×100). Null → "Not available".
 * For a stored coefficient held as a fraction [0,1], use `pctFromFraction`.
 */
export function coiDisplay(value: number | null): string {
  return value == null ? 'Not available' : `${value.toFixed(2)}%`;
}

/**
 * Format a stored value held as a FRACTION in [0,1] as a percentage
 * (0.19 → "19.00%"). Use for the stored **COI** (Coefficient of Inbreeding), which
 * the source DB stores as a fraction. Null → "Not available".
 * @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-07-20
 */
export function pctFromFraction(value: number | null | undefined, digits = 2): string {
  return value == null ? 'Not available' : `${(value * 100).toFixed(digits)}%`;
}

/**
 * Format a value that is ALREADY a percentage in [0,100] — shown raw, no scaling
 * (80 → "80.00%"). Use for the stored **AVK** (Ancestor Loss Coefficient), which
 * the source DB stores as a percentage and which is ≤100% by definition — so it
 * must NEVER be multiplied by 100 again. Null → "Not available".
 * @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-07-21
 */
export function pctFromPercent(value: number | null | undefined, digits = 2): string {
  return value == null ? 'Not available' : `${value.toFixed(digits)}%`;
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
