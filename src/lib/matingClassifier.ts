// matingClassifier.ts — classify a projected litter's pedigree against the
// owner-provided line-breeding strategy reference (PRD Appendix C: 8 methods +
// outcross). Pure and DB-agnostic: it reads the structural line-breeding rows
// (common ancestors with their per-occurrence crosses) already produced by
// analyzeLinebreeding, plus the two parents' immediate pedigrees, and returns a
// list of NOTES — never a hard assertion.
//
// Honesty (PRD §6.8, Q-HM-1): several methods are NOT determinable from a
// pedigree alone — Oppenheimer (a selection philosophy), and the kennel-level
// rotations (clan/quad, three-line rotation). We do NOT emit those as matches
// (unknown is not a claim). The paper-detectable ones are flagged 'match'; the
// partly-inferable ones (tail-line matriarchal, Morgan) are flagged 'possible'.
// When several patterns fit, all are surfaced (no fixed precedence yet).
//
// @author Yuliya Malinina <julia.malinina@gmail.com> — 8-method reference (Appendix C)
// [DRAFT — requires Yuliya's review]

import type { Animal } from './schema';
import type { AncestorCrosses } from './linebreeding';

export type MatchConfidence = 'match' | 'possible';

export interface LinebreedingMatch {
  /** Stable id (React key / test anchor). */
  key: string;
  /** Human-readable method name (Appendix C). */
  method: string;
  /** 'match' = detectable from the pedigree; 'possible' = partly inferable only. */
  confidence: MatchConfidence;
  /** Explanation, including cross notation (same form as the Linebreeding report). */
  note: string;
}

export interface MatingClassification {
  matches: LinebreedingMatch[];
  /** True when there is no (or only very deep) common ancestry — a paper outcross. */
  isOutcross: boolean;
  /** Note for the outcross / line-cross case (empty when not an outcross). */
  outcrossNote: string;
}

export interface ClassifyInput {
  /** Common ancestors of the virtual litter (crosses >= 2), ranked by Blood %. */
  ancestors: AncestorCrosses[];
  sire: Animal | null;
  dam: Animal | null;
  sireName: string;
  damName: string;
  /** Litter COI as a percentage [0,100] (used only for the outcross note). */
  offspringCoiPct: number | null;
  /** Depth the projection was built to. */
  generations: number;
}

const lc = (s: string): string => s.trim().toLowerCase();

/** Immediate parents of an animal as lowercased names (nulls/blanks dropped). */
function parentKeys(a: Animal | null): string[] {
  if (!a) return [];
  return [a.sire, a.dam]
    .filter((x): x is string => !!x && !!x.trim())
    .map(lc);
}

/** Highest-Blood% ancestor of a non-empty list (for a representative note). */
function strongest(list: AncestorCrosses[]): AncestorCrosses {
  return list.slice().sort((a, b) => (b.bloodPercent ?? 0) - (a.bloodPercent ?? 0))[0];
}

/**
 * Classify the projected litter. Returns notes only — nothing here blocks or is
 * asserted as certain. See the module header for what is (and is not) detectable.
 */
export function classifyLinebreeding(input: ClassifyInput): MatingClassification {
  const { ancestors, sire, dam, sireName, damName, offspringCoiPct, generations } = input;
  const matches: LinebreedingMatch[] = [];

  // 3. Onstott "Doubling-Up" — a pillar ancestor concentrated on BOTH the sire
  //    and dam sides (the mechanism at the core of most real line-breeding).
  const bothSides = ancestors.filter((a) => a.sireLines >= 1 && a.damLines >= 1);
  if (bothSides.length > 0) {
    const top = strongest(bothSides);
    matches.push({
      key: 'onstott',
      method: 'Onstott "Doubling-Up"',
      confidence: 'match',
      note: `${bothSides.length} ancestor${bothSides.length === 1 ? '' : 's'} appear on both the sire and dam sides — the doubling that concentrates an ancestor's genes. Strongest: ${top.animal.name} (${top.notation}).`,
    });
  }

  // 1. Brackett "Rule of Five" — one magnificent ancestor set at the 2nd + 3rd
  //    generations (a 2-3 / 3-2 cross; the positions sum to five).
  const brackett = ancestors.filter((a) => {
    const gens = new Set(a.occurrences.map((o) => o.generation));
    return gens.has(2) && gens.has(3);
  });
  if (brackett.length > 0) {
    const top = strongest(brackett);
    matches.push({
      key: 'brackett',
      method: 'Brackett "Rule of Five"',
      confidence: 'match',
      note: `${top.animal.name} is concentrated at the 2nd and 3rd generations (a 2-3 cross; positions sum to five) — ${top.notation}.`,
    });
  }

  // Close crosses read directly from the two parents' immediate pedigrees.
  const sireParents = parentKeys(sire);
  const damParents = parentKeys(dam);
  const shared = sireParents.filter((k) => damParents.includes(k));

  // Parent–offspring backcross: one chosen parent is itself a parent of the other.
  const backcross = sireParents.includes(lc(damName)) || damParents.includes(lc(sireName));
  if (backcross) {
    matches.push({
      key: 'parent-offspring',
      method: 'Parent–offspring backcross (very close)',
      confidence: 'match',
      note: `One selected parent is itself a parent of the other — a direct backcross, the closest form of line-breeding.`,
    });
    // 6. Morgan "three-in / one-out" builds on repeated close backcrosses; a
    //    single backcross is only a partial signature, so flag it as possible.
    matches.push({
      key: 'morgan',
      method: 'Morgan "three-in / one-out"',
      confidence: 'possible',
      note: `A close backcross is present; Morgan's method repeats this for three generations then adds one outcross — confirm from the breeding history.`,
    });
  }

  // 7. Half-sibling cross — the two parents share exactly one parent.
  //    (Sharing BOTH parents is a full-sib mating — even more intense.)
  if (shared.length >= 2) {
    matches.push({
      key: 'full-sib',
      method: 'Full-sibling mating (very close)',
      confidence: 'match',
      note: `The chosen dam and sire share BOTH parents (full siblings) — an intense cross; litter COI is typically ~25%.`,
    });
  } else if (shared.length === 1) {
    const sharedName =
      [sire?.sire, sire?.dam, dam?.sire, dam?.dam].find((n) => n && lc(n) === shared[0]) ?? shared[0];
    matches.push({
      key: 'half-sib',
      method: 'Half-sibling cross',
      confidence: 'match',
      note: `The chosen dam and sire share one parent (${sharedName}) — a half-sib cross; litter COI is typically ~12.5%.`,
    });
  }

  // 5. Tail-line matriarchal (Wycliffe / Jean Lyle) — concentration straight down
  //    the unbroken dam (bottom) line. Only partly inferable from paper → possible.
  const bottomLine = ancestors.filter((a) =>
    a.occurrences.some((o) => o.path.length >= 2 && /^D+$/.test(o.path)),
  );
  if (bottomLine.length > 0) {
    const top = strongest(bottomLine);
    matches.push({
      key: 'wycliffe',
      method: 'Tail-line matriarchal (Wycliffe)',
      confidence: 'possible',
      note: `${top.animal.name} sits on the unbroken dam (bottom) line — possible tail-female line-breeding; confirm the matriarchal line from the records.`,
    });
  }

  // Outcross / line-cross — the "none of the above": no common ancestor within
  // the depth, or only very deep doublings (closest cross 5+ generations back).
  const closest = ancestors.reduce((m, a) => Math.min(m, a.closest), Infinity);
  const isOutcross = ancestors.length === 0 || closest >= 5;
  let outcrossNote = '';
  if (isOutcross) {
    const coi = offspringCoiPct == null ? 'a low' : `a ${offspringCoiPct.toFixed(2)}%`;
    outcrossNote =
      ancestors.length === 0
        ? `No common ancestor appears on both sides within ${generations} generations — a paper outcross with ${coi} litter COI (broad founder base). Note: DNA may still show homozygosity.`
        : `The closest common ancestor is ${closest} generations back — a line-cross / near-outcross on paper, with ${coi} litter COI.`;
  }

  return { matches, isOutcross, outcrossNote };
}
