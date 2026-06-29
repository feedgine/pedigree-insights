// pedigreeAlgorithm.ts — the single source of truth for pedigree traversal
// (file-structure.md). Pure logic: it takes an `AnimalLookup` and knows nothing
// about SQLite or React, so the same code runs in the Electron main process
// (lookup backed by better-sqlite3) and in unit tests (lookup backed by an
// in-memory map). See docs/pedigree-algorithm.md.
//
// NON-NEGOTIABLE (CLAUDE.md): recursion is ALWAYS depth-limited AND cycle-
// guarded. Two independent stop conditions, both required:
//   1. maxGenerations — finite depth cap (UI default 3, clamp to 1..13).
//   2. visited Set on lowercased Name — terminates circular ancestry that the
//      depth limit alone would not (e.g. an animal listed as its own grandsire),
//      and de-duplicates a repeated ancestor so a heavily line-bred tree cannot
//      explode. An animal is expanded at most once (PRD §12.1).

import { Animal, keyOf } from './schema';

/** Resolve an animal by Name, or null if there is no such row (foundation/
 *  unknown ancestor). Implementations: a Map (tests) or a prepared SQL
 *  statement (main process). */
export type AnimalLookup = (name: string) => Animal | null;

/** Hard ceiling on generations the UI may request. Raised 10→13 on 2026-06-25
 *  to support the Linebreeding report at PedigreeOnline's default depth (see
 *  docs/open-items.md #8). The cap stays finite so recursion is always
 *  bounded; deep traversals remain protected by the per-call cycle guard. */
export const MAX_GENERATIONS_CAP = 13;
/** Product default depth (PRD §6.3/§7.2). */
export const DEFAULT_GENERATIONS = 3;

/** Linebreeding goes deeper than the bracket chart: cross-by-cross detail stays
 *  meaningful and fast to ~20 generations (measured on a 37k-dog DB; beyond that
 *  the per-path cross count explodes — use the Foundation/contribution view). */
export const LINEBREEDING_MAX_GENERATIONS = 20;

/** Hard safety ceiling for the memoized contribution DP ("all generations").
 *  Real pedigrees run out of known ancestors long before this; the cap only
 *  guarantees termination on circular/erroneous data (CLAUDE.md: recursion must
 *  always be depth-limited). */
export const CONTRIBUTION_MAX_GENERATIONS = 64;

/** Clamp a requested depth into 1..cap (default cap = MAX_GENERATIONS_CAP) so a
 *  bad UI value can never produce unbounded recursion. Pass a different cap for
 *  the deeper Linebreeding / contribution views. */
export function clampGenerations(n: number, cap: number = MAX_GENERATIONS_CAP): number {
  if (!Number.isFinite(n)) return Math.min(DEFAULT_GENERATIONS, cap);
  return Math.max(1, Math.min(cap, Math.floor(n)));
}

/** One position in the ancestor tree. `animal` is null for an unknown/missing
 *  ancestor (renders as an empty node, PRD §6.3). `repeated` marks an animal
 *  already expanded elsewhere in the tree (line-breeding/cycle): it is shown
 *  but NOT expanded again, and is not counted by groupByGeneration. */
export interface PedigreeTreeNode {
  /** Stable path id: '0', '0.S', '0.S.D', … (S = sire side, D = dam side). */
  id: string;
  generation: number;
  animal: Animal | null;
  repeated: boolean;
  sire: PedigreeTreeNode | null;
  dam: PedigreeTreeNode | null;
}

/**
 * Build the ancestor tree for `startName` up to `maxGenerations`.
 *
 * Two modes:
 *  - default (`expandAll = false`): a global `visited` set ensures each animal
 *    is expanded at most once; later encounters become `repeated` leaves and are
 *    skipped by groupByGeneration. This preserves the documented/regression-
 *    locked ANCESTOR-COUNT semantics (pedigree-algorithm.md, tests).
 *  - chart mode (`expandAll = true`): every occurrence of a repeated ancestor is
 *    fully drawn out, exactly as a printed pedigree chart shows it (each box
 *    filled). De-duplication is OFF; the only stop conditions are the finite
 *    depth `cap` AND a PER-PATH cycle guard (`onPath`) that halts a true
 *    ancestry loop (a dog listed within its own ancestry) without collapsing
 *    legitimate line-breeding repeats. Both guards are required (CLAUDE.md).
 *
 * Unknown names and names with no matching row become null-animal leaves.
 * A per-call resolve cache avoids re-querying the same Name (matters in chart
 * mode, where one ancestor can occupy many boxes).
 */
export function buildPedigreeTree(
  lookup: AnimalLookup,
  startName: string,
  maxGenerations: number = DEFAULT_GENERATIONS,
  expandAll: boolean = false
): PedigreeTreeNode {
  const cap = clampGenerations(maxGenerations);
  const visited = new Set<string>(); // global de-dup (default mode)
  const onPath = new Set<string>(); // per-path cycle guard (chart mode)

  const cache = new Map<string, Animal | null>();
  const resolve = (key: string): Animal | null => {
    const k = key.toLowerCase();
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const a = lookup(key);
    cache.set(k, a);
    return a;
  };

  function build(name: string | null, generation: number, id: string): PedigreeTreeNode {
    const node: PedigreeTreeNode = {
      id,
      generation,
      animal: null,
      repeated: false,
      sire: null,
      dam: null,
    };

    const key = keyOf(name);
    if (!key) return node; // unknown parent ('' / null) → empty leaf

    const animal = resolve(key);
    if (!animal) return node; // foundation ancestor: no row of its own → empty leaf

    node.animal = animal;
    const cycleKey = key.toLowerCase();

    if (expandAll) {
      // Stop only a TRUE ancestry loop on the current path; otherwise expand
      // every occurrence so each box in the chart is filled.
      if (onPath.has(cycleKey)) {
        node.repeated = true;
        return node;
      }
      if (generation < cap) {
        onPath.add(cycleKey);
        node.sire = build(animal.sire, generation + 1, `${id}.S`);
        node.dam = build(animal.dam, generation + 1, `${id}.D`);
        onPath.delete(cycleKey);
      }
      return node;
    }

    // Default mode: global de-dup (count semantics).
    if (visited.has(cycleKey)) {
      node.repeated = true; // already expanded under another line — show, don't recurse
      return node;
    }
    visited.add(cycleKey);
    if (generation < cap) {
      node.sire = build(animal.sire, generation + 1, `${id}.S`);
      node.dam = build(animal.dam, generation + 1, `${id}.D`);
    }
    return node;
  }

  return build(startName, 0, '0');
}

/**
 * Group resolved ancestors by generation. Counts each animal at most once
 * (skips `repeated` leaves and null-animal leaves), so the totals match the
 * documented/regression-locked figures from DogSampleData.db.
 */
export function groupByGeneration(root: PedigreeTreeNode): Map<number, Animal[]> {
  const result = new Map<number, Animal[]>();
  (function walk(node: PedigreeTreeNode): void {
    if (node.animal && !node.repeated) {
      const bucket = result.get(node.generation) ?? [];
      bucket.push(node.animal);
      result.set(node.generation, bucket);
    }
    if (node.sire) walk(node.sire);
    if (node.dam) walk(node.dam);
  })(root);
  return result;
}

/** Total resolved ancestors including the subject (generation 0). */
export function countAncestors(root: PedigreeTreeNode): number {
  let total = 0;
  for (const bucket of groupByGeneration(root).values()) total += bucket.length;
  return total;
}

/**
 * Descendant traversal (PRD §9 scaffold — not a v1 deliverable). Same dual
 * stop conditions. `childrenOf` returns the direct offspring of a Name.
 */
export type ChildrenLookup = (name: string) => Animal[];

export function fetchDescendants(
  childrenOf: ChildrenLookup,
  startName: string,
  maxGenerations: number = DEFAULT_GENERATIONS
): Map<number, Animal[]> {
  const cap = clampGenerations(maxGenerations);
  const result = new Map<number, Animal[]>();
  const visited = new Set<string>();

  (function traverse(name: string, generation: number): void {
    if (generation > cap) return;
    const cycleKey = name.trim().toLowerCase();
    if (!cycleKey || visited.has(cycleKey)) return;
    visited.add(cycleKey);

    const offspring = childrenOf(name);
    if (offspring.length === 0) return;
    result.set(generation, (result.get(generation) ?? []).concat(offspring));
    for (const child of offspring) traverse(child.name, generation + 1);
  })(startName, 1);

  return result;
}
