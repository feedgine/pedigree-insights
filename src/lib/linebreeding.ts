// linebreeding.ts — pure, DB-agnostic linebreeding analysis.
//
// [DRAFT — requires Yuliya's review] until confirmed against a reference dog on
// the target Mac (see "Validation / open questions" at the bottom).
//
// Mirrors pedigreeAlgorithm.ts: it takes an `AnimalLookup` and knows nothing
// about SQLite or React, so the same code runs in the Electron main process
// (lookup backed by better-sqlite3) and in unit tests (lookup backed by a Map).
//
// WHY THIS DOES NOT REUSE buildPedigreeTree
// -----------------------------------------
// buildPedigreeTree DE-DUPLICATES repeated ancestors: the first encounter is
// expanded, any later encounter becomes a `repeated` leaf and is skipped by
// groupByGeneration. A linebreeding report is precisely about those repeats, so
// it needs a traversal that records EVERY occurrence path. It is still bounded
// by the two non-negotiable guards (CLAUDE.md):
//   1. A finite depth cap (clampGenerations → 1..MAX_GENERATIONS_CAP).
//   2. A loop guard. Here it is a PER-PATH ancestor set (not a global one):
//      a true cycle — an animal that appears within its own ancestry — is
//      stopped, while a legitimately repeated ancestor reached on a DIFFERENT
//      path is still recorded (that is the whole point of the report).
//
// SCOPE — structural + deterministic blood contribution (product decision
// 2026-06-25, extended 2026-06-27)
// ----------------------------------------------------
// This module computes the DETERMINISTIC columns of the PedigreeOnline
// linebreeding report: the per-occurrence cross list, the cross and line counts
// with a sire/dam split, the closest cross, the Blood % (Wright's ½^gen blood
// contribution) and its canonical "Influence" restatement. Blood %/Influence are
// structural — the same contribution quantity already computed in-app for the
// Foundation report (contribution.ts, owner-approved) — so they are computed and
// labelled as estimates here, and the report is sorted by Blood % to surface top
// influencers.
//
// It does NOT compute the relationship-matrix genetics — the subject COI/AVK and
// the per-ancestor AGR. Those are validated quantities supplied by the separate
// COI/AVK/AGR calculation (a distinct module/step, not a separate app), and the
// UI renders them only when that step has provided a value (em dash otherwise),
// per CLAUDE.md's genetics-validation rule.

import { Animal } from './schema';
import {
  AnimalLookup,
  LINEBREEDING_MAX_GENERATIONS,
  clampGenerations,
} from './pedigreeAlgorithm';

/** Which side of the SUBJECT a path begins on: 'S' = sire (top) line, 'D' =
 *  dam (bottom) line. Constant along any single root→ancestor path. */
export type Side = 'S' | 'D';

/** One appearance of an ancestor in the subject's pedigree. */
export interface Occurrence {
  /** Depth from the subject. The subject's parents are generation 1. */
  generation: number;
  /** Top-level branch the path begins on (the subject's sire vs dam side). */
  side: Side;
  /** Slot letters from the subject down to this ancestor, e.g. 'SDS'
   *  (sire → dam → sire). Length always equals `generation`. */
  path: string;
}

/** Aggregated crosses for a single repeated ancestor. */
export interface AncestorCrosses {
  /** The ancestor's Name (canonical casing from its own row). */
  name: string;
  animal: Animal;
  /** Every appearance, in discovery order. */
  occurrences: Occurrence[];
  /** occurrences.length — the "Crosses" column. */
  crosses: number;
  /** Occurrences reached via the subject's sire (top) side. */
  sireLines: number;
  /** Occurrences reached via the subject's dam (bottom) side. */
  damLines: number;
  /** Smallest generation at which the ancestor appears (the closest cross). */
  closest: number;
  /** True if any occurrence sits in the final (deepest) generation walked —
   *  PedigreeOnline marks these rows with '*'. */
  inFinalGeneration: boolean;
  /** PedigreeOnline-style cross list, e.g. '3S x 1S'. The letter is the
   *  subject side (S/D); the CASE encodes the ancestor's sex (M → upper,
   *  F → lower, unknown → upper). [DRAFT: case/letter convention is the
   *  documented PedigreeOnline reading but is pending verification against a
   *  known reference dog.] */
  notation: string;
  /** The two closest crosses as 'AxB' (A ≤ B). Retained as a raw diagnostic;
   *  the report's "Influence" column now uses `influence` (below). */
  closestPair: string | null;
  /** PedigreeOnline-style "Influence" — the canonical equivalent cross pair
   *  'AxB' that represents this ancestor's Blood % contribution, or '< 7x7' when
   *  the contribution is below the 7×7 floor. Computed in-app from `bloodPercent`
   *  (deterministic), reverse-engineered from and verified against the
   *  PedigreeOnline reference report (all 46 rows of the Daesdaemar Sunset Blvd
   *  PDF reproduce). See `influenceLabel`. */
  influence: string;

  // --- Genetics columns ---
  /** The ancestor's own inbreeding coefficient — Pedigree."Inbreeding
   *  Coefficient". A validated genetics quantity: display-only, populated by the
   *  separate COI/AVK/AGR calculation; null until provided. NEVER computed in
   *  this structural module (CLAUDE.md). */
  coi: number | null;
  /** "Blood %" — this ancestor's genetic blood contribution to the subject =
   *  Σ (1/2)^generation over every cross within `generations`. A deterministic
   *  STRUCTURAL quantity (Wright's contribution — the same kind already computed
   *  in-app for the Foundation report, contribution.ts, owner-approved
   *  2026-06-25), so it IS computed here and labelled a computed estimate. It is
   *  distinct from the validated COI and from AGR. */
  bloodPercent: number | null;
  /** "AGR" — Additive Genetic Relationship between subject and ancestor. A
   *  relationship-matrix quantity (same genetics family as COI/AVK, NOT a path
   *  sum — it depends on the inbreeding of connecting ancestors). Display-only,
   *  populated by the separate genetics calculation; null until provided. NEVER
   *  computed in this structural module. */
  agr: number | null;
}

/** The full structural report for one subject. */
export interface LinebreedingReport {
  /** Subject Name (canonical casing if the subject was found). */
  subject: string;
  /** True if the subject Name resolved to a row. */
  found: boolean;
  /** Subject's stored inbreeding coefficient (the report's header "COI") —
   *  Pedigree."Inbreeding Coefficient". Display-only; null until the external
   *  script populates it. */
  subjectCoi: number | null;
  /** Subject's stored relationship coefficient (AVK) — display-only, null until
   *  the external script populates it. */
  subjectAvk: number | null;
  /** Depth cap actually used after clamping. */
  generations: number;
  /** Minimum crosses required for an ancestor to be listed. */
  minCrosses: number;
  /** Repeated ancestors meeting `minCrosses`, sorted by Blood % (genetic
   *  contribution) desc — the "top influencers" ordering — then crosses desc,
   *  closest cross asc, then Name. */
  ancestors: AncestorCrosses[];
  /** Distinct resolved ancestors reachable within `generations` by any
   *  non-cyclic path, EXCLUDING the subject — "unique ancestors in N gens".
   *  This is a SUPERSET of the de-duplicated pedigree-tree count: that tree
   *  stops expanding a repeated ancestor at its first-seen position, whereas
   *  this walk explores every occurrence, so the two coincide at shallow depths
   *  and diverge once deep repeats appear. */
  uniqueAncestors: number;
  /** Total ancestor slots walked (counting repeats), EXCLUDING the subject. */
  totalCrosses: number;
  /** Pedigree cycles detected by the genetics step (a dog within its own
   *  ancestry — a data error). Surfaced so the user can correct the data; the
   *  offending edges are broken for the COI/AGR math. Empty/undefined when the
   *  genetics step has not run or found none. */
  geneticsWarnings?: Array<{ child: string; parent: string; relation: 'Sire' | 'Dam' }>;
}

/** PedigreeOnline's default "Inbreds" filter shows ancestors with ≥ 2 crosses. */
export const DEFAULT_MIN_CROSSES = 2;

/** Build a single cross token, e.g. (3, 'S', 'M') → '3S', (2, 'D', 'F') → '2d'. */
function notationToken(gen: number, side: Side, sex: Animal['sex']): string {
  // Upper-case for males and unknown sex; lower-case for females.
  const letter = sex === 'F' ? side.toLowerCase() : side;
  return `${gen}${letter}`;
}

/** Canonical "Influence" buckets, in descending contribution value: the balanced
 *  pairs (n×n) and near-balanced pairs (n×(n+1)) for n = 2..7. PedigreeOnline
 *  expresses each ancestor's Blood % as the largest of these equivalent pairs
 *  whose value (½^A + ½^B) does not exceed the contribution. Below 7×7 it shows
 *  '< 7x7'. (Reverse-engineered and verified against the reference report.) */
const INFLUENCE_BUCKETS: ReadonlyArray<{ value: number; label: string }> = (() => {
  const pairs: Array<[number, number]> = [];
  for (let n = 2; n <= 7; n++) {
    pairs.push([n, n]);
    if (n < 7) pairs.push([n, n + 1]);
  }
  return pairs
    .map(([a, b]) => ({ value: 0.5 ** a + 0.5 ** b, label: `${a}x${b}` }))
    .sort((x, y) => y.value - x.value);
})();

/** Map a blood-contribution FRACTION in [0,1] to the PedigreeOnline "Influence"
 *  label. Operates on the unrounded fraction so threshold rows (e.g. 7×7 at
 *  exactly 1/64) classify the same way PedigreeOnline's do. */
function influenceLabel(bloodFraction: number): string {
  for (const b of INFLUENCE_BUCKETS) {
    if (b.value <= bloodFraction + 1e-12) return b.label;
  }
  return '< 7x7';
}

/**
 * Analyze the linebreeding of `subjectName` up to `generations` deep.
 *
 * The traversal is sire-first preorder and records every occurrence of every
 * ancestor (no de-duplication). It is depth-capped and protected against true
 * cycles by a backtracking per-path set, so it always terminates. A small cache
 * avoids resolving the same Name from the DB more than once per call.
 */
export function analyzeLinebreeding(
  lookup: AnimalLookup,
  subjectName: string,
  generations: number,
  minCrosses: number = DEFAULT_MIN_CROSSES,
): LinebreedingReport {
  // Linebreeding allows deeper detail than the bracket chart (up to 20 gens).
  const cap = clampGenerations(generations, LINEBREEDING_MAX_GENERATIONS);

  // Accumulate occurrences per ancestor, keyed by lower-cased Name to mirror
  // the SQL layer's COLLATE NOCASE matching.
  const byName = new Map<string, { animal: Animal; occ: Occurrence[] }>();

  // Resolve-cache: a heavily line-bred ancestor is reached on many paths.
  const cache = new Map<string, Animal | null>();
  function resolve(name: string): Animal | null {
    const k = name.trim().toLowerCase();
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const a = lookup(name);
    cache.set(k, a);
    return a;
  }

  let totalCrosses = 0;

  // Backtracking set of lower-cased Names on the CURRENT root→node path. This is
  // the cycle guard: a Name already on the path is a true loop and is stopped.
  const onPath = new Set<string>();

  function walk(
    name: string | null,
    generation: number,
    side: Side | null,
    path: string,
  ): void {
    const key = name?.trim();
    if (!key) return;                 // unknown / '' parent → this line ends
    const animal = resolve(key);
    if (!animal) return;              // foundation ancestor, no row → line ends

    const lc = key.toLowerCase();
    if (onPath.has(lc)) return;       // animal within its own ancestry → cycle

    // Record the occurrence (generation 0 is the subject itself — never a cross).
    if (generation >= 1 && side) {
      totalCrosses += 1;
      const entry = byName.get(lc) ?? { animal, occ: [] };
      entry.occ.push({ generation, side, path });
      byName.set(lc, entry);
    }

    if (generation >= cap) return;    // finite depth cap — never unbounded

    onPath.add(lc);
    // At the subject (generation 0) the two branches DEFINE the side; deeper, the
    // side is inherited unchanged along the path.
    const sireSide: Side = generation === 0 ? 'S' : (side as Side);
    const damSide: Side = generation === 0 ? 'D' : (side as Side);
    walk(animal.sire, generation + 1, sireSide, path + 'S');
    walk(animal.dam, generation + 1, damSide, path + 'D');
    onPath.delete(lc);
  }

  const subject = resolve(subjectName);
  if (subject) walk(subjectName, 0, null, '');

  const ancestors: AncestorCrosses[] = [];
  for (const { animal, occ } of byName.values()) {
    const crosses = occ.length;
    if (crosses < minCrosses) continue;

    const sireLines = occ.reduce((n, o) => n + (o.side === 'S' ? 1 : 0), 0);
    const damLines = crosses - sireLines;
    const sortedGens = occ.map((o) => o.generation).sort((a, b) => a - b);
    const closest = sortedGens[0];
    const inFinalGeneration = sortedGens[sortedGens.length - 1] === cap;

    // Order crosses by generation, then sire side (S) before dam side (D) — the
    // reading order of the PedigreeOnline report (top line first).
    const sideRank = (s: Side) => (s === 'S' ? 0 : 1);
    const notation = occ
      .slice()
      .sort((a, b) => a.generation - b.generation || sideRank(a.side) - sideRank(b.side))
      .map((o) => notationToken(o.generation, o.side, animal.sex))
      .join(' x ');

    const closestPair =
      sortedGens.length >= 2 ? `${sortedGens[0]}x${sortedGens[1]}` : null;

    // Blood % — Wright's genetic blood contribution = Σ (1/2)^generation over
    // every cross within the report depth. Deterministic structural quantity
    // (computed in-app, labelled an estimate); "Influence" is its canonical
    // equivalent-pair restatement.
    const bloodFraction = occ.reduce((s, o) => s + 0.5 ** o.generation, 0);
    const bloodPercent = bloodFraction * 100;
    const influence = influenceLabel(bloodFraction);

    ancestors.push({
      name: animal.name,
      animal,
      occurrences: occ,
      crosses,
      sireLines,
      damLines,
      closest,
      inFinalGeneration,
      notation,
      closestPair,
      influence,
      // COI is the ancestor's stored/validated value (display-only). Blood % is a
      // computed structural estimate. AGR is a genetics-matrix value supplied by
      // the separate COI/AVK/AGR calculation, null until provided.
      coi: animal.coi,
      bloodPercent,
      agr: null,
    });
  }

  // Rank by genetic contribution (Blood %) descending — the PedigreeOnline
  // ordering, and the "top influencers" view the report is meant to answer.
  // Tie-break by raw crosses desc, then closest cross asc, then Name.
  ancestors.sort(
    (a, b) =>
      (b.bloodPercent ?? 0) - (a.bloodPercent ?? 0) ||
      b.crosses - a.crosses ||
      a.closest - b.closest ||
      a.name.localeCompare(b.name),
  );

  return {
    subject: subject?.name ?? subjectName,
    found: subject !== null,
    subjectCoi: subject?.coi ?? null,
    subjectAvk: subject?.avk ?? null,
    generations: cap,
    minCrosses,
    ancestors,
    uniqueAncestors: byName.size,
    totalCrosses,
  };
}

// ---------------------------------------------------------------------------
// Validation / open questions ([DRAFT] — confirm before matching PedigreeOnline
// numbers exactly):
//   - Cross notation case convention (S/s, D/d): implemented as subject-side
//     letter + sex-based case. Confirm against a reference dog's report.
//   - "Lines" vs "Crosses": PedigreeOnline shows both; this module treats Lines
//     as occurrences split by subject side. Confirm whether their "Lines" is a
//     distinct unique-path count.
//   - "Influence" column: now the canonical equivalent-pair restatement of
//     Blood % (influenceLabel). Reverse-engineered from the PedigreeOnline
//     report and verified — all 46 rows of the Daesdaemar Sunset Blvd reference
//     PDF reproduce (the only "misses" are display-rounding at exact 6×7 / 7×7
//     thresholds, which resolve on the unrounded value).
//   - Blood %: computed here (Σ ½^gen, a structural estimate); verified against
//     the reference report (62.50 % for 1S+3S, 43.75 % for 2D+3S+4S, etc.).
//   - AGR, subject COI/AVK: NOT computed here — relationship-matrix genetics
//     supplied by the separate validated calculation (CLAUDE.md).
// ---------------------------------------------------------------------------
