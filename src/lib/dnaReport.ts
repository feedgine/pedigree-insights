// dnaReport.ts — the DNA Tests report: pick one genetic test, list every dog in
// the database that has a result for it, and tally the results by genotype.
//
// Pure and DB-agnostic (file-structure.md convention): it takes already-projected
// `Animal` rows and returns a plain report object, so the whole thing runs in
// vitest with no SQLite and no Electron. The main process calls `buildDnaTestReport`
// as a pre-report step (same shape as linebreeding / contribution); the renderer
// only renders what it gets back.
//
// Result strings are shown VERBATIM, exactly as the source column holds them —
// `classifyGenotype` only decides which chart slice a row falls in, it never
// rewrites the value on screen or in the CSV.
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — 2026-08-27

import type { Animal } from './schema';
import { FIELD_BY_ALIAS } from './sourceFields';

/** One test offered in the report's dropdown. */
export interface DnaTest {
  /** Stable id — ALSO the `sourceFields.ts` alias, so the SQL column is derived
   *  from the catalogue and never hard-coded here. */
  id: string;
  /** Short name the breed community uses (what the dropdown shows). */
  label: string;
  /** The source column's own name, shown next to the label for precision. */
  marker: string;
}

/**
 * The tests the report offers, in the owner's agreed order (2026-08-27).
 *
 * Every `id` MUST be an alias from the #62–#74 DNA block in sourceFields.ts —
 * that catalogue stays the single source of truth for what column is read, so a
 * renamed source column is a one-line change there, not here. Adding a seventh
 * test = one more entry below.
 */
export const DNA_TESTS: readonly DnaTest[] = [
  { id: 'samsKcnj10',      label: 'Ataxia',      marker: 'SAMS-KCNJ10' },
  { id: 'praRcd4C2orf71',  label: 'PRA-rcd4',    marker: 'PRA-rcd4-C2orf71' },
  { id: 'wdAtp7b',         label: 'Wilson',      marker: 'WD-ATP7B' },
  { id: 'mdr2Abcb1',       label: 'MDR2',        marker: 'MDR2-ABCB1' },
  { id: 'f7',              label: 'Factor VII',  marker: 'F7' },
  { id: 'curN',            label: 'CURV',        marker: 'CUR/N' },
];

/** Default selection when the tab is first opened. */
export const DEFAULT_DNA_TEST = DNA_TESTS[1].id; // PRA-rcd4 — the owner's sample report

/** Lookup by test id. */
export const DNA_TEST_BY_ID: ReadonlyMap<string, DnaTest> = new Map(
  DNA_TESTS.map((t) => [t.id, t]),
);

/** Is `id` one of the offered tests? Used to reject junk at the IPC boundary. */
export function isDnaTestId(id: unknown): id is string {
  return typeof id === 'string' && DNA_TEST_BY_ID.has(id);
}

/** Human label for a test, e.g. `PRA-rcd4 (PRA-rcd4-C2orf71)`. */
export function dnaTestTitle(id: string): string {
  const t = DNA_TEST_BY_ID.get(id);
  if (!t) return id;
  return t.label === t.marker ? t.label : `${t.label} (${t.marker})`;
}

/** The source column name(s) a test reads, best first (from the catalogue). */
export function dnaTestSources(id: string): readonly string[] {
  return FIELD_BY_ALIAS.get(id)?.sources ?? [];
}

// --- genotype classification ------------------------------------------------

/** The three recessive-test outcomes, plus a bucket for anything else. */
export type GenotypeClass = 'clear' | 'carrier' | 'affected' | 'other';

/** Display name and slice order for each class. `other` is last on purpose. */
export const GENOTYPE_CLASSES: readonly { id: GenotypeClass; label: string }[] = [
  { id: 'clear', label: 'Clear (WT/WT)' },
  { id: 'carrier', label: 'Carrier (WT/MUT)' },
  { id: 'affected', label: 'Affected (MUT/MUT)' },
  { id: 'other', label: 'Other / unclear' },
];

/**
 * Which chart slice a raw result string belongs to.
 *
 * Labs and breed registries write the same three outcomes many ways, so the
 * matching is deliberately generous and works on a normalised copy:
 *   Clear     — "CLEAR (WT/WT)", "clear", "N/N", "WT/WT", "-/-", "free", "homozygous normal"
 *   Carrier   — "CARRIER (WT/MUT)", "carrier", "N/m", "WT/MUT", "N/PRA", "heterozygous"
 *   Affected  — "AFFECTED (MUT/MUT)", "affected", "m/m", "MUT/MUT", "homozygous affected"
 * Anything unrecognised (including "hereditary clear", a lab reference, or a free
 * comment) falls into `other` and is still LISTED — never silently dropped.
 *
 * The word forms are checked before the allele pairs so "CLEAR (WT/WT)" cannot be
 * read as a carrier just because the string contains "MUT" somewhere else.
 */
export function classifyGenotype(raw: string | null | undefined): GenotypeClass {
  if (!raw) return 'other';
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (s === '') return 'other';

  // 1. Explicit words — the most reliable signal.
  if (/\bAFFECTED\b|\bHOMOZYGOUS AFFECTED\b|\bHOMOZYGOUS MUTANT\b/.test(s)) return 'affected';
  if (/\bCARRIER\b|\bHETEROZYGOUS\b/.test(s)) return 'carrier';
  if (/\bCLEAR\b|\bNORMAL\b|\bFREE\b|\bHOMOZYGOUS NORMAL\b/.test(s)) return 'clear';

  // 2. Allele pairs — split on / \ | or - and look at the two sides.
  const parts = s.split(/[/\\|-]/).map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length === 2) {
    const wild = (p: string) => p === 'N' || p === 'WT' || p === 'WILDTYPE' || p === '+';
    const mut = (p: string) => p === 'M' || p === 'MUT' || p === 'MUTANT';
    const [a, b] = parts;
    if (wild(a) && wild(b)) return 'clear';
    if (mut(a) && mut(b)) return 'affected';
    // A wild allele paired with anything non-wild reads as a carrier (covers the
    // lab style that names the mutation on one side, e.g. "N/PRA", "WT/rcd4").
    if (wild(a) !== wild(b)) return 'carrier';
  }
  return 'other';
}

// --- report shapes ----------------------------------------------------------

/** One dog in the listing, in the report's column order. */
export interface DnaTestRow {
  /**
   * Pedigree number — the owner's own record number for the dog, stored in
   * `Registration` (#6) in this database (confirmed 2026-08-27). Shown VERBATIM,
   * like every other value in this report, so the app never invents or renumbers
   * it; a dog with the column blank simply gets an empty cell.
   *
   * It is deliberately NOT SQLite's `rowid`: the rowid is an internal position
   * that changes when the file is rebuilt or VACUUMed, and it is not the number
   * the breed club's published report carries.
   */
  pedigreeNo: string;
  /** Dog's registered name — Pedigree."Name". */
  name: string;
  /** The result string, VERBATIM from the source column. */
  genotype: string;
  /** Which chart slice this row counts towards. */
  genotypeClass: GenotypeClass;
  /** Sire (father's name), or '' when unknown. */
  sire: string;
  /** Dam (mother's name), or '' when unknown. */
  dam: string;
  /** Date of birth as the source holds it, tidied to DD-MMM-YYYY where parseable. */
  dob: string;
}

/** One slice of the genotype pie. */
export interface DnaTestSlice {
  id: GenotypeClass;
  label: string;
  count: number;
  /** Share of `total`, 0–100. */
  percent: number;
}

/** The whole report the renderer draws. */
export interface DnaTestReport {
  /** Which test this is — the dropdown's id. */
  testId: string;
  /** `PRA-rcd4 (PRA-rcd4-C2orf71)`. */
  testTitle: string;
  /** Short name only, for the table's genotype column header. */
  testLabel: string;
  /** True when the opened database actually has this test's column. False means
   *  "this database was never given the column", which reads differently from
   *  "the column is there but nobody is tested". */
  columnPresent: boolean;
  /** Dogs with a result, sorted by name. */
  rows: DnaTestRow[];
  /** rows.length — the "N results" figure in the header and above the chart. */
  total: number;
  /** Non-empty slices, in GENOTYPE_CLASSES order. */
  slices: DnaTestSlice[];
}

/** Trimmed text of one catalogue field, or '' when absent/NULL/blank. */
function text(animal: Animal, alias: string): string {
  const v = animal.fields?.[alias];
  return v == null ? '' : String(v).trim();
}

/**
 * Tidy a stored date for display. The source holds several shapes across
 * imports (`2022-06-13 00:00:00`, `13/06/2022`, `19.4.2024`); only the ISO form
 * is reformatted to `DD-MMM-YYYY`, everything else is passed through unchanged so
 * no import's own convention is silently rewritten.
 */
export function displayDob(raw: string): string {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw.trim();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, y, mo, d] = m;
  const mi = Number(mo) - 1;
  return `${d}-${mi >= 0 && mi < 12 ? MONTHS[mi] : mo}-${y}`;
}

/**
 * Build the report for one test from the entries that carry a result.
 *
 * `animals` is expected to be pre-filtered by the data layer (the SQL only
 * returns rows whose test column is non-blank), but the filter is repeated here
 * so the function is correct on any input and can be unit-tested against a plain
 * array. Rows are sorted by name, case-insensitively, to match the sample report.
 */
export function buildDnaTestReport(
  animals: readonly Animal[],
  testId: string,
  columnPresent = true,
): DnaTestReport {
  const rows: DnaTestRow[] = [];
  for (const a of animals) {
    const genotype = text(a, testId);
    if (genotype === '') continue;
    rows.push({
      pedigreeNo: (a.registration ?? '').trim(),
      name: a.name,
      genotype,
      genotypeClass: classifyGenotype(genotype),
      sire: (a.sire ?? '').trim(),
      dam: (a.dam ?? '').trim(),
      dob: displayDob(a.dob ?? ''),
    });
  }
  rows.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));

  const total = rows.length;
  const counts = new Map<GenotypeClass, number>();
  for (const r of rows) counts.set(r.genotypeClass, (counts.get(r.genotypeClass) ?? 0) + 1);

  const slices: DnaTestSlice[] = GENOTYPE_CLASSES.filter((c) => (counts.get(c.id) ?? 0) > 0).map(
    (c) => {
      const count = counts.get(c.id) as number;
      return { id: c.id, label: c.label, count, percent: (count / total) * 100 };
    },
  );

  const test = DNA_TEST_BY_ID.get(testId);
  return {
    testId,
    testTitle: dnaTestTitle(testId),
    testLabel: test?.label ?? testId,
    columnPresent,
    rows,
    total,
    slices,
  };
}

// --- CSV --------------------------------------------------------------------

/** RFC-4180 field: quote when the value holds a comma, quote, or line break. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The report as CSV, in the same column order as the on-screen table, with a
 * short summary block above it so a saved file carries its own context (which
 * test, how many dogs, the genotype tally) instead of being a bare grid.
 *
 * Lines end CRLF and the caller writes a UTF-8 BOM, which is what makes Excel
 * open the accented kennel names correctly on both macOS and Windows.
 */
export function dnaReportCsv(report: DnaTestReport, generatedOn: string): string {
  const lines: string[] = [];
  lines.push([csvField(`${report.testTitle} — DNA test report`)].join(','));
  lines.push([csvField('Generated'), csvField(generatedOn)].join(','));
  lines.push([csvField('Dogs with a result'), String(report.total)].join(','));
  for (const s of report.slices) {
    lines.push([csvField(s.label), String(s.count), `${s.percent.toFixed(1)}%`].join(','));
  }
  lines.push('');
  lines.push(
    [
      'Pedigree No.',
      "Dog's registered name",
      `${report.testLabel} genotype`,
      "Sire (father's name)",
      "Dam (mother's name)",
      'Date of birth',
    ]
      .map(csvField)
      .join(','),
  );
  for (const r of report.rows) {
    lines.push(
      [r.pedigreeNo, r.name, r.genotype, r.sire, r.dam, r.dob].map(csvField).join(','),
    );
  }
  return lines.join('\r\n');
}
