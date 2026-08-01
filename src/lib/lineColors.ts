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
// (from a calm pastel palette, VIOLET first, no red/orange); within a family the
// tint's saturation/lightness is driven by each dog's INFLUENCE (Blood % =
// Σ ½^generation over its occurrences), so a closer/heavier ancestor reads darker
// and a deep one fades — the gradient tracks real weight, not the alphabet. Dogs
// that appear once are left white.
//
// Colours are derived deterministically from the tree, so the Pedigree and
// PedigreeTree tabs (same subject) always agree, and a given chart is stable
// across reloads.
//
// @author Yuliya Malinina <julia.malinina@gmail.com>

import type { PedigreeTreeNode } from './pedigreeAlgorithm';

const keyOfName = (name: string): string => name.trim().toLowerCase();

// Calm pastel palette for line families — VIOLET first, and the red/orange/yellow
// arc (hue ≈ 330°…60°) is deliberately excluded so no line ever reads as an alarm.
// Families beyond the list wrap around it.
// @author Yuliya Malinina <julia.malinina@gmail.com>
const LINE_HUES = [275, 250, 300, 210, 315, 190, 160, 120]; // violet→indigo→plum→blue→mauve→cyan→teal→green

/**
 * Map of lower-cased Name → CSS `hsl(...)` background for every repeated
 * ancestor. Names that appear only once are absent (rendered white).
 */
export function computeLineColors(root: PedigreeTreeNode): Map<string, string> {
  // 1. Count how many boxes each Name occupies, and accumulate its INFLUENCE
  //    (Blood % = Σ ½^generation over every box it fills — the same structural
  //    weight used elsewhere). Influence drives the within-line shade in step 3.
  const count = new Map<string, number>();
  const influence = new Map<string, number>();
  (function walk(n: PedigreeTreeNode): void {
    if (n.animal) {
      const k = keyOfName(n.animal.name);
      count.set(k, (count.get(k) ?? 0) + 1);
      influence.set(k, (influence.get(k) ?? 0) + Math.pow(0.5, n.generation));
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

  // 3. Group into families; one calm pastel HUE per family (violet first, no red),
  //    and grade saturation/lightness by each member's INFLUENCE (normalised over
  //    all repeats) so the most influential occurrence is deepest and deep, minor
  //    repeats stay pale — the same "brighter = heavier" reading holds across the
  //    whole chart, and within a line the shades still differ.
  // @author Yuliya Malinina <julia.malinina@gmail.com>
  const families = new Map<string, string[]>();
  for (const k of repeated) {
    const r = find(k);
    const list = families.get(r) ?? [];
    list.push(k);
    families.set(r, list);
  }

  // Normalise influence over the repeated dogs so the deepest tint maps to the
  // heaviest line-breeding contributor in this chart.
  let maxInf = 0;
  for (const k of repeated) maxInf = Math.max(maxInf, influence.get(k) ?? 0);

  const roots = [...families.keys()].sort();
  roots.forEach((r, i) => {
    const hue = LINE_HUES[i % LINE_HUES.length];
    for (const m of families.get(r)!) {
      const norm = maxInf > 0 ? (influence.get(m) ?? 0) / maxInf : 0; // 0..1, higher = heavier
      const sat = 30 + norm * 18;   // pastel: 30% → 48%
      const light = 92 - norm * 20; // 92% (faint) → 72% (deepest); no dark, no red
      colors.set(m, `hsl(${hue}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%)`);
    }
  });

  return colors;
}
