// matingChecks.ts — warn-only breeding checks for the Hypothetical Mating tab
// (PRD §6.8). Pure and DB-agnostic (takes two Animals + an `asOf` date), like the
// other src/lib modules, so it runs in the Electron main process and in unit
// tests. These checks NEVER block the preview — they only surface advisories.
//
// Owner rules (PRD §6.8): the two picks should be one female (dam) + one male
// (sire); a dam is typically bred at 1–8 years and a sire at 1–12 years, measured
// as of today. Missing Sex or DOB is treated as "unknown" and raises NO warning
// for that field (never a false positive on incomplete data).
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — check rules, 2026-07-25
// [DRAFT — requires Yuliya's review]

import type { Animal } from './schema';

export type MatingWarningKind = 'sex' | 'dam-age' | 'sire-age' | 'health';

export interface MatingWarning {
  kind: MatingWarningKind;
  message: string;
}

/** Breeding-age windows (years), owner-provided (PRD §6.8). */
export const DAM_MIN_AGE = 1;
export const DAM_MAX_AGE = 8;
export const SIRE_MIN_AGE = 1;
export const SIRE_MAX_AGE = 12;

/** Recessive DNA-test markers surfaced in the Hypothetical Mating carrier check.
 *  Extend this list to cover more tests; each maps an Animal field to a label. */
export const RECESSIVE_MARKERS: ReadonlyArray<{ field: 'praRcd4C2orf71' | 'samsKcnj10'; label: string }> = [
  { field: 'praRcd4C2orf71', label: 'PRA (rcd4 / C2orf71)' },
  { field: 'samsKcnj10', label: 'SAMS (KCNJ10)' },
];

export type DnaStatus = 'clear' | 'carrier' | 'affected' | 'unknown';

/** Normalise a DNA-test cell to a status. Recognises the words Clear/Normal,
 *  Carrier, Affected/At-risk, and genotype pairs like N/N, N/m, m/m (any
 *  non-normal allele token = mutant). Anything unrecognised -> 'unknown', so a
 *  blank or odd value never raises a false warning. */
export function dnaStatus(value: string | null | undefined): DnaStatus {
  if (!value) return 'unknown';
  const s = value.trim().toLowerCase();
  if (!s) return 'unknown';
  if (/\baffected\b|\bat[-\s]?risk\b/.test(s)) return 'affected';
  if (/\bcarrier\b/.test(s)) return 'carrier';
  if (/\bclear\b|\bnormal\b/.test(s)) return 'clear';
  const alleles = s.replace(/\s+/g, '').split(/[/|,;]+/).filter(Boolean);
  if (alleles.length === 2) {
    const normal = (x: string) => x === 'n' || x === 'normal' || x === 'wt' || x === '+' || x === 'clear';
    const a = normal(alleles[0]);
    const b = normal(alleles[1]);
    if (a && b) return 'clear';
    if (a !== b) return 'carrier';
    return 'affected';
  }
  return 'unknown';
}

/** Recessive-inheritance risk note for a marker given the two parents' statuses,
 *  or null when there is no affected/carrier-propagation concern to flag. */
function recessiveRisk(label: string, a: DnaStatus, b: DnaStatus): string | null {
  const both = [a, b];
  const affected = both.filter((x) => x === 'affected').length;
  const carrier = both.filter((x) => x === 'carrier').length;
  if (affected === 2) return `${label}: both parents are Affected — the whole litter will be Affected (recessive).`;
  if (affected === 1 && carrier === 1) return `${label}: one parent Affected + one Carrier — ~50% of the litter could be Affected (recessive).`;
  if (affected === 1 && both.includes('clear')) return `${label}: one parent Affected — no puppy will be Affected, but every puppy will be a Carrier (recessive).`;
  if (carrier === 2) return `${label}: both parents are Carriers — ~25% of the litter could be Affected (recessive).`;
  return null;
}

/**
 * Parse a stored DOB into a UTC Date, or null if blank/unparseable. Accepts an
 * ISO datetime ('YYYY-MM-DD…') or the BreedMate US form 'M/D/YYYY'; anything
 * else yields null (we never invent a date).
 */
export function parseDob(dob: string | null | undefined): Date | null {
  if (!dob) return null;
  const s = dob.trim();
  if (!s) return null;
  let y = 0, m = 0, d = 0;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else {
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!us) return null;
    m = Number(us[1]); d = Number(us[2]); y = Number(us[3]);
  }
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Age in (fractional) years between a DOB and `asOf`, or null if unparseable.
 *  A future DOB (dirty data) clamps to 0 rather than a negative age. */
export function ageYears(dob: string | null | undefined, asOf: Date): number | null {
  const born = parseDob(dob);
  if (!born) return null;
  const ms = asOf.getTime() - born.getTime();
  if (ms <= 0) return 0;
  return ms / (365.2425 * 24 * 60 * 60 * 1000);
}

/**
 * Warn-only checks for a planned dam × sire. Returns an array (possibly empty).
 * Never throws and never blocks; missing Sex/DOB is silently "unknown".
 */
export function checkMating(
  dam: Animal | null,
  sire: Animal | null,
  asOf: Date,
): MatingWarning[] {
  const warnings: MatingWarning[] = [];

  // Sex — the dam should be female and the sire male. Only warn on a KNOWN,
  // contradicting value (missing sex → unknown → no warning).
  const sexIssues: string[] = [];
  if (dam?.sex && dam.sex !== 'F') sexIssues.push(`the dam "${dam.name}" is recorded as ${dam.sex}`);
  if (sire?.sex && sire.sex !== 'M') sexIssues.push(`the sire "${sire.name}" is recorded as ${sire.sex}`);
  if (sexIssues.length > 0) {
    warnings.push({
      kind: 'sex',
      message: `Sex mismatch — ${sexIssues.join(' and ')} (expected one female dam + one male sire).`,
    });
  }

  // Age windows, as of today. Missing DOB → unknown → no warning.
  const damAge = dam ? ageYears(dam.dob, asOf) : null;
  if (damAge != null && (damAge < DAM_MIN_AGE || damAge > DAM_MAX_AGE)) {
    warnings.push({
      kind: 'dam-age',
      message: `The dam is ~${damAge.toFixed(1)} years old — outside the usual ${DAM_MIN_AGE}–${DAM_MAX_AGE}-year window for a dam.`,
    });
  }
  const sireAge = sire ? ageYears(sire.dob, asOf) : null;
  if (sireAge != null && (sireAge < SIRE_MIN_AGE || sireAge > SIRE_MAX_AGE)) {
    warnings.push({
      kind: 'sire-age',
      message: `The sire is ~${sireAge.toFixed(1)} years old — outside the usual ${SIRE_MIN_AGE}–${SIRE_MAX_AGE}-year window for a sire.`,
    });
  }

  // Recessive DNA-test carrier check — only when BOTH parents have a readable
  // result (unknown/absent values never raise a warning).
  for (const m of RECESSIVE_MARKERS) {
    const risk = recessiveRisk(m.label, dnaStatus(sire?.[m.field]), dnaStatus(dam?.[m.field]));
    if (risk) warnings.push({ kind: 'health', message: risk });
  }

  return warnings;
}
