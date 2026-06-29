// lineColors.ts — assign a consistent pastel tint to every REPEATED ancestor in
// a pedigree chart, grouped into "line families" so that dogs from the same line
// get CLOSE SHADES of one hue. Pure (takes a PedigreeTreeNode), used by the
// bracket charts to make line-breeding pop visually.
//
// DEFINITION OF A "LINE" (deterministic, descent-based)
// -----------------------------------------------------
// A dog is "repeated" if its Name occupies more than one box in the chart. Two
// repeated dogs belong to the same line family when one descends from the other
// within the displayed pedigree — i.e. on some path the deeper repeated dog is an
// ANCESTOR of the shallower repeated dog. Connected by that relation (union-find),
// each family is a chain/cluster of line-breeding. Every family gets its own hue
// (spread around the colour wheel); members share that hue and differ only in
// lightness, so the same line reads as close shades. Dogs that appear once are
// left white.
//
// Colours are derived deterministically from the tree, so the Pedigree and
// PedigreeTree tabs (same subject) always agree, and a given chart is stable
// across reloads.

import type { PedigreeTreeNode } from './pedigreeAlgorithm';

const keyOfName = (name: string): string => name.trim().toLowerCase();

/**
 * Map of lower-cased Name → CSS `hsl(...)` background for every repeated
 * ancestor. Names that appear only once are absent (rendered white).
 */
export function computeLineColors(root: PedigreeTreeNode): Map<string, string> {
  // 1. Count how many boxes each Name occupies.
  const count = new Map<string, number>();
  (function walk(n: PedigreeTreeNode): void {
    if (n.animal) {
      const k = keyOfName(n.animal.name);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    if (n.sire) walk(n.sire);
    if (n.dam) walk(n.dam);
  })(root);

  const repeated = new Set([...count].filter(([, c]) => c >= 2).map(([k]) => k));
  const colors = new Map<string, string>();
  if (repeated.size === 0) return colors;

  // 2. Union-find over repeated dogs. While descending (subject → ancestors),
  //    carry the nearest repeated ancestor seen on the current path; union each
  //    repeated dog with it, linking a line of descent into one family.
  const parent = new Map<string, string>();
  for (const k of repeated) parent.set(k, k);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const nxt = parent.get(x)!;
      parent.set(x, r);
      x = nxt;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  (function walk(n: PedigreeTreeNode, lastRepeated: string | null): void {
    let next = lastRepeated;
    if (n.animal) {
      const k = keyOfName(n.animal.name);
      if (repeated.has(k)) {
        if (lastRepeated) union(k, lastRepeated);
        next = k;
      }
    }
    if (n.sire) walk(n.sire, next);
    if (n.dam) walk(n.dam, next);
  })(root, null);

  // 3. Group into families and assign one hue per family, graded lightness within.
  const families = new Map<string, string[]>();
  for (const k of repeated) {
    const r = find(k);
    const list = families.get(r) ?? [];
    list.push(k);
    families.set(r, list);
  }
  const roots = [...families.keys()].sort();
  roots.forEach((r, i) => {
    const hue = Math.round((360 * i) / roots.length);
    const members = families.get(r)!.sort();
    members.forEach((m, j) => {
      // Same hue, lightness spread 90% → 78% so a line reads as close shades.
      const light = members.length > 1 ? 90 - (j * 12) / (members.length - 1) : 87;
      colors.set(m, `hsl(${hue}, 60%, ${light.toFixed(1)}%)`);
    });
  });

  return colors;
}
