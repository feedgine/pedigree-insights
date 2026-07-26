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

export type MatingWarningKind = 'sex' | 'dam-age' | 'sire-age';

export interface MatingWarning {
  kind: MatingWarningKind;
  message: string;
}

/** Breeding-age windows (years), owner-provided (PRD §6.8). */
export const DAM_MIN_AGE = 1;
export const DAM_MAX_AGE = 8;
export const SIRE_MIN_AGE = 1;
export const SIRE_MAX_AGE = 12;

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

  return warnings;
}
