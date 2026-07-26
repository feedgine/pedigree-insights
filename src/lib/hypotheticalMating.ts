// hypotheticalMating.ts — the planning engine behind the "Hypothetical Mating"
// tab (PRD §6.8). Pure and DB-agnostic (takes an AnimalLookup + an `asOf` date),
// like the other src/lib modules, so it runs in the Electron main process and in
// unit tests. NOTHING here writes to the database — this is a read-only preview.
//
// KEY IDEA — a VIRTUAL OFFSPRING over the two chosen parents
// ----------------------------------------------------------
// Instead of special-casing a "litter", we wrap the base lookup so a single
// synthetic offspring resolves to an Animal whose Sire/Dam are the two selected
// dogs (makeMatingLookup). Every other Name falls through to the real database.
// That lets ALL the existing, validated pieces operate on the litter unchanged:
//   • the expand-all pedigree tree (buildPedigreeTree) for the chart, with the
//     same repeated-ancestor colour-coding as the Pedigree tab (common ancestors
//     on both sides are exactly the repeated ancestors of the offspring);
//   • the line-breeding report (analyzeLinebreeding + applyGenetics) for the
//     common ancestors, their crosses/notation, and the litter COI/AVK — the
//     litter's inbreeding IS the coancestry of its parents, which the validated
//     Meuwissen-Luo / Colleau engine computes as the offspring's F.
// On top of that we add the Appendix-C classifier and the warn-only sex/age
// checks. No new genetics, schema, or DB-contract code — only composition.
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — feature design, 2026-07-25
// [DRAFT — requires Yuliya's review]

import type { Animal } from './schema';
import {
  AnimalLookup,
  PedigreeTreeNode,
  MAX_GENERATIONS_CAP,
  buildPedigreeTree,
  clampGenerations,
} from './pedigreeAlgorithm';
import {
  AncestorCrosses,
  DEFAULT_MIN_CROSSES,
  analyzeLinebreeding,
} from './linebreeding';
import { applyGenetics, type CycleWarning } from './genetics';
import { classifyLinebreeding, type MatingClassification } from './matingClassifier';
import { checkMating, type MatingWarning } from './matingChecks';

/** Projected-pedigree depth window offered by the UI (PRD §6.8: 3–10, default 5). */
export const HYPOTHETICAL_MATING_MIN_GENERATIONS = 3;
export const HYPOTHETICAL_MATING_MAX_GENERATIONS = 10;
export const DEFAULT_HYPOTHETICAL_MATING_GENERATIONS = 5;

/** The projected-pedigree CHART is an expand-all bracket (2^gen cells) and is
 *  rendered exactly like the Pedigree tab's bracket, so it is capped at the SAME
 *  legible maximum the Pedigree tab uses (PRD §6.3: up to 8 → 256 cells). Beyond
 *  8 a bracket is unreadable and can't be exported to one page (10 generations on
 *  a line-bred population is ~1024 rows). The litter COI/AVK and the common-ancestor
 *  analysis still use the full selected depth (3–10); only the drawn bracket is
 *  bounded. */
export const HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS = 8;

/** Label for the virtual, never-persisted offspring node (the planned litter). */
export const PLANNED_LITTER_NAME = '(Planned litter)';

const lc = (s: string): string => s.trim().toLowerCase();

/** Clamp a requested depth into the mating window [3,10]. */
export function clampMatingGenerations(n: number): number {
  const g = clampGenerations(n, HYPOTHETICAL_MATING_MAX_GENERATIONS);
  return Math.max(HYPOTHETICAL_MATING_MIN_GENERATIONS, g);
}

/**
 * Wrap `base` so the single virtual offspring resolves to an Animal whose Sire /
 * Dam are the two chosen parents; every other Name falls through to `base`. The
 * synthetic animal is never written anywhere — this powers a read-only preview.
 */
export function makeMatingLookup(
  base: AnimalLookup,
  sireName: string,
  damName: string,
  offspringName: string = PLANNED_LITTER_NAME,
): AnimalLookup {
  const sire = base(sireName);
  const dam = base(damName);
  const offspring: Animal = {
    name: offspringName,
    sire: sire ? sire.name : null,
    dam: dam ? dam.name : null,
    sex: null,
    dob: null,
    registration: null,
    preTitle: null,
    postTitle: null,
    color: null,
    breed: null,
    coi: null,
    avk: null,
  };
  const key = lc(offspringName);
  return (name: string) => (lc(name) === key ? offspring : base(name));
}

/** The full analysis returned to the renderer for the Hypothetical Mating tab. */
export interface HypotheticalMatingReport {
  /** True only when BOTH parents resolved to real database rows. */
  found: boolean;
  /** Canonical Names of the chosen parents (as stored, when found). */
  sireName: string;
  damName: string;
  sire: Animal | null;
  dam: Animal | null;
  /** Analysis depth (clamped to 3–10): drives common ancestors, AVK, classification. */
  generations: number;
  /** Depth the bracket CHART was actually drawn to (<= generations; capped for
   *  legibility at HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS). */
  chartGenerations: number;
  /** Projected offspring pedigree (expand-all, cycle-guarded) for the chart. */
  tree: PedigreeTreeNode;
  /** Litter COI = coancestry(sire, dam), a percentage [0,100] (computed estimate). */
  litterCoi: number | null;
  /** Litter AVK (Ancestor-Loss Coefficient), a percentage (computed estimate). */
  litterAvk: number | null;
  /** Ancestors common to both sides (the litter's line-breeding), ranked by Blood %. */
  commonAncestors: AncestorCrosses[];
  /** Distinct ancestors within `generations` (excludes the litter itself). */
  uniqueAncestors: number;
  /** Total ancestor slots walked including repeats (excludes the litter). */
  totalCrosses: number;
  /** Appendix-C pattern classification (notes, never hard claims). */
  classification: MatingClassification;
  /** Warn-only checks (sex mismatch / out-of-age-window); never blocks. */
  warnings: MatingWarning[];
  /** Pedigree cycles detected during the COI math (data errors), if any. */
  geneticsWarnings?: CycleWarning[];
}

/**
 * Build the Hypothetical Mating analysis for a planned dam × sire. `asOf` is
 * injected (not read from the clock here) so the age checks stay deterministic
 * and unit-testable. Read-only: nothing is written to the database.
 */
export function buildHypotheticalMating(
  lookup: AnimalLookup,
  sireName: string,
  damName: string,
  generations: number,
  asOf: Date,
): HypotheticalMatingReport {
  const gens = clampMatingGenerations(generations);
  const sire = lookup(sireName);
  const dam = lookup(damName);
  const matingLookup = makeMatingLookup(lookup, sireName, damName);

  // Chart: expand-all so both parents' sides are fully drawn and repeated
  // (= common) ancestors get colour-coded, exactly like the Pedigree tab. The
  // bracket is capped at HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS for legibility
  // (a deeper expand-all bracket is unreadable / can't export to one page); the
  // COI/AVK and common-ancestor analysis below still use the full `gens`.
  const chartGens = Math.min(gens, HYPOTHETICAL_MATING_CHART_MAX_GENERATIONS);
  const tree = buildPedigreeTree(
    matingLookup,
    PLANNED_LITTER_NAME,
    chartGens,
    true,
    MAX_GENERATIONS_CAP,
  );

  // Common ancestors + litter COI/AVK, from the validated engine applied to the
  // virtual offspring (its F = the coancestry of the two parents).
  const report = analyzeLinebreeding(matingLookup, PLANNED_LITTER_NAME, gens, DEFAULT_MIN_CROSSES);
  applyGenetics(report, matingLookup);

  const classification = classifyLinebreeding({
    ancestors: report.ancestors,
    sire,
    dam,
    sireName,
    damName,
    offspringCoiPct: report.subjectCoi,
    generations: gens,
  });

  const warnings = checkMating(dam, sire, asOf);

  return {
    found: !!sire && !!dam,
    sireName: sire?.name ?? sireName,
    damName: dam?.name ?? damName,
    sire,
    dam,
    generations: gens,
    chartGenerations: chartGens,
    tree,
    litterCoi: report.subjectCoi,
    litterAvk: report.subjectAvk,
    commonAncestors: report.ancestors,
    uniqueAncestors: report.uniqueAncestors,
    totalCrosses: report.totalCrosses,
    classification,
    warnings,
    geneticsWarnings: report.geneticsWarnings,
  };
}
