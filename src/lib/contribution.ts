// contribution.ts — memoized, depth-bounded ancestor-contribution analysis, and
// the Foundation report built on top of it. Pure and DB-agnostic (takes an
// AnimalLookup), like pedigreeAlgorithm.ts / linebreeding.ts.
//
// [DRAFT — requires Yuliya's review]
//
// WHY A DIFFERENT ALGORITHM FROM LINEBREEDING
// -------------------------------------------
// Linebreeding enumerates every individual cross path, which is only feasible to
// ~20 generations (the path count explodes: measured ~13 billion at 50 gens,
// ~1e33 at "all" on a 37k-dog DB). This module instead uses a LAYERED MEMOIZED
// DP that processes one generation at a time, accumulating per-ancestor totals.
// That runs in milliseconds even at "all generations" (~27 ms in measurement),
// because work is proportional to (active ancestors × generations), not to the
// number of paths.
//
// TWO QUANTITIES, computed together over the same layers:
//   • contribution — Wright's genetic blood contribution of an ancestor to the
//     subject = Σ (1/2)^generation over every path. Converges as depth grows.
//   • crosses      — number of occurrence paths within `crossCap` generations
//     (kept shallow so the integer stays meaningful and bounded).
//
// GENETICS POLICY (CLAUDE.md): COI (a dog's own inbreeding coefficient) is still
// never computed here — it is read from the DB elsewhere. `contribution` is a
// DIFFERENT, deterministic quantity and is computed here by owner approval
// (2026-06-25); the UI labels it as a computed estimate, not a validated COI.
//
// TERMINATION (CLAUDE.md non-negotiable): the layered walk stops when a
// generation has no known ancestors left (normal) or when it reaches `cap`
// (CONTRIBUTION_MAX_GENERATIONS by default) — a finite bound that also makes
// circular/erroneous pedigrees safe.

import { Animal } from './schema';
import {
  AnimalLookup,
  CONTRIBUTION_MAX_GENERATIONS,
  clampGenerations,
} from './pedigreeAlgorithm';

/** Per-ancestor accumulation (keyed externally by lower-cased Name). */
export interface AncestorContribution {
  /** Canonical Name from the ancestor's own row. */
  name: string;
  animal: Animal;
  /** Wright's blood contribution as a fraction in [0, 1] (×100 for %). */
  contribution: number;
  /** Closest generation at which the ancestor appears (1 = a parent). */
  closest: number;
  /** Occurrence paths within `crossCap` generations (may undercount very deep
   *  repeats by design — see crossCap). */
  crosses: number;
}

export interface ContributionResult {
  /** Subject Name (canonical if found). */
  subject: string;
  found: boolean;
  /** Generations actually walked before the lines ran out (≤ cap). */
  generations: number;
  /** The finite cap that bounded the walk. */
  cap: number;
  /** Distinct resolved ancestors (excludes the subject), keyed lower-cased. */
  byName: Map<string, AncestorContribution>;
}

/**
 * Compute every ancestor's genetic contribution to `subjectName` using the
 * layered DP described above.
 *
 * @param cap       hard generation ceiling (default = "all", bounded for safety)
 * @param crossCap  generations within which occurrence paths are counted
 */
export function computeContributions(
  lookup: AnimalLookup,
  subjectName: string,
  cap: number = CONTRIBUTION_MAX_GENERATIONS,
  crossCap = 20,
): ContributionResult {
  const hardCap = clampGenerations(cap, CONTRIBUTION_MAX_GENERATIONS);

  // Resolve-cache so each Name hits the DB at most once per call.
  const cache = new Map<string, Animal | null>();
  const resolve = (name: string): Animal | null => {
    const k = name.trim().toLowerCase();
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const a = lookup(name);
    cache.set(k, a);
    return a;
  };

  const subject = resolve(subjectName);
  const byName = new Map<string, AncestorContribution>();
  if (!subject) {
    return { subject: subjectName, found: false, generations: 0, cap: hardCap, byName };
  }

  // Layer state: for each ancestor Name reached at the current generation,
  // `weight` = Σ (1/2)^gen over paths to it AT THIS gen; `paths` = path count.
  interface Acc { weight: number; paths: number }
  let layer = new Map<string, Acc>([[subject.name.trim().toLowerCase(), { weight: 1, paths: 1 }]]);
  let generations = 0;

  for (let gen = 1; gen <= hardCap; gen++) {
    const next = new Map<string, Acc>();
    for (const [childKey, acc] of layer) {
      const child = cache.get(childKey) ?? null;
      if (!child) continue; // foundation/unknown — line ends here
      for (const parentName of [child.sire, child.dam]) {
        const key = parentName?.trim().toLowerCase();
        if (!key) continue;
        const parent = resolve(parentName as string);
        if (!parent) continue; // parent not in DB — line ends
        const cur = next.get(key) ?? { weight: 0, paths: 0 };
        cur.weight += acc.weight * 0.5;
        cur.paths += acc.paths;
        next.set(key, cur);
      }
    }
    if (next.size === 0) break; // every line has reached a foundation ancestor

    generations = gen;
    for (const [key, acc] of next) {
      const animal = cache.get(key)!; // resolved above
      const existing = byName.get(key);
      if (existing) {
        existing.contribution += acc.weight;
        if (gen <= crossCap) existing.crosses += acc.paths;
        // closest already set on first (shallower) encounter
      } else {
        byName.set(key, {
          name: animal!.name,
          animal: animal!,
          contribution: acc.weight,
          closest: gen,
          crosses: gen <= crossCap ? acc.paths : 0,
        });
      }
    }
    layer = next;
  }

  return { subject: subject.name, found: true, generations, cap: hardCap, byName };
}

// ---------------------------------------------------------------------------
// Foundation list parsing & report
// ---------------------------------------------------------------------------

/**
 * Parse a foundation-dog list from raw text (one name per line, or the first
 * column of a CSV). Trims, drops blank lines, strips a leading "name"/"dog"
 * header row, and de-duplicates case-insensitively while keeping first spelling.
 */
export function parseFoundationList(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    // Take the first CSV field; strip surrounding quotes/whitespace.
    let cell = lines[i].split(',')[0].trim().replace(/^"(.*)"$/, '$1').trim();
    if (!cell) continue;
    // Skip an obvious header on the first non-empty line.
    if (out.length === 0 && /^(name|dog|foundation)$/i.test(cell)) continue;
    const key = cell.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cell);
  }
  return out;
}

/** One foundation dog's result for a given subject. */
export interface FoundationRow {
  /** Name exactly as supplied in the list. */
  query: string;
  /** Canonical DB Name if the dog exists, else the query string. */
  name: string;
  /** The dog exists somewhere in the database. */
  inDatabase: boolean;
  /** The dog is an ancestor of the subject. */
  present: boolean;
  /** Genetic contribution fraction [0,1] (0 when absent). */
  contribution: number;
  /** Closest generation of appearance, or null when absent. */
  closest: number | null;
  /** Occurrence paths within the cross cap (0 when absent). */
  crosses: number;
}

export interface FoundationReport {
  subject: string;
  found: boolean;
  /** Generations walked by the contribution DP. */
  generations: number;
  rows: FoundationRow[];
  /** How many supplied foundation dogs are ancestors of the subject. */
  presentCount: number;
  /** Total foundation dogs supplied. */
  totalSupplied: number;
  /** Sum of present rows' contributions. NOTE: founders that are themselves
   *  ancestors of other founders overlap, so this can exceed the true distinct
   *  founder blood — shown with a caveat in the UI. */
  combinedContribution: number;
}

/**
 * Build the Foundation report: for each supplied foundation name, how present it
 * is in `subjectName`'s ancestry and how much it contributes genetically.
 */
export function buildFoundationReport(
  lookup: AnimalLookup,
  subjectName: string,
  foundationNames: string[],
  cap: number = CONTRIBUTION_MAX_GENERATIONS,
): FoundationReport {
  const contrib = computeContributions(lookup, subjectName, cap);

  const rows: FoundationRow[] = foundationNames.map((query) => {
    const key = query.trim().toLowerCase();
    const hit = contrib.byName.get(key);
    if (hit) {
      return {
        query,
        name: hit.name,
        inDatabase: true,
        present: true,
        contribution: hit.contribution,
        closest: hit.closest,
        crosses: hit.crosses,
      };
    }
    // Not an ancestor — does it exist in the DB at all?
    const row = lookup(query);
    return {
      query,
      name: row?.name ?? query,
      inDatabase: row !== null,
      present: false,
      contribution: 0,
      closest: null,
      crosses: 0,
    };
  });

  // Sort present dogs first, by contribution desc, then closest asc, then name.
  rows.sort(
    (a, b) =>
      Number(b.present) - Number(a.present) ||
      b.contribution - a.contribution ||
      (a.closest ?? Infinity) - (b.closest ?? Infinity) ||
      a.name.localeCompare(b.name),
  );

  const presentCount = rows.reduce((n, r) => n + (r.present ? 1 : 0), 0);
  const combinedContribution = rows.reduce((s, r) => s + r.contribution, 0);

  return {
    subject: contrib.subject,
    found: contrib.found,
    generations: contrib.generations,
    rows,
    presentCount,
    totalSupplied: foundationNames.length,
    combinedContribution,
  };
}
