// sourceFields.ts — THE single source of truth for the source `Pedigree`
// column layout the app reads.
//
// The owner's import pipeline writes every source file and the master database in
// one agreed **74-column order** (`source-column-mapping.html`, 2026-08-02).
// This catalogue mirrors that layout 1:1 so that three things can never drift
// apart again:
//   1. the SQL projection            (queries.ts builds PROJECTION from here),
//   2. the typed model               (schema.ts fills `Animal.fields` from here),
//   3. what the Pedigree tab shows   (card sections + "All fields" panel).
//
// Adding a column to the source database = adding ONE entry here. Nothing else
// needs to change. A column that is absent from the opened .db degrades to NULL
// (buildSelectCols) — never an error — so the app stays source-agnostic and older
// exports keep working.
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — 74-column layout, 2026-08-02

import type { Animal } from './schema';

/** Which part of the subject card / All-fields panel a column belongs to. */
export type FieldGroup =
  /** Name, sex, dates, parents, call name, breed. */
  | 'identity'
  /** Registration numbers, registry, studbook, microchip, tattoo. */
  | 'registration'
  /** People and litter/breeding admin: owner, breeder, litter, country. */
  | 'breeding'
  /** Coefficients + the DNA test columns (layout #62–#74). */
  | 'genetics'
  /** Clinical/phenotype screening results: hips, elbows, OFA, CERF, eyes… */
  | 'health'
  /** Photos, notes, links, timestamps, points. */
  | 'admin'
  /** User Field1..9 — breeder-defined. */
  | 'custom'
  /** Source-format bookkeeping (marks/flags) — projected, never displayed. */
  | 'internal';

export interface SourceField {
  /** 1-based position in the agreed 74-column layout. */
  col: number;
  /** SQL alias + key on `Animal.fields`. Must be a bare SQL identifier. */
  as: string;
  /** Candidate source column names, best first (exports vary — see schema-map.md). */
  sources: string[];
  /** Label shown on the card and in the All-fields panel. */
  label: string;
  group: FieldGroup;
  /** Compact label for the card's genetics/health strip (defaults to `label`). */
  short?: string;
  /** True when `Animal` also carries a dedicated typed property for this column
   *  (kept for the existing call sites; `fields` mirrors it either way). */
  core?: boolean;
  /** Numeric columns — kept out of the text-trimming path. */
  numeric?: boolean;
}

/**
 * The 74-column source layout, in source order. `col` IS the column number in
 * `source-column-mapping.html`; do not renumber — append instead.
 */
export const SOURCE_FIELDS: readonly SourceField[] = [
  // ---- identity ---------------------------------------------------------
  { col: 1,  as: 'name',        sources: ['Name'],        label: 'Name',        group: 'identity', core: true },
  { col: 2,  as: 'sexRaw',      sources: ['Sex'],         label: 'Sex',         group: 'identity', core: true },
  { col: 3,  as: 'dob',         sources: ['DOB'],         label: 'Born',        group: 'identity', core: true },
  { col: 4,  as: 'sire',        sources: ['Sire'],        label: 'Sire',        group: 'identity', core: true },
  { col: 5,  as: 'dam',         sources: ['Dam'],         label: 'Dam',         group: 'identity', core: true },
  { col: 6,  as: 'registration', sources: ['Registration'], label: 'Reg No',    group: 'registration', core: true },
  { col: 7,  as: 'preTitle',    sources: ['PreTitle'],    label: 'Titles',      group: 'identity', core: true },
  { col: 8,  as: 'postTitle',   sources: ['PostTitle'],   label: 'Working titles', group: 'identity', core: true },
  { col: 9,  as: 'color',       sources: ['Color'],       label: 'Colour',      group: 'identity', core: true },
  { col: 10, as: 'gd',          sources: ['Gd'],          label: 'Gd',          group: 'admin' },
  { col: 11, as: 'owner',       sources: ['Owner'],       label: 'Owner',       group: 'breeding' },
  { col: 12, as: 'breeder',     sources: ['Breeder'],     label: 'Breeder',     group: 'breeding', core: true },
  // ---- health screening --------------------------------------------------
  { col: 13, as: 'hipScore',    sources: ['Hip Score'],   label: 'Hip score',   short: 'Hips',   group: 'health', core: true },
  { col: 14, as: 'elbowScore',  sources: ['Elbow Score'], label: 'Elbow score', short: 'Elbows', group: 'health' },
  // ---- breeding / registry ----------------------------------------------
  { col: 15, as: 'litterNo',    sources: ['Litter No.'],  label: 'Litter No.',  group: 'breeding' },
  { col: 16, as: 'studbookNo',  sources: ['Studbook No.'], label: 'Studbook No.', group: 'registration' },
  { col: 17, as: 'publishedDate', sources: ['Published Date'], label: 'Published', group: 'admin' },
  { col: 18, as: 'imported',    sources: ['Imported'],    label: 'Imported',    group: 'admin' },
  { col: 19, as: 'microchip',   sources: ['Microchip'],   label: 'Microchip',   group: 'registration' },
  { col: 20, as: 'surveyor',    sources: ['Surveyor'],    label: 'Surveyor',    group: 'admin' },
  { col: 21, as: 'callName',    sources: ['Call Name'],   label: 'Pet name',    group: 'identity', core: true },
  { col: 22, as: 'country',     sources: ['Country of Origin'], label: 'Country of Origin', group: 'breeding', core: true },
  { col: 23, as: 'breed',       sources: ['Breed'],       label: 'Breed',       group: 'identity', core: true },
  { col: 24, as: 'genotype',    sources: ['Genotype'],    label: 'Genotype',    group: 'health', core: true },
  { col: 25, as: 'notes',       sources: ['Notes'],       label: 'Notes',       group: 'admin' },
  { col: 26, as: 'height',      sources: ['Height'],      label: 'Height',      group: 'admin' },
  // Registry code (JKC / FIN / SKK / ANKC …). The owner's import moved these out
  // of `Studbook No.` (#16, now empty) into `Register` — read #27, not #16.
  { col: 27, as: 'register',    sources: ['Register'],    label: 'Register',    group: 'registration' },
  { col: 28, as: 'certifications', sources: ['Certifications'], label: 'Certifications', group: 'health' },
  { col: 29, as: 'comment',     sources: ['Comment'],     label: 'Comment',     group: 'admin' },
    // Photo falls back through the alternate photo columns so an export that only
  // filled "HTML Photo"/"Photo #2" still shows a picture (pre-existing behaviour).
  { col: 30, as: 'photo', sources: ['Photo', 'HTML Photo', 'Photo #2', 'Photo #3', 'Photo #4'], label: 'Photo', group: 'admin', core: true },
  { col: 31, as: 'eyeColour',   sources: ['Eye Colour'],  label: 'Eye colour',  short: 'Eye',   group: 'health', core: true },
  { col: 32, as: 'bloodType',   sources: ['Blood Type'],  label: 'Blood type',  short: 'Blood', group: 'health', core: true },
  // ---- breeder-defined ---------------------------------------------------
  { col: 33, as: 'userField1',  sources: ['User Field1'], label: 'User Field 1', group: 'custom' },
  { col: 34, as: 'userField2',  sources: ['User Field2'], label: 'User Field 2', group: 'custom' },
  { col: 35, as: 'userField3',  sources: ['User Field3'], label: 'User Field 3', group: 'custom' },
  { col: 36, as: 'userField4',  sources: ['User Field4'], label: 'User Field 4', group: 'custom' },
  { col: 37, as: 'userField5',  sources: ['User Field5'], label: 'User Field 5', group: 'custom' },
  { col: 38, as: 'userField6',  sources: ['User Field6'], label: 'User Field 6', group: 'custom' },
  { col: 39, as: 'userField7',  sources: ['User Field7'], label: 'User Field 7', group: 'custom' },
  { col: 40, as: 'userField8',  sources: ['User Field8'], label: 'User Field 8', group: 'custom' },
  { col: 41, as: 'userField9',  sources: ['User Field9'], label: 'User Field 9', group: 'custom' },
  { col: 42, as: 'points',      sources: ['Points'],      label: 'Points',      group: 'admin', numeric: true },
  { col: 43, as: 'ofa',         sources: ['OFA'],         label: 'OFA',         group: 'health', core: true },
  { col: 44, as: 'cerf',        sources: ['CERF'],        label: 'CERF',        group: 'health', core: true },
  { col: 45, as: 'additionalRegNo', sources: ['Additional Reg No.'], label: 'Additional Reg No.', group: 'registration' },
  // ---- stored coefficients ----------------------------------------------
  // Export-dependent names (schema-map.md "Genetics columns"): the bundled sample
  // uses the long spellings, real exports use COI/AVK. Scales DIFFER — see schema.ts.
  { col: 46, as: 'coi', sources: ['Inbreeding Coefficient', 'COI'], label: 'COI (stored)', short: 'COI', group: 'genetics', core: true, numeric: true },
  { col: 47, as: 'avk', sources: ['Relationship Coefficient', 'AVK'], label: 'AVK (stored)', short: 'AVK', group: 'genetics', core: true, numeric: true },
  { col: 48, as: 'variety',     sources: ['Variety'],     label: 'Variety',     group: 'identity' },
  { col: 49, as: 'htmlPhoto',   sources: ['HTML Photo'],  label: 'HTML photo',  group: 'admin' },
  { col: 50, as: 'photo2',      sources: ['Photo #2'],    label: 'Photo #2',    group: 'admin' },
  { col: 51, as: 'photo3',      sources: ['Photo #3'],    label: 'Photo #3',    group: 'admin' },
  { col: 52, as: 'photo4',      sources: ['Photo #4'],    label: 'Photo #4',    group: 'admin' },
  { col: 53, as: 'diedDate',    sources: ['Died Date'],   label: 'Died',        group: 'identity', core: true },
  { col: 54, as: 'causeOfDeath', sources: ['Cause of Death'], label: 'Cause of death', group: 'health' },
  { col: 55, as: 'hyperlink',   sources: ['Hyperlink'],   label: 'Hyperlink',   group: 'admin' },
  { col: 56, as: 'tattoo',      sources: ['Tattoo'],      label: 'Tattoo',      group: 'registration' },
  { col: 57, as: 'modified',    sources: ['Modified'],    label: 'Modified',    group: 'admin' },
  { col: 58, as: 'created',     sources: ['Created'],     label: 'Created',     group: 'admin' },
  { col: 59, as: 'mark1',       sources: ['Mark1'],       label: 'Mark1',       group: 'internal', numeric: true },
  { col: 60, as: 'mark2',       sources: ['Mark2'],       label: 'Mark2',       group: 'internal', numeric: true },
  { col: 61, as: 'marksBits',   sources: ['_Marks'],      label: '_Marks',      group: 'internal', numeric: true },
  // ---- DNA / genetic test columns (#62–#74) ------------------------------
  // Owner decision 2026-08-05: the whole #62–#74 block belongs to the card's
  // GENETICS section. Values are free TEXT results shown verbatim — never parsed,
  // never treated as coefficients. `DNA-COI` (#74) is a GENOMIC inbreeding figure
  // from a lab report and is NOT the pedigree COI (#46); the labels keep them apart.
  { col: 62, as: 'mh',        sources: ['MH'],               label: 'MH',               group: 'genetics' },
  { col: 63, as: 'lte',       sources: ['LTE'],              label: 'LTE',              group: 'genetics' },
  { col: 64, as: 'patella',   sources: ['PATELLA'],          label: 'Patella',          group: 'genetics' },
  { col: 65, as: 'ecvo',      sources: ['ECVO'],             label: 'ECVO',             group: 'genetics' },
  { col: 66, as: 'wdAtp7b',   sources: ['WD-ATP7B'],         label: 'WD-ATP7B',         group: 'genetics' },
  { col: 67, as: 'samsKcnj10', sources: ['SAMS-KCNJ10'],     label: 'SAMS-KCNJ10',      group: 'genetics', core: true },
  { col: 68, as: 'praRcd4C2orf71', sources: ['PRA-rcd4-C2orf71'], label: 'PRA-rcd4-C2orf71', group: 'genetics', core: true },
  { col: 69, as: 'mdr2Abcb1', sources: ['MDR2-ABCB1'],       label: 'MDR2-ABCB1',       group: 'genetics' },
  { col: 70, as: 'f7',        sources: ['F7'],               label: 'F7',               group: 'genetics' },
  { col: 71, as: 'curN',      sources: ['CUR/N'],            label: 'CUR/N',            group: 'genetics' },
  { col: 72, as: 'dmdCfax',   sources: ['DMD-CFAX'],         label: 'DMD-CFAX',         group: 'genetics' },
  { col: 73, as: 'h',         sources: ['H'],                label: 'H',                group: 'genetics' },
  { col: 74, as: 'dnaCoi',    sources: ['DNA-COI'],          label: 'DNA-COI (genomic)', short: 'DNA-COI', group: 'genetics' },
];

/** The DNA/genetic test block — layout columns #62–#74, in source order. */
export const DNA_TEST_FIELDS: readonly SourceField[] = SOURCE_FIELDS.filter(
  (f) => f.col >= 62 && f.col <= 74,
);

/** Clinical/phenotype screening columns (hips, elbows, OFA, CERF, eyes, …). */
export const HEALTH_FIELDS: readonly SourceField[] = SOURCE_FIELDS.filter(
  (f) => f.group === 'health',
);

/** Order the All-fields panel presents its sections in. `internal` is omitted on
 *  purpose — the source format's mark bitmasks are bookkeeping, not pedigree data. */
export const PANEL_GROUPS: readonly { group: FieldGroup; title: string }[] = [
  { group: 'identity', title: 'Identity' },
  { group: 'registration', title: 'Registration' },
  { group: 'breeding', title: 'Breeding' },
  { group: 'genetics', title: 'Genetics & DNA' },
  { group: 'health', title: 'Health' },
  { group: 'custom', title: 'Breeder fields' },
  { group: 'admin', title: 'Other' },
];

/** Lookup by SQL alias. */
export const FIELD_BY_ALIAS: ReadonlyMap<string, SourceField> = new Map(
  SOURCE_FIELDS.map((f) => [f.as, f]),
);

/**
 * Read one catalogue field off an animal as trimmed display text.
 * Returns null when the column is absent, NULL, or blank — the card and the panel
 * both render "only when there is something to show".
 */
export function fieldText(animal: Animal, f: SourceField): string | null {
  const v = animal.fields?.[f.as];
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** `{label, value}` pairs for the catalogue fields of `animal` that have a value. */
export function presentFields(
  animal: Animal,
  fields: readonly SourceField[],
): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = [];
  for (const f of fields) {
    const value = fieldText(animal, f);
    if (value !== null) out.push({ key: f.as, label: f.label, value });
  }
  return out;
}

/** Same as `presentFields` but using the compact `short` label, for the card strip. */
export function presentShort(
  animal: Animal,
  fields: readonly SourceField[],
): { key: string; label: string; value: string }[] {
  return presentFields(animal, fields).map((p) => ({
    ...p,
    label: FIELD_BY_ALIAS.get(p.key)?.short ?? p.label,
  }));
}
